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
    test_file: Optional[UploadFile] = File(None),
    target_col: str = Form("FMC%"),
    k_sigma: float = Form(2.0),
    pct_margin: Optional[float] = Form(None),
    baseline_profile_json: Optional[str] = Form(None)
):
    """
    Evaluates a test run against the active baseline profile.
    Computes Corridor Violation %, Cumulative Absolute Deviation,
    and Pearson Slope Correlation.
    """
    if baseline_profile_json:
        try:
            baseline_profile = json.loads(baseline_profile_json)
            current_baseline_cache["active"] = baseline_profile
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid baseline_profile JSON: {str(e)}")
    elif "active" in current_baseline_cache:
        baseline_profile = current_baseline_cache["active"]
    else:
        raise HTTPException(status_code=400, detail="No active multi-reference baseline built yet. Build baseline first.")

    test_df = None
    file_name = "Test_Run"

    from main import uploaded_files_cache

    if test_file:
        file_name = test_file.filename
        content = await test_file.read()
        if file_name.endswith((".xlsx", ".xls")):
            test_df = pd.read_excel(io.BytesIO(content))
        elif file_name.endswith(".csv"):
            test_df = pd.read_csv(io.BytesIO(content))
        test_df.columns = [str(c).strip() for c in test_df.columns]
    elif test_file_id and test_file_id in uploaded_files_cache:
        cached = uploaded_files_cache[test_file_id]
        test_df = cached["df"]
        file_name = cached["name"]

    if test_df is None or test_df.empty:
        raise HTTPException(status_code=400, detail="No test data provided or test file not found in cache.")

    eval_result = evaluate_test_run_corridor(
        test_df=test_df,
        test_file_name=file_name,
        baseline_profile=baseline_profile,
        target_col=target_col,
        k_sigma=k_sigma,
        pct_margin=pct_margin
    )

    return eval_result
