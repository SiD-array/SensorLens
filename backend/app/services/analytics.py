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


def calculate_target_correlations_all_sensors(
    df: pd.DataFrame,
    target_col: str,
    all_cols: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Computes correlations of target_col against ALL other common sensors in all_cols
    across all 5 algorithms. Highly efficient (O(M) scaling).
    Returns rankings for all sensors sorted by magnitude under each algorithm.
    """
    candidate_cols = [c for c in all_cols if c != target_col and c in df.columns]
    if not candidate_cols or target_col not in df.columns:
        return {}

    cols_to_use = [target_col] + candidate_cols
    sub = df[cols_to_use].copy()
    for c in cols_to_use:
        sub[c] = pd.to_numeric(sub[c], errors="coerce")
    sub = sub.dropna().reset_index(drop=True)

    if len(sub) < 4:
        return {}

    target_series = sub[target_col]
    features_df = sub[candidate_cols]

    rankings: Dict[str, List[Dict[str, Any]]] = {
        "pearson": [],
        "spearman": [],
        "kendall": [],
        "fastdtw": [],
        "mutual_info": []
    }

    # 1. Pearson (vectorized)
    try:
        p_corr = features_df.corrwith(target_series, method="pearson").fillna(0.0)
    except Exception:
        p_corr = pd.Series(0.0, index=candidate_cols)

    # 2. Spearman (vectorized)
    try:
        s_corr = features_df.corrwith(target_series, method="spearman").fillna(0.0)
    except Exception:
        s_corr = pd.Series(0.0, index=candidate_cols)

    # 3. Kendall (vectorized)
    try:
        k_corr = features_df.corrwith(target_series, method="kendall").fillna(0.0)
    except Exception:
        k_corr = pd.Series(0.0, index=candidate_cols)

    # 4. FastDTW against target (resampled grid for high performance O(M))
    dtw_scores = {}
    target_vals = target_series.values
    t_min, t_max = np.min(target_vals), np.max(target_vals)
    t_norm = (target_vals - t_min) / max(t_max - t_min, 1e-6)
    t_interp = interpolate_series(t_norm, target_length=40)

    for c in candidate_cols:
        try:
            f_vals = features_df[c].values
            f_min, f_max = np.min(f_vals), np.max(f_vals)
            f_norm = (f_vals - f_min) / max(f_max - f_min, 1e-6)
            f_interp = interpolate_series(f_norm, target_length=40)
            dist, _ = fastdtw(t_interp, f_interp, dist=lambda a, b: abs(a - b))
            sim = float(1.0 / (1.0 + (dist / 40.0)))
            # Inherit sign from Pearson/Spearman for directionality
            s_val = p_corr.get(c, 0.0)
            signed_dtw = round(sim if s_val >= 0 else -sim, 4)
            dtw_scores[c] = (round(sim, 4), signed_dtw)
        except Exception:
            dtw_scores[c] = (0.0, 0.0)

    # 5. Mutual Information (all candidate cols in one regression call)
    mi_scores = {}
    try:
        mi_vals = mutual_info_regression(features_df.values, target_series.values, random_state=42)
        for idx, c in enumerate(candidate_cols):
            val = float(np.tanh(mi_vals[idx]))
            s_val = s_corr.get(c, 0.0)
            signed_mi = round(val if s_val >= 0 else -val, 4)
            mi_scores[c] = (round(val, 4), signed_mi)
    except Exception:
        for c in candidate_cols:
            mi_scores[c] = (0.0, 0.0)

    # Build and rank lists for each algorithm
    for c in candidate_cols:
        # Pearson
        pv = round(float(p_corr.get(c, 0.0)), 4)
        rankings["pearson"].append({
            "column": c,
            "score": round(abs(pv), 4),
            "signed_score": pv,
            "direction": "positive" if pv >= 0 else "negative"
        })

        # Spearman
        sv = round(float(s_corr.get(c, 0.0)), 4)
        rankings["spearman"].append({
            "column": c,
            "score": round(abs(sv), 4),
            "signed_score": sv,
            "direction": "positive" if sv >= 0 else "negative"
        })

        # Kendall
        kv = round(float(k_corr.get(c, 0.0)), 4)
        rankings["kendall"].append({
            "column": c,
            "score": round(abs(kv), 4),
            "signed_score": kv,
            "direction": "positive" if kv >= 0 else "negative"
        })

        # FastDTW
        dtw_mag, dtw_signed = dtw_scores[c]
        rankings["fastdtw"].append({
            "column": c,
            "score": dtw_mag,
            "signed_score": dtw_signed,
            "direction": "positive" if dtw_signed >= 0 else "negative"
        })

        # Mutual Info
        mi_mag, mi_signed = mi_scores[c]
        rankings["mutual_info"].append({
            "column": c,
            "score": mi_mag,
            "signed_score": mi_signed,
            "direction": "positive" if mi_signed >= 0 else "negative"
        })

    # Sort each algorithm descending by score and assign 1-based ranks
    for algo in rankings:
        rankings[algo].sort(key=lambda x: x["score"], reverse=True)
        for idx, item in enumerate(rankings[algo]):
            item["rank"] = idx + 1

    return rankings


def diagnose_dataset_algorithms(
    df: pd.DataFrame,
    columns: List[str],
    target_col: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates ALL sensors across the dataset (relative to target_col, or across
    common sensor channels) to diagnose global data behavior and recommend the
    optimal correlation algorithm.
    """
    clean_cols = [c for c in columns if c in df.columns]
    if len(clean_cols) < 2:
        return {
            "recommended_algorithm": "Pearson Correlation",
            "explanation": "Insufficient channels to compute dataset diagnosis.",
            "suitability_scores": {"pearson": 100, "spearman": 80, "kendall": 70, "fastdtw": 50, "mutual_info": 50},
            "breakdown": {"linear_pct": 100, "monotonic_pct": 0, "complex_nonlinear_pct": 0, "phase_lagged_pct": 0, "weak_pct": 0},
            "total_sensors_analyzed": len(clean_cols)
        }

    sub = df[clean_cols].copy()
    for c in clean_cols:
        sub[c] = pd.to_numeric(sub[c], errors="coerce")
    sub = sub.dropna().reset_index(drop=True)

    if len(sub) < 5:
        return {
            "recommended_algorithm": "Pearson Correlation",
            "explanation": "Insufficient valid rows to compute multi-sensor diagnosis.",
            "suitability_scores": {"pearson": 100, "spearman": 80, "kendall": 70, "fastdtw": 50, "mutual_info": 50},
            "breakdown": {"linear_pct": 100, "monotonic_pct": 0, "complex_nonlinear_pct": 0, "phase_lagged_pct": 0, "weak_pct": 0},
            "total_sensors_analyzed": len(clean_cols)
        }

    # Determine pairs to analyze
    pairs: List[Tuple[str, str]] = []
    if target_col and target_col in clean_cols:
        for c in clean_cols:
            if c != target_col:
                pairs.append((target_col, c))
    else:
        # Cross-pairwise sample across channels (cap at 45 pairs for speed)
        n = len(clean_cols)
        for i in range(n):
            for j in range(i + 1, n):
                pairs.append((clean_cols[i], clean_cols[j]))
                if len(pairs) >= 45:
                    break
            if len(pairs) >= 45:
                break

    if not pairs:
        pairs = [(clean_cols[0], clean_cols[1])]

    linear_count = 0
    monotonic_count = 0
    nonlinear_count = 0
    phase_lagged_count = 0
    weak_count = 0

    # Evaluate each pair
    for c1, c2 in pairs:
        s1 = sub[c1].values
        s2 = sub[c2].values

        try:
            r_p = abs(float(scipy.stats.pearsonr(s1, s2)[0]))
            if np.isnan(r_p): r_p = 0.0
        except Exception:
            r_p = 0.0

        try:
            r_s = abs(float(scipy.stats.spearmanr(s1, s2)[0]))
            if np.isnan(r_s): r_s = 0.0
        except Exception:
            r_s = 0.0

        try:
            mi_raw = mutual_info_regression(s1.reshape(-1, 1), s2, random_state=42)[0]
            mi_val = float(np.tanh(mi_raw))
        except Exception:
            mi_val = 0.0

        try:
            n1 = (s1 - np.min(s1)) / max(np.max(s1) - np.min(s1), 1e-6)
            n2 = (s2 - np.min(s2)) / max(np.max(s2) - np.min(s2), 1e-6)
            dist, _ = fastdtw(interpolate_series(n1, 30), interpolate_series(n2, 30), dist=lambda a, b: abs(a - b))
            dtw_val = float(1.0 / (1.0 + (dist / 30.0)))
        except Exception:
            dtw_val = 0.0

        # Classification logic
        if r_p >= 0.75 and (r_s - r_p < 0.12):
            linear_count += 1
        elif (r_s - r_p >= 0.15) and r_s >= 0.45:
            monotonic_count += 1
        elif mi_val >= 0.50 and r_p < 0.40:
            nonlinear_count += 1
        elif dtw_val >= 0.65 and r_p < 0.45:
            phase_lagged_count += 1
        elif max(r_p, r_s, mi_val, dtw_val) < 0.30:
            weak_count += 1
        else:
            linear_count += 1

    total_pairs = len(pairs)
    pct_linear = round((linear_count / total_pairs) * 100, 1)
    pct_monotonic = round((monotonic_count / total_pairs) * 100, 1)
    pct_nonlinear = round((nonlinear_count / total_pairs) * 100, 1)
    pct_phase_lag = round((phase_lagged_count / total_pairs) * 100, 1)
    pct_weak = round((weak_count / total_pairs) * 100, 1)

    # Suitability scores (0 - 100)
    score_pearson = round(min(100.0, pct_linear * 1.0 + pct_monotonic * 0.4 + pct_weak * 0.3), 1)
    score_spearman = round(min(100.0, pct_monotonic * 1.2 + pct_linear * 0.8 + pct_nonlinear * 0.4), 1)
    score_kendall = round(min(100.0, pct_monotonic * 1.0 + pct_linear * 0.7 + pct_weak * 0.4), 1)
    score_dtw = round(min(100.0, pct_phase_lag * 1.5 + pct_linear * 0.5 + pct_monotonic * 0.4), 1)
    score_mi = round(min(100.0, pct_nonlinear * 1.6 + pct_monotonic * 0.7 + pct_linear * 0.6), 1)

    # Select champion
    target_mention = f" against target '{target_col}'" if target_col else ""
    if pct_nonlinear >= 25 or (score_mi > max(score_pearson, score_spearman, score_dtw)):
        champion = "Mutual Information"
        explanation = (
            f"Mutual Information is recommended as the champion algorithm across all {total_pairs} sensor relationships analyzed{target_mention}. "
            f"{pct_nonlinear}% of channel pairs exhibit complex non-linear or multi-state behavior where linear metrics underestimate coupling."
        )
    elif pct_phase_lag >= 25 or (score_dtw > max(score_pearson, score_spearman, score_mi)):
        champion = "FastDTW (Dynamic Time Warping)"
        explanation = (
            f"FastDTW is recommended as the champion algorithm across all {total_pairs} sensor relationships analyzed{target_mention}. "
            f"{pct_phase_lag}% of channel pairs exhibit dynamic phase lags or time shifts that distort standard point-by-point correlations."
        )
    elif pct_monotonic >= 25 or (score_spearman > max(score_pearson, score_mi, score_dtw)):
        champion = "Spearman Rank Correlation"
        explanation = (
            f"Spearman Rank is recommended as the champion algorithm across all {total_pairs} sensor relationships analyzed{target_mention}. "
            f"{pct_monotonic}% of channel pairs follow curved monotonic trajectories where rank-based coupling outperforms linear Pearson."
        )
    else:
        champion = "Pearson Correlation"
        explanation = (
            f"Pearson Correlation is recommended as the champion algorithm across all {total_pairs} sensor relationships analyzed{target_mention}. "
            f"{pct_linear}% of channel pairs demonstrate strong proportional linear coupling with minimal phase distortion."
        )

    return {
        "recommended_algorithm": champion,
        "explanation": explanation,
        "suitability_scores": {
            "pearson": score_pearson,
            "spearman": score_spearman,
            "kendall": score_kendall,
            "fastdtw": score_dtw,
            "mutual_info": score_mi
        },
        "breakdown": {
            "linear_pct": pct_linear,
            "monotonic_pct": pct_monotonic,
            "complex_nonlinear_pct": pct_nonlinear,
            "phase_lagged_pct": pct_phase_lag,
            "weak_pct": pct_weak
        },
        "total_sensors_analyzed": total_pairs,
        "target_col": target_col
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
