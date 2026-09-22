import io
import json
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np

from app.services.baseline import (
    build_multi_reference_baseline,
    evaluate_test_run_corridor
)
from app.services.alignment import (
    match_columns_lexical,
    compute_pair_score
)

router = APIRouter()

# Global cache for the active multi-reference baseline profile
current_baseline_cache: Dict[str, Any] = {}

class LexicalMatchRequest(BaseModel):
    ref_cols: List[str]
    test_cols: List[str]
    threshold: Optional[float] = 0.85

class PairScoreRequest(BaseModel):
    ref_file_id: Optional[str] = None
    test_file_id: Optional[str] = None
    ref_col: str
    test_col: str
    ref_values: Optional[List[float]] = None
    test_values: Optional[List[float]] = None

class EvaluateBaselineRequest(BaseModel):
    test_file_id: Optional[str] = None
    target_col: Optional[str] = "FMC%"
    k_sigma: Optional[float] = 2.0
    pct_margin: Optional[float] = None

@router.post("/alignment/lexical-match")
async def lexical_match_endpoint(req: LexicalMatchRequest):
    """
    Stage 1: Deterministic Lexical Matcher.
    Matches columns via exact case-insensitive, normalized token,
    and high-confidence Levenshtein distance (>= 0.85).
    """
    result = match_columns_lexical(
        ref_cols=req.ref_cols,
        test_cols=req.test_cols,
        threshold=req.threshold or 0.85
    )
    return result

@router.post("/alignment/pair-score")
async def pair_score_endpoint(req: PairScoreRequest):
    """
    Stage 3: On-Demand Dynamic Scoring.
    Computes Pearson r and DTW distance for a single assigned pair.
    """
    s_ref = None
    s_test = None

    # Retrieve from cache if IDs provided
    from main import uploaded_files_cache
    if req.ref_file_id and req.ref_file_id in uploaded_files_cache:
        df_ref = uploaded_files_cache[req.ref_file_id]["df"]
        if req.ref_col in df_ref.columns:
            s_ref = pd.to_numeric(df_ref[req.ref_col], errors="coerce").dropna().values

    if req.test_file_id and req.test_file_id in uploaded_files_cache:
        df_test = uploaded_files_cache[req.test_file_id]["df"]
        if req.test_col in df_test.columns:
            s_test = pd.to_numeric(df_test[req.test_col], errors="coerce").dropna().values

    # Fallback to direct raw values if passed
    if s_ref is None and req.ref_values:
        s_ref = np.array(req.ref_values, dtype=float)
    if s_test is None and req.test_values:
        s_test = np.array(req.test_values, dtype=float)

    if s_ref is None or s_test is None or len(s_ref) == 0 or len(s_test) == 0:
        return {
            "ref_col": req.ref_col,
            "test_col": req.test_col,
            "pearson": 0.0,
            "dtw": 0.0,
            "hybrid": 0.0,
            "error": "Could not retrieve numeric series for pair scoring."
        }

    scores = compute_pair_score(s_ref, s_test)
    return {
        "ref_col": req.ref_col,
        "test_col": req.test_col,
        **scores
    }

@router.post("/baseline/build")
async def build_baseline_endpoint(
    files: List[UploadFile] = File(...),
    target_col: str = Form("FMC%"),
    direction: str = Form("downward"),
    threshold_pct: float = Form(2.0)
):
    """
    Feature 3: Multi-Reference Baseline Ingestion & Averaging.
    Ingests multiple reference runs (CSV/XLSX), verifies monotonicity,
    resamples to 500-point uniform synthetic progress grid, computes
    Schema Availability Matrix, and calculates mu and sigma envelopes.
    """
    if not files:
        raise HTTPException(status_code=400, detail="At least one reference file must be provided.")

    runs_data = []

    for file in files:
        fname = file.filename
        content = await file.read()
        try:
            if fname.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(content))
            elif fname.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            else:
                raise ValueError("Unsupported format. Use CSV or XLSX.")
                
            df.columns = [str(c).strip() for c in df.columns]
            runs_data.append({
                "name": fname,
                "df": df
            })
        except Exception as e:
            runs_data.append({
                "name": fname,
                "df": None,
                "read_error": str(e)
            })

    result = build_multi_reference_baseline(
        runs_data=runs_data,
        target_col=target_col,
        direction=direction,
        grid_points=500,
        threshold_pct=threshold_pct
    )

    if result["success"]:
        current_baseline_cache["active"] = result

    return result

class BuildWorkspaceBaselineRequest(BaseModel):
    file_ids: List[str]
    target_col: Optional[str] = "FMC%"
    direction: Optional[str] = "downward"
    threshold_pct: Optional[float] = 2.0

@router.post("/baseline/build-from-workspace")
async def build_baseline_from_workspace_endpoint(req: BuildWorkspaceBaselineRequest):
    """
    Builds a multi-reference baseline directly from workspace runs stored in in-memory cache.
    """
    from main import uploaded_files_cache
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="At least one workspace file ID must be specified.")

    runs_data = []
    for fid in req.file_ids:
        if fid in uploaded_files_cache:
            file_info = uploaded_files_cache[fid]
            df = file_info.get("df")
            runs_data.append({
                "name": file_info.get("name", fid),
                "df": df.copy() if df is not None else None
            })

    if not runs_data:
        raise HTTPException(status_code=404, detail="None of the specified runs were found in workspace cache.")

    result = build_multi_reference_baseline(
        runs_data=runs_data,
        target_col=req.target_col or "FMC%",
        direction=req.direction or "downward",
        grid_points=500,
        threshold_pct=req.threshold_pct or 2.0
    )

    if result.get("success"):
        current_baseline_cache["active"] = result

    return result

