import io
import json
import pandas as pd
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app.services.analytics import (
    pool_datasets,
    calculate_pearson_matrix,
    calculate_spearman_matrix,
    calculate_kendall_matrix,
    calculate_dtw_matrix,
    calculate_mutual_info_matrix,
    diagnose_sensor_pair,
    train_and_compare_models,
    rank_features_from_matrix,
    generate_composite_sensor
)

router = APIRouter()


class PairDiagnoseRequest(BaseModel):
    file_id: Optional[str] = None
    file_ids: Optional[List[str]] = None
    col_a: str
    col_b: str


class CompositeSensorRequest(BaseModel):
    file_ids: Optional[List[str]] = None
    file_id: Optional[str] = None
    source_cols: List[str]
    method: Optional[str] = "pca"
    new_sensor_name: Optional[str] = None


def _resolve_dataframes(
    file_id: Optional[str],
    file_ids_json: Optional[str],
    file: Optional[UploadFile],
    uploaded_files_cache: dict
) -> List[pd.DataFrame]:
    """Helper to resolve one or more DataFrames from request params."""
    dfs: List[pd.DataFrame] = []

    if file:
        content = file.file.read()
        fname = file.filename or "uploaded"
        if fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        elif fname.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        df.columns = [str(c).strip() for c in df.columns]
        dfs.append(df)
    elif file_ids_json:
        try:
            fids = json.loads(file_ids_json)
            for fid in fids:
                if fid in uploaded_files_cache:
                    dfs.append(uploaded_files_cache[fid]["df"])
        except Exception:
            pass
    elif file_id and file_id in uploaded_files_cache:
        dfs.append(uploaded_files_cache[file_id]["df"])

    return dfs


@router.post("/analytics/correlations")
async def calculate_correlations_endpoint(
    file_id: Optional[str] = Form(None),
    file_ids_json: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    columns_json: Optional[str] = Form(None),
    algorithm: Optional[str] = Form("all")
):
    """
    Computes correlation matrices across selected or all numeric channels
    pooled across one or multiple test runs. Also returns feature rankings
    sorted by coupling strength under each algorithm.
    """
    from main import uploaded_files_cache

    dfs = _resolve_dataframes(file_id, file_ids_json, file, uploaded_files_cache)
    if not dfs:
        raise HTTPException(status_code=400, detail="No valid sensor dataset found.")

    requested_cols = None
    if columns_json:
        try:
            requested_cols = json.loads(columns_json)
        except Exception:
            pass

    pooled_df, common_cols = pool_datasets(dfs, requested_cols)
    if pooled_df.empty or len(common_cols) < 2:
        raise HTTPException(status_code=400, detail="At least 2 common numeric sensor columns are required across selected runs.")

    cols = common_cols[:15] # default cap for matrix rendering performance
    df_active = pooled_df[cols]

    results = {
        "columns": cols,
        "available_algorithms": ["pearson", "spearman", "kendall", "fastdtw", "mutual_info"],
        "matrices": {},
        "feature_rankings": {},
        "total_runs": len(dfs),
        "total_samples": len(df_active)
    }

    req_algo = (algorithm or "all").lower()

    if req_algo in ("all", "pearson"):
        results["matrices"]["pearson"] = calculate_pearson_matrix(df_active, cols)["matrix"]
        results["feature_rankings"]["pearson"] = rank_features_from_matrix(cols, results["matrices"]["pearson"])

    if req_algo in ("all", "spearman"):
        results["matrices"]["spearman"] = calculate_spearman_matrix(df_active, cols)["matrix"]
        results["feature_rankings"]["spearman"] = rank_features_from_matrix(cols, results["matrices"]["spearman"])

    if req_algo in ("all", "kendall"):
        results["matrices"]["kendall"] = calculate_kendall_matrix(df_active, cols)["matrix"]
        results["feature_rankings"]["kendall"] = rank_features_from_matrix(cols, results["matrices"]["kendall"])

    if req_algo in ("all", "fastdtw"):
        results["matrices"]["fastdtw"] = calculate_dtw_matrix(df_active, cols)["matrix"]
        results["feature_rankings"]["fastdtw"] = rank_features_from_matrix(cols, results["matrices"]["fastdtw"])

    if req_algo in ("all", "mutual_info"):
        results["matrices"]["mutual_info"] = calculate_mutual_info_matrix(df_active, cols)["matrix"]
        results["feature_rankings"]["mutual_info"] = rank_features_from_matrix(cols, results["matrices"]["mutual_info"])

    return results


