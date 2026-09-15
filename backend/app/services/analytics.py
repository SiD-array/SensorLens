import time
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
import scipy.stats
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_selection import mutual_info_regression
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import lightgbm as lgb

try:
    from similarity import interpolate_series
except ImportError:
    try:
        from backend.similarity import interpolate_series
    except ImportError:
        def interpolate_series(series: np.ndarray, target_length: int = 30) -> np.ndarray:
            n = len(series)
            if n == 0:
                return np.zeros(target_length)
            if n == target_length:
                return series
            x_old = np.linspace(0, 1, n)
            x_new = np.linspace(0, 1, target_length)
            return np.interp(x_new, x_old, series)



def rank_features_from_matrix(
    columns: List[str], 
    matrix: List[List[float]],
    target_col: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Ranks columns either by their direct correlation / coupling with a specified target_col,
    or by their mean coupling strength score with all other columns.
    """
    if not columns or not matrix:
        return []

    n = len(columns)
    if n == 1:
        return [{"column": columns[0], "score": 1.0, "signed_score": 1.0, "rank": 1, "direction": "positive"}]

    scored = []

    if target_col and target_col in columns:
        t_idx = columns.index(target_col)
        for i, col in enumerate(columns):
            if i == t_idx:
                continue
            val = matrix[t_idx][i]
            if val is None or np.isnan(val):
                val = 0.0
            signed_val = round(float(val), 4)
            abs_val = round(abs(signed_val), 4)
            direction = "positive" if signed_val >= 0 else "negative"
            scored.append({
                "column": col,
                "score": abs_val,
                "signed_score": signed_val,
                "direction": direction
            })
    else:
        for i, col in enumerate(columns):
            other_scores = []
            for j in range(n):
                if i != j:
                    val = matrix[i][j]
                    if val is not None and not np.isnan(val):
                        other_scores.append(abs(float(val)))
            mean_score = float(np.mean(other_scores)) if other_scores else 0.0
            scored.append({
                "column": col,
                "score": round(mean_score, 4),
                "signed_score": round(mean_score, 4),
                "direction": "positive"
            })

    # Sort descending by score (magnitude)
    scored.sort(key=lambda x: x["score"], reverse=True)
    for idx, item in enumerate(scored):
        item["rank"] = idx + 1

    return scored



def generate_composite_sensor(
    dfs: List[pd.DataFrame],
    source_cols: List[str],
    method: str = "pca",
    new_sensor_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Combines multiple redundant sensor channels into a single synthetic sensor channel
    using either PCA (1st Principal Component) or Z-score Normalized Averaging.
    The new channel is injected in-place into all provided DataFrames.
    """
    if not dfs:
        raise ValueError("At least one dataset DataFrame is required.")
    if len(source_cols) < 2:
        raise ValueError("At least 2 sensor channels are required to generate a composite sensor.")

    method = (method or "pca").lower().strip()
    clean_sources = [str(c).strip() for c in source_cols]

    if not new_sensor_name or not str(new_sensor_name).strip():
        prefix = "PCA" if method == "pca" else "Avg"
        new_sensor_name = f"{prefix}_{'_'.join(clean_sources[:2])}"
    else:
        new_sensor_name = str(new_sensor_name).strip()

    variance_explained = None
    primary_series = None

    for df in dfs:
        # Check source cols exist
        missing = [c for c in clean_sources if c not in df.columns]
        if missing:
            raise ValueError(f"Columns {missing} not present in dataset.")

        # Clean numeric data
        sub = df[clean_sources].copy()
        for c in clean_sources:
            sub[c] = pd.to_numeric(sub[c], errors="coerce")
        sub = sub.ffill().bfill().fillna(0)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(sub.values)

        if method == "pca":
            pca = PCA(n_components=1)
            pc1 = pca.fit_transform(scaled).flatten()
            variance_explained = round(float(pca.explained_variance_ratio_[0] * 100), 2)
            df[new_sensor_name] = pc1
        else:
            # Z-score normalized average
            avg_series = scaled.mean(axis=1)
            df[new_sensor_name] = avg_series
            variance_explained = None

        if primary_series is None:
            primary_series = df[new_sensor_name]

    # Generate SensorColumn metadata using primary df
    c_min = float(primary_series.min())
    c_max = float(primary_series.max())
    c_mean = float(primary_series.mean())
    c_std = float(primary_series.std()) if len(primary_series) > 1 else 0.0

    sparkline_pts = interpolate_series(primary_series.values, 30).tolist()

    sensor_column_meta = {
        "name": new_sensor_name,
        "type": "numeric",
        "total_rows": len(primary_series),
        "missing_count": 0,
        "min": c_min,
        "max": c_max,
        "mean": c_mean,
        "std": c_std,
        "sparkline": sparkline_pts
    }

    return {
        "success": True,
        "new_sensor_name": new_sensor_name,
        "method": method,
        "variance_explained_pct": variance_explained,
        "sensor_column": sensor_column_meta,
        "source_columns": clean_sources
    }



def pool_datasets(dfs: List[pd.DataFrame], columns: Optional[List[str]] = None) -> Tuple[pd.DataFrame, List[str]]:
    """
    Pools multiple dataframes across test runs by finding common columns
    and concatenating row-wise with reset index.
    """
    if not dfs:
        return pd.DataFrame(), []

    # Clean columns
    cleaned_dfs = []
    for df in dfs:
        d = df.copy()
        d.columns = [str(c).strip() for c in d.columns]
        cleaned_dfs.append(d)

    # Intersect available numeric columns across all datasets
    common_cols = None
    for d in cleaned_dfs:
        numeric_in_d = set()
        for c in d.columns:
            s = pd.to_numeric(d[c], errors="coerce")
            if s.notnull().sum() > 3:
                numeric_in_d.add(c)
        if common_cols is None:
            common_cols = numeric_in_d
        else:
            common_cols = common_cols.intersection(numeric_in_d)

    common_cols_list = sorted(list(common_cols)) if common_cols else []

    if columns:
        selected_cols = [c for c in columns if c in common_cols_list]
    else:
        selected_cols = common_cols_list

    if not selected_cols:
        return pd.DataFrame(), []

    pooled_df = pd.concat([d[selected_cols] for d in cleaned_dfs], ignore_index=True)
    # Convert to numeric
    for c in selected_cols:
        pooled_df[c] = pd.to_numeric(pooled_df[c], errors="coerce")
    pooled_df = pooled_df.dropna().reset_index(drop=True)

    return pooled_df, selected_cols


# =====================================================================
# 1. CORRELATION ALGORITHMS EXPLORER & BENCHMARK
# =====================================================================

def calculate_pearson_matrix(df: pd.DataFrame, columns: List[str]) -> Dict[str, Any]:
    """Calculates pairwise Pearson correlation (linear relationships)."""
    sub = df[columns].copy()
    corr = sub.corr(method="pearson").fillna(0.0)
    return {
        "columns": columns,
        "matrix": corr.values.tolist(),
        "algorithm": "pearson"
    }


def calculate_spearman_matrix(df: pd.DataFrame, columns: List[str]) -> Dict[str, Any]:
    """Calculates pairwise Spearman rank correlation (monotonic curves)."""
    sub = df[columns].copy()
    corr = sub.corr(method="spearman").fillna(0.0)
    return {
        "columns": columns,
        "matrix": corr.values.tolist(),
        "algorithm": "spearman"
    }


def calculate_kendall_matrix(df: pd.DataFrame, columns: List[str]) -> Dict[str, Any]:
    """Calculates pairwise Kendall's Tau correlation (concordant/discordant pairs)."""
    sub = df[columns].copy()
    # Use max 500 rows if very large to prevent O(N^2) lag
    if len(sub) > 600:
        sub = sub.iloc[::max(1, len(sub) // 500)]
    corr = sub.corr(method="kendall").fillna(0.0)
    return {
        "columns": columns,
        "matrix": corr.values.tolist(),
        "algorithm": "kendall"
    }


def calculate_dtw_matrix(df: pd.DataFrame, columns: List[str], max_points: int = 250) -> Dict[str, Any]:
    """
    Calculates pairwise Dynamic Time Warping (FastDTW) similarity matrix.
    Normalized to [0.0, 1.0] where 1.0 is identical waveform shape.
    """
    sub = df[columns].copy()
    if len(sub) > max_points:
        step = max(1, len(sub) // max_points)
        sub = sub.iloc[::step]

    n = len(columns)
    mat = np.ones((n, n), dtype=float)

    # Normalize each column to [0, 1] range for fair DTW distance
    norm_series = {}
    for c in columns:
        vals = pd.to_numeric(sub[c], errors="coerce").interpolate().bfill().ffill().values
        denom = np.max(vals) - np.min(vals)
        if denom == 0 or np.isnan(denom):
            norm_series[c] = np.zeros(len(vals))
        else:
            norm_series[c] = (vals - np.min(vals)) / denom

    for i in range(n):
        for j in range(i + 1, n):
            c1, c2 = columns[i], columns[j]
            s1, s2 = norm_series[c1], norm_series[c2]
            try:
                dist, _ = fastdtw(s1, s2, dist=lambda a, b: abs(a - b))
                # Average distance per step
                norm_dist = dist / max(len(s1), 1)
                sim = 1.0 / (1.0 + norm_dist)
            except Exception:
                sim = 0.0
            mat[i][j] = round(float(sim), 4)
            mat[j][i] = round(float(sim), 4)

    return {
        "columns": columns,
        "matrix": mat.tolist(),
        "algorithm": "fastdtw"
    }


def calculate_mutual_info_matrix(df: pd.DataFrame, columns: List[str], max_points: int = 400) -> Dict[str, Any]:
    """
    Calculates Mutual Information matrix to capture non-linear, parabolic,
    and multi-modal dependencies across sensors.
    """
    sub = df[columns].copy()
    if len(sub) > max_points:
        step = max(1, len(sub) // max_points)
        sub = sub.iloc[::step]

    # Pre-clean
    clean_sub = sub.interpolate().bfill().ffill().fillna(0.0)
    n = len(columns)
    mat = np.ones((n, n), dtype=float)

    for i in range(n):
        c1 = columns[i]
        x = clean_sub[[c1]].values
        for j in range(i + 1, n):
            c2 = columns[j]
            y = clean_sub[c2].values
            try:
                # Discretize or continuous mutual information
                mi = mutual_info_regression(x, y, random_state=42)[0]
                # Scale relative score into [0, 1] using saturation tanh
                score = float(np.tanh(mi))
            except Exception:
                score = 0.0
            mat[i][j] = round(score, 4)
            mat[j][i] = round(score, 4)

    return {
        "columns": columns,
        "matrix": mat.tolist(),
        "algorithm": "mutual_info"
    }


def diagnose_sensor_pair(df: pd.DataFrame, col_a: str, col_b: str) -> Dict[str, Any]:
    """
    Deep-dive diagnostic comparing all 5 algorithms on a single pair of sensors.
    Identifies non-linearity, monotonicity, phase lag, and recommends the best algorithm.
    """
    sub = df[[col_a, col_b]].dropna().copy()
    if len(sub) < 5:
        return {
            "col_a": col_a,
            "col_b": col_b,
            "error": "Insufficient valid data points to diagnose relationship."
        }

    s_a = pd.to_numeric(sub[col_a], errors="coerce").interpolate().bfill().ffill().values
    s_b = pd.to_numeric(sub[col_b], errors="coerce").interpolate().bfill().ffill().values

    # 1. Pearson
    try:
        r_pearson, _ = scipy.stats.pearsonr(s_a, s_b)
        if np.isnan(r_pearson): r_pearson = 0.0
    except Exception:
        r_pearson = 0.0

    # 2. Spearman
    try:
        rho_spearman, _ = scipy.stats.spearmanr(s_a, s_b)
        if np.isnan(rho_spearman): rho_spearman = 0.0
    except Exception:
        rho_spearman = 0.0

    # 3. Kendall
    try:
        tau_kendall, _ = scipy.stats.kendalltau(s_a, s_b)
        if np.isnan(tau_kendall): tau_kendall = 0.0
    except Exception:
        tau_kendall = 0.0

    # 4. FastDTW
    try:
        d_a = (s_a - np.min(s_a)) / max(np.max(s_a) - np.min(s_a), 1e-6)
        d_b = (s_b - np.min(s_b)) / max(np.max(s_b) - np.min(s_b), 1e-6)
        dist, _ = fastdtw(d_a, d_b, dist=lambda a, b: abs(a - b))
        dtw_sim = float(1.0 / (1.0 + (dist / len(d_a))))
    except Exception:
        dtw_sim = 0.0

    # 5. Mutual Info
    try:
        mi_raw = mutual_info_regression(s_a.reshape(-1, 1), s_b, random_state=42)[0]
        mi_score = float(np.tanh(mi_raw))
    except Exception:
        mi_score = 0.0

    # Algorithmic Recommendation Logic
    recommendation = "Pearson"
    explanation = ""
    characteristics = []

    diff_spearman_pearson = abs(rho_spearman) - abs(r_pearson)
    
    if abs(r_pearson) >= 0.85:
        characteristics.append("Strong Linear Correlation")
        recommendation = "Pearson Correlation"
        explanation = f"Sensors share a strong proportional relationship (r = {r_pearson:.2f}). Pearson is optimal and computationally efficient."
    elif diff_spearman_pearson >= 0.20:
        characteristics.append("Non-Linear Monotonic Trend")
        recommendation = "Spearman Rank"
        explanation = f"Spearman rank ({rho_spearman:.2f}) significantly outperforms Pearson ({r_pearson:.2f}). The data curve bends monotonically without being strictly a straight line."
    elif mi_score >= 0.60 and abs(r_pearson) < 0.40:
        characteristics.append("Complex Non-Linear / Cyclic Pattern")
        recommendation = "Mutual Information"
        explanation = f"High Mutual Information ({mi_score:.2f}) detected despite weak linear correlation ({r_pearson:.2f}). This indicates parabolic, multi-state, or non-linear sensor coupling."
    elif dtw_sim >= 0.70 and abs(r_pearson) < 0.50:
        characteristics.append("Time-Lagged / Speed-Varying Waveform")
        recommendation = "FastDTW (Dynamic Time Warping)"
        explanation = f"FastDTW shape similarity ({dtw_sim:.2f}) indicates curves match in shape but have starting lags or phase shifts that distort point-by-point linear correlations."
    else:
        characteristics.append("Moderate Linear Relationship")
        recommendation = "Spearman or Kendall Tau"
        explanation = f"Moderate agreement across metrics (Pearson: {r_pearson:.2f}, Spearman: {rho_spearman:.2f}). Rank-based metrics are recommended for resilience to sensor spikes."

    # Sample points for scatter plot (max 200 pts)
    step = max(1, len(s_a) // 200)
    scatter_pts = [[float(s_a[i]), float(s_b[i])] for i in range(0, len(s_a), step)]

    return {
        "col_a": col_a,
        "col_b": col_b,
        "scores": {
            "pearson": round(float(r_pearson), 4),
            "spearman": round(float(rho_spearman), 4),
            "kendall": round(float(tau_kendall), 4),
            "fastdtw": round(float(dtw_sim), 4),
            "mutual_info": round(float(mi_score), 4)
        },
        "recommended_algorithm": recommendation,
        "explanation": explanation,
        "characteristics": characteristics,
        "scatter_points": scatter_pts
    }


# =====================================================================
# 2. MACHINE LEARNING MODEL PREDICTION STUDIO (RF, XGBOOST, LIGHTGBM)
# =====================================================================

def train_and_compare_models(
    df: pd.DataFrame,
    feature_cols: List[str],
    target_col: str,
    test_size: float = 0.2,
    random_state: int = 42
) -> Dict[str, Any]:
    """
    Trains Random Forest, XGBoost, and LightGBM regressors on feature sensors
    to predict target sensor trajectory. Returns comparative metrics,
    actual vs predicted series, residual distributions, and feature importances.
    """
    # 1. Preprocess & extract clean numeric dataset
    cols_to_use = feature_cols + [target_col]
    clean_df = df[cols_to_use].copy()

    for c in cols_to_use:
        clean_df[c] = pd.to_numeric(clean_df[c], errors="coerce")

    # Drop rows where target is missing
    clean_df = clean_df.dropna(subset=[target_col])
    # Interpolate feature NaNs
    clean_df[feature_cols] = clean_df[feature_cols].interpolate().bfill().ffill().fillna(0.0)

    if len(clean_df) < 20:
        raise ValueError(f"Insufficient rows ({len(clean_df)}) for machine learning training. Minimum 20 rows required.")

    X = clean_df[feature_cols].values
    y = clean_df[target_col].values

    # Train/Test Split (preserve chronological sequence for time series sensor verification)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, shuffle=False
    )

    models_data = {}

    # --- 1. Random Forest Regressor ---
    t0 = time.time()
    rf = RandomForestRegressor(
        n_estimators=100,
        max_depth=12,
        random_state=random_state,
        n_jobs=-1
    )
    rf.fit(X_train, y_train)
    rf_time_ms = round((time.time() - t0) * 1000, 1)

    rf_pred_test = rf.predict(X_test)
    rf_r2 = round(float(r2_score(y_test, rf_pred_test)), 4)
    rf_rmse = round(float(np.sqrt(mean_squared_error(y_test, rf_pred_test))), 4)
    rf_mae = round(float(mean_absolute_error(y_test, rf_pred_test)), 4)

    # Normalized feature importance %
    rf_fi = rf.feature_importances_
    rf_fi_pct = (rf_fi / max(np.sum(rf_fi), 1e-6) * 100.0).round(2).tolist()

    models_data["random_forest"] = {
        "model_name": "Random Forest",
        "r2": rf_r2,
        "rmse": rf_rmse,
        "mae": rf_mae,
        "train_time_ms": rf_time_ms,
        "feature_importances": rf_fi_pct,
        "model_obj": rf
    }

    # --- 2. XGBoost Regressor ---
    t0 = time.time()
    xgb_model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.08,
        random_state=random_state,
        n_jobs=-1
    )
    xgb_model.fit(X_train, y_train)
    xgb_time_ms = round((time.time() - t0) * 1000, 1)

    xgb_pred_test = xgb_model.predict(X_test)
    xgb_r2 = round(float(r2_score(y_test, xgb_pred_test)), 4)
    xgb_rmse = round(float(np.sqrt(mean_squared_error(y_test, xgb_pred_test))), 4)
    xgb_mae = round(float(mean_absolute_error(y_test, xgb_pred_test)), 4)

    xgb_fi = xgb_model.feature_importances_
    xgb_fi_pct = (xgb_fi / max(np.sum(xgb_fi), 1e-6) * 100.0).round(2).tolist()

    models_data["xgboost"] = {
        "model_name": "XGBoost",
        "r2": xgb_r2,
        "rmse": xgb_rmse,
        "mae": xgb_mae,
        "train_time_ms": xgb_time_ms,
        "feature_importances": xgb_fi_pct,
        "model_obj": xgb_model
    }

    # --- 3. LightGBM Regressor ---
    t0 = time.time()
    lgb_model = lgb.LGBMRegressor(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.08,
        random_state=random_state,
        verbose=-1,
        n_jobs=-1
    )
    lgb_model.fit(X_train, y_train)
    lgb_time_ms = round((time.time() - t0) * 1000, 1)

    lgb_pred_test = lgb_model.predict(X_test)
    lgb_r2 = round(float(r2_score(y_test, lgb_pred_test)), 4)
    lgb_rmse = round(float(np.sqrt(mean_squared_error(y_test, lgb_pred_test))), 4)
    lgb_mae = round(float(mean_absolute_error(y_test, lgb_pred_test)), 4)

    lgb_fi = lgb_model.feature_importances_
    lgb_fi_pct = (lgb_fi / max(np.sum(lgb_fi), 1e-6) * 100.0).round(2).tolist()

    models_data["lightgbm"] = {
        "model_name": "LightGBM",
        "r2": lgb_r2,
        "rmse": lgb_rmse,
        "mae": lgb_mae,
        "train_time_ms": lgb_time_ms,
        "feature_importances": lgb_fi_pct,
        "model_obj": lgb_model
    }

    # Predict full dataset trajectories for visualization (downsampled to max 500 pts)
    rf_full = rf.predict(X)
    xgb_full = xgb_model.predict(X)
    lgb_full = lgb_model.predict(X)

    total_pts = len(y)
    step = max(1, total_pts // 500)
    indices = list(range(0, total_pts, step))

    actual_series = [round(float(y[i]), 3) for i in indices]
    rf_series = [round(float(rf_full[i]), 3) for i in indices]
    xgb_series = [round(float(xgb_full[i]), 3) for i in indices]
    lgb_series = [round(float(lgb_full[i]), 3) for i in indices]

    # Split marker index (where test set begins in downsampled sequence)
    test_start_orig = len(X_train)
    split_index = int(test_start_orig // step)

    # Residual distributions on test set
    rf_residuals = (y_test - rf_pred_test).tolist()
    xgb_residuals = (y_test - xgb_pred_test).tolist()
    lgb_residuals = (y_test - lgb_pred_test).tolist()

    # Determine champion model (highest R2, lowest RMSE)
    candidates = ["random_forest", "xgboost", "lightgbm"]
    champion_key = max(candidates, key=lambda k: models_data[k]["r2"])

    # Average feature importance across all 3 models
    avg_fi = []
    for idx, f in enumerate(feature_cols):
        avg_val = (rf_fi_pct[idx] + xgb_fi_pct[idx] + lgb_fi_pct[idx]) / 3.0
        avg_fi.append({
            "feature": f,
            "importance": round(avg_val, 2),
            "rf": rf_fi_pct[idx],
            "xgb": xgb_fi_pct[idx],
            "lgb": lgb_fi_pct[idx]
        })
    avg_fi.sort(key=lambda x: x["importance"], reverse=True)

    leaderboard = [
        {
            "key": k,
            "name": models_data[k]["model_name"],
            "r2": models_data[k]["r2"],
            "rmse": models_data[k]["rmse"],
            "mae": models_data[k]["mae"],
            "train_time_ms": models_data[k]["train_time_ms"],
            "is_champion": (k == champion_key)
        }
        for k in candidates
    ]
    leaderboard.sort(key=lambda x: x["r2"], reverse=True)

    return {
        "success": True,
        "target_col": target_col,
        "feature_cols": feature_cols,
        "total_rows": total_pts,
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "split_index": split_index,
        "champion": models_data[champion_key]["model_name"],
        "leaderboard": leaderboard,
        "feature_importance_ranking": avg_fi,
        "plot_data": {
            "indices": indices,
            "actual": actual_series,
            "random_forest": rf_series,
            "xgboost": xgb_series,
            "lightgbm": lgb_series,
            "test_split_x": split_index
        },
        "residuals": {
            "random_forest": rf_residuals[:200],
            "xgboost": xgb_residuals[:200],
            "lightgbm": lgb_residuals[:200]
        }
    }
