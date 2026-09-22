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
    generate_composite_sensor,
    calculate_target_correlations_all_sensors,
    diagnose_dataset_algorithms,
    construct_engineered_feature,
    calculate_rul_prognosis
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


class FeatureConstructionRequest(BaseModel):
    file_ids: Optional[List[str]] = None
    file_id: Optional[str] = None
    operation: str
    source_cols: List[str]
    new_sensor_name: str
    window_size: Optional[int] = 10
    constant_val: Optional[float] = 1.0


class RulPrognosisRequest(BaseModel):
    file_ids: Optional[List[str]] = None
    file_id: Optional[str] = None
    target_col: str
    threshold: float
    direction: Optional[str] = "increasing"
    model_type: Optional[str] = "exponential"
    forecast_horizon_max: Optional[int] = 1000


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
    excluded_columns_json: Optional[str] = Form(None),
    algorithm: Optional[str] = Form("all"),
    target_col: Optional[str] = Form(None)
):
    """
    Computes correlation matrices across selected or all numeric channels
    pooled across one or multiple test runs. Also returns feature rankings
    across ALL common sensors relative to a target variable, and dataset-level diagnosis.
    """
    from main import uploaded_files_cache

    dfs = _resolve_dataframes(file_id, file_ids_json, file, uploaded_files_cache)
    if not dfs:
        raise HTTPException(status_code=400, detail="No valid sensor dataset found.")

    # 1. Pool across ALL common numeric columns first
    pooled_df_all, all_common_cols = pool_datasets(dfs, None)
    if pooled_df_all.empty or len(all_common_cols) < 2:
        raise HTTPException(status_code=400, detail="At least 2 common numeric sensor columns are required across selected runs.")

    # Filter out any excluded / ruled-out sensors
    if excluded_columns_json:
        try:
            ex_cols = set(json.loads(excluded_columns_json))
            all_common_cols = [c for c in all_common_cols if c not in ex_cols]
        except Exception:
            pass

    if len(all_common_cols) < 2:
        raise HTTPException(status_code=400, detail="At least 2 common numeric sensor columns required after exclusions.")

    target_clean = target_col.strip() if target_col and str(target_col).strip() else None
    active_target = target_clean if (target_clean and target_clean in all_common_cols) else None

    # 2. Compute Target Correlations across ALL common sensors (O(M) complexity)
    all_sensors_rankings = {}
    if active_target:
        all_sensors_rankings = calculate_target_correlations_all_sensors(
            pooled_df_all, active_target, all_common_cols
        )

    # 3. Global multi-sensor dataset diagnosis across all channels
    global_diag = diagnose_dataset_algorithms(
        pooled_df_all, all_common_cols, target_col=active_target
    )

    # 4. Resolve columns for NxN matrix heatmap (cap at 20 for matrix rendering performance)
    requested_cols = None
    if columns_json:
        try:
            requested_cols = json.loads(columns_json)
        except Exception:
            pass

    req_algo = (algorithm or "all").lower()
    if requested_cols:
        sub_common = [c for c in requested_cols if c in all_common_cols]
        if active_target and active_target not in sub_common:
            sub_common = [active_target] + sub_common
        matrix_cols = sub_common[:20] if len(sub_common) >= 2 else all_common_cols[:20]
    elif active_target and all_sensors_rankings:
        # Use target + top 19 drivers under chosen algorithm
        ranking_key = req_algo if req_algo in all_sensors_rankings else "pearson"
        top_drivers = [r["column"] for r in all_sensors_rankings.get(ranking_key, [])[:19]]
        matrix_cols = [active_target] + top_drivers
    else:
        matrix_cols = all_common_cols[:20]

    df_active = pooled_df_all[matrix_cols]

    results = {
        "columns": matrix_cols,
        "all_common_columns": all_common_cols,
        "target_col": active_target,
        "all_sensors_rankings": all_sensors_rankings,
        "global_diagnosis": global_diag,
        "available_algorithms": ["pearson", "spearman", "kendall", "fastdtw", "mutual_info"],
        "matrices": {},
        "feature_rankings": {},
        "total_runs": len(dfs),
        "total_samples": len(pooled_df_all)
    }

    if req_algo in ("all", "pearson"):
        results["matrices"]["pearson"] = calculate_pearson_matrix(df_active, matrix_cols)["matrix"]
        results["feature_rankings"]["pearson"] = rank_features_from_matrix(matrix_cols, results["matrices"]["pearson"], target_col=active_target)

    if req_algo in ("all", "spearman"):
        results["matrices"]["spearman"] = calculate_spearman_matrix(df_active, matrix_cols)["matrix"]
        results["feature_rankings"]["spearman"] = rank_features_from_matrix(matrix_cols, results["matrices"]["spearman"], target_col=active_target)

    if req_algo in ("all", "kendall"):
        results["matrices"]["kendall"] = calculate_kendall_matrix(df_active, matrix_cols)["matrix"]
        results["feature_rankings"]["kendall"] = rank_features_from_matrix(matrix_cols, results["matrices"]["kendall"], target_col=active_target)

    if req_algo in ("all", "fastdtw"):
        results["matrices"]["fastdtw"] = calculate_dtw_matrix(df_active, matrix_cols)["matrix"]
        results["feature_rankings"]["fastdtw"] = rank_features_from_matrix(matrix_cols, results["matrices"]["fastdtw"], target_col=active_target)

    if req_algo in ("all", "mutual_info"):
        results["matrices"]["mutual_info"] = calculate_mutual_info_matrix(df_active, matrix_cols)["matrix"]
        results["feature_rankings"]["mutual_info"] = rank_features_from_matrix(matrix_cols, results["matrices"]["mutual_info"], target_col=active_target)

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