@router.post("/analytics/composite-sensor")
async def create_composite_sensor_endpoint(req: CompositeSensorRequest):
    """
    Generates a synthetic composite sensor channel via PCA (1st Principal Component)
    or Z-score Normalized Averaging and injects it in-place into the specified test run(s).
    """
    from main import uploaded_files_cache

    fids: List[str] = []
    if req.file_ids:
        fids = [fid for fid in req.file_ids if fid in uploaded_files_cache]
    elif req.file_id and req.file_id in uploaded_files_cache:
        fids = [req.file_id]

    if not fids:
        raise HTTPException(status_code=404, detail="Selected run(s) not found in workspace cache.")

    dfs = [uploaded_files_cache[fid]["df"] for fid in fids]

    try:
        result = generate_composite_sensor(
            dfs=dfs,
            source_cols=req.source_cols,
            method=req.method or "pca",
            new_sensor_name=req.new_sensor_name
        )

        # Update columns metadata in cache for all affected files
        for fid in fids:
            file_info = uploaded_files_cache[fid]
            existing_cols = [c["name"] for c in file_info.get("columns", [])]
            if result["new_sensor_name"] not in existing_cols:
                file_info["columns"].append(result["sensor_column"])

        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/analytics/diagnose-pair")
async def diagnose_pair_endpoint(req: PairDiagnoseRequest):
    """
    Compares all 5 correlation algorithms side-by-side for two selected sensors
    across one or multiple test runs.
    """
    from main import uploaded_files_cache

    dfs: List[pd.DataFrame] = []
    if req.file_ids:
        for fid in req.file_ids:
            if fid in uploaded_files_cache:
                dfs.append(uploaded_files_cache[fid]["df"])
    elif req.file_id and req.file_id in uploaded_files_cache:
        dfs.append(uploaded_files_cache[req.file_id]["df"])

    if not dfs:
        raise HTTPException(status_code=404, detail="Selected run(s) not found in workspace cache.")

    pooled_df, common_cols = pool_datasets(dfs, [req.col_a, req.col_b])
    if req.col_a not in common_cols or req.col_b not in common_cols or len(pooled_df) < 5:
        raise HTTPException(status_code=400, detail="One or both sensor columns not present in all selected runs or insufficient rows.")

    diag = diagnose_sensor_pair(pooled_df, req.col_a, req.col_b)
    diag["total_runs"] = len(dfs)
    diag["total_samples"] = len(pooled_df)
    return diag


@router.post("/analytics/ml-train")
async def ml_train_endpoint(
    file_id: Optional[str] = Form(None),
    file_ids_json: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    feature_cols_json: str = Form(...),
    target_col: str = Form(...),
    test_size: float = Form(0.2)
):
    """
    Trains and compares Random Forest, XGBoost, and LightGBM regressors
    on selected feature sensors to predict target variable trajectory
    across one or multiple pooled test runs.
    """
    from main import uploaded_files_cache

    dfs = _resolve_dataframes(file_id, file_ids_json, file, uploaded_files_cache)
    if not dfs:
        raise HTTPException(status_code=400, detail="No sensor dataset found.")

    try:
        feature_cols = json.loads(feature_cols_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid feature_cols_json: {str(e)}")

    if not feature_cols:
        raise HTTPException(status_code=400, detail="At least 1 feature sensor column must be selected.")

    all_needed = list(set(feature_cols + [target_col]))
    pooled_df, common_cols = pool_datasets(dfs, all_needed)

    if target_col not in common_cols:
        raise HTTPException(status_code=400, detail=f"Target column '{target_col}' not common across all selected runs.")

    for f in feature_cols:
        if f not in common_cols:
            raise HTTPException(status_code=400, detail=f"Feature column '{f}' not common across all selected runs.")

    if len(pooled_df) < 15:
        raise HTTPException(status_code=400, detail="Insufficient pooled rows (minimum 15 required for train/test split).")

    try:
        result = train_and_compare_models(
            df=pooled_df,
            feature_cols=feature_cols,
            target_col=target_col,
            test_size=test_size
        )
        result["total_runs"] = len(dfs)
        result["total_samples"] = len(pooled_df)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Model training error: {str(e)}")