@router.get("/baseline/active")
async def get_active_baseline():
    """
    Returns the currently active baseline profile.
    """
    if "active" not in current_baseline_cache:
        return {"active": None}
    return {"active": current_baseline_cache["active"]}

@router.post("/baseline/evaluate")
async def evaluate_baseline_endpoint(
    test_file_id: Optional[str] = Form(None),
    test_file_ids_json: Optional[str] = Form(None),
    test_file: Optional[UploadFile] = File(None),
    target_col: str = Form("FMC%"),
    k_sigma: float = Form(2.0),
    pct_margin: Optional[float] = Form(None),
    baseline_profile_file: Optional[UploadFile] = File(None),
    baseline_profile_json: Optional[str] = Form(None),
    mappings_json: Optional[str] = Form(None)
):
    """
    Evaluates one or multiple test runs against the active baseline profile.
    Computes Corridor Violation %, Cumulative Absolute Deviation,
    and Pearson Slope Correlation. Supports column mappings from Column Alignment.
    """
    baseline_profile = None
    if baseline_profile_file:
        try:
            content = await baseline_profile_file.read()
            baseline_profile = json.loads(content.decode("utf-8"))
            current_baseline_cache["active"] = baseline_profile
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid baseline_profile file: {str(e)}")
    elif baseline_profile_json:
        try:
            baseline_profile = json.loads(baseline_profile_json)
            current_baseline_cache["active"] = baseline_profile
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid baseline_profile JSON: {str(e)}")
    elif "active" in current_baseline_cache:
        baseline_profile = current_baseline_cache["active"]
    else:
        raise HTTPException(status_code=400, detail="No active multi-reference baseline built yet. Build baseline first.")

    mappings = None
    if mappings_json:
        try:
            mappings = json.loads(mappings_json)
        except Exception:
            mappings = None

    from main import uploaded_files_cache

    # Determine all test runs to evaluate
    runs_to_eval = []

    if test_file:
        fname = test_file.filename
        content = await test_file.read()
        if fname.endswith((".xlsx", ".xls")):
            tdf = pd.read_excel(io.BytesIO(content))
        elif fname.endswith(".csv"):
            tdf = pd.read_csv(io.BytesIO(content))
        else:
            tdf = pd.DataFrame()
        tdf.columns = [str(c).strip() for c in tdf.columns]
        runs_to_eval.append({"id": "uploaded_test", "name": fname, "df": tdf})

    if test_file_ids_json:
        try:
            parsed_ids = json.loads(test_file_ids_json)
            if isinstance(parsed_ids, list):
                for fid in parsed_ids:
                    if fid in uploaded_files_cache:
                        c = uploaded_files_cache[fid]
                        runs_to_eval.append({"id": fid, "name": c["name"], "df": c["df"]})
        except Exception:
            pass

    if not runs_to_eval and test_file_id and test_file_id in uploaded_files_cache:
        c = uploaded_files_cache[test_file_id]
        runs_to_eval.append({"id": test_file_id, "name": c["name"], "df": c["df"]})

    if not runs_to_eval:
        raise HTTPException(status_code=400, detail="No test data provided or test file not found in cache.")

    evaluations_by_run = {}
    runs_summary = []

    for r in runs_to_eval:
        eval_result = evaluate_test_run_corridor(
            test_df=r["df"],
            test_file_name=r["name"],
            baseline_profile=baseline_profile,
            target_col=target_col,
            k_sigma=k_sigma,
            pct_margin=pct_margin,
            mappings=mappings
        )

        evaluations_by_run[r["id"]] = eval_result

        if eval_result.get("success", False):
            ch_evals = eval_result.get("channel_evaluations", {})
            v_pcts = [item["violation_pct"] for item in ch_evals.values()] if ch_evals else [0.0]
            mean_v = round(float(np.mean(v_pcts)), 2) if v_pcts else 0.0
            max_v = round(float(np.max(v_pcts)), 2) if v_pcts else 0.0
            verdict = "PASS" if mean_v < 5.0 else ("WARN" if mean_v < 15.0 else "DEFECT")

            runs_summary.append({
                "file_id": r["id"],
                "file_name": r["name"],
                "success": True,
                "evaluated_channels_count": len(ch_evals),
                "mean_violation_pct": mean_v,
                "max_violation_pct": max_v,
                "verdict": verdict
            })
        else:
            runs_summary.append({
                "file_id": r["id"],
                "file_name": r["name"],
                "success": False,
                "error": eval_result.get("error", "Evaluation failed"),
                "evaluated_channels_count": 0,
                "mean_violation_pct": 0.0,
                "max_violation_pct": 0.0,
                "verdict": "ERROR"
            })

    # Pick primary run (first successful run, or first run)
    primary_id = runs_to_eval[0]["id"]
    for s in runs_summary:
        if s["success"]:
            primary_id = s["file_id"]
            break

    primary_eval = evaluations_by_run.get(primary_id, {})

    if not primary_eval.get("success", False) and len(runs_to_eval) == 1:
        raise HTTPException(status_code=400, detail=primary_eval.get("error", "Evaluation failed"))

    # Return unified response with backward compatibility + batch structures
    response = dict(primary_eval)
    response["is_batch"] = len(runs_to_eval) > 1
    response["evaluations_by_run"] = evaluations_by_run
    response["runs_summary"] = runs_summary
    response["primary_run_id"] = primary_id

    return response