@router.post("/analytics/construct-feature")
async def construct_feature_endpoint(req: FeatureConstructionRequest):
    """
    Constructs an engineered feature (rolling stats, derivatives, multi-sensor operations,
    non-linear transforms) and appends it to all specified runs in cache.
    """
    from main import uploaded_files_cache

    fids = req.file_ids or ([req.file_id] if req.file_id else [])
    if not fids:
        raise HTTPException(status_code=400, detail="file_ids or file_id required.")

    target_dfs = []
    for fid in fids:
        if fid in uploaded_files_cache:
            target_dfs.append(uploaded_files_cache[fid]["df"])

    if not target_dfs:
        raise HTTPException(status_code=404, detail="None of the specified files were found in cache.")

    try:
        result = construct_engineered_feature(
            target_dfs=target_dfs,
            operation=req.operation,
            source_cols=req.source_cols,
            new_sensor_name=req.new_sensor_name,
            window_size=req.window_size or 10,
            constant_val=req.constant_val or 1.0
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature engineering failed: {str(e)}")


@router.post("/analytics/rul-prognosis")
async def rul_prognosis_endpoint(req: RulPrognosisRequest):
    """
    Computes Remaining Useful Life (RUL) and forward degradation trajectory projection
    for a chosen sensor reaching a critical failure threshold.
    """
    from main import uploaded_files_cache

    fids = req.file_ids or ([req.file_id] if req.file_id else [])
    dfs = []
    for fid in fids:
        if fid in uploaded_files_cache:
            dfs.append(uploaded_files_cache[fid]["df"])

    if not dfs:
        raise HTTPException(status_code=404, detail="No active sensor datasets found.")

    pooled_df, _ = pool_datasets(dfs, [req.target_col])
    if pooled_df.empty or req.target_col not in pooled_df.columns:
        raise HTTPException(status_code=400, detail=f"Target column '{req.target_col}' not found in pooled dataset.")

    try:
        result = calculate_rul_prognosis(
            df=pooled_df,
            target_col=req.target_col,
            threshold=req.threshold,
            direction=req.direction or "increasing",
            model_type=req.model_type or "exponential",
            forecast_horizon_max=req.forecast_horizon_max or 1000
        )
        result["total_runs"] = len(dfs)
        result["total_samples"] = len(pooled_df)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RUL Prognosis calculation failed: {str(e)}")


