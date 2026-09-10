import numpy as np
import pandas as pd
import scipy.interpolate
import scipy.stats
from typing import List, Dict, Tuple, Optional, Any

def check_and_repair_monotonicity(
    values: np.ndarray,
    direction: str = "downward",
    threshold_pct: float = 2.0
) -> Tuple[bool, Optional[np.ndarray], float, Optional[str]]:
    """
    Evaluates monotonicity of the target progress variable.
    
    Parameters:
      values: 1D array of target progress variable across time.
      direction: 'downward' (e.g. 100 -> 0) or 'upward' (e.g. 0 -> 100).
      threshold_pct: maximum allowed non-monotonic jump (in % of total range).
                     Defaults to 2.0%.
                     
    Returns:
      (is_valid, smoothed_values, max_violation_pct, error_message)
      
    If severe reversal (> 2%): returns (False, None, max_violation_pct, err_msg)
    If minor jitter (<= 2%): repairs via monotonic PCHIP / monotonic projection
                            and returns (True, smoothed_values, max_violation_pct, None)
    """
    clean_vals = np.array(values, dtype=float)
    # Remove NaNs if any
    clean_vals = clean_vals[~np.isnan(clean_vals)]
    
    n = len(clean_vals)
    if n < 2:
        return False, None, 100.0, "Insufficient data points for monotonicity evaluation."

    val_range = float(np.nanmax(clean_vals) - np.nanmin(clean_vals))
    if val_range <= 1e-9:
        return False, None, 100.0, "Target progress variable has zero dynamic range."

    # For downward: diffs should be <= 0. Positive diffs are violations.
    # For upward: diffs should be >= 0. Negative diffs are violations.
    diffs = np.diff(clean_vals)
    
    if direction.lower() == "downward":
        violations = np.maximum(0.0, diffs) # Positive jumps in a downward trend
    else:
        violations = np.maximum(0.0, -diffs) # Negative drops in an upward trend

    max_violation = float(np.max(violations)) if len(violations) > 0 else 0.0
    max_violation_pct = (max_violation / val_range) * 100.0

    if max_violation_pct > threshold_pct:
        # Severe violation - reject file
        return (
            False,
            None,
            round(max_violation_pct, 2),
            f"Target variable violates monotonicity threshold (max reversal: {max_violation_pct:.2f}% > {threshold_pct:.1f}%)."
        )

    # Minor jitter (<= threshold_pct) - Apply monotonic PCHIP or isotonic projection
    if max_violation_pct > 0.0:
        smoothed = _repair_monotonic_jitter(clean_vals, direction)
    else:
        smoothed = clean_vals.copy()

    return True, smoothed, round(max_violation_pct, 2), None

def _repair_monotonic_jitter(vals: np.ndarray, direction: str) -> np.ndarray:
    """
    Repairs small non-monotonic jitter deviations using monotonic PCHIP interpolation.
    """
    n = len(vals)
    x = np.arange(n)
    
    # Filter points to enforce strictly monotonic sequence for PCHIP
    if direction.lower() == "downward":
        # Strictly decreasing anchor selection
        anchor_indices = [0]
        cur_min = vals[0]
        for i in range(1, n):
            if vals[i] < cur_min:
                anchor_indices.append(i)
                cur_min = vals[i]
        if anchor_indices[-1] != n - 1:
            anchor_indices.append(n - 1)
    else:
        # Strictly increasing anchor selection
        anchor_indices = [0]
        cur_max = vals[0]
        for i in range(1, n):
            if vals[i] > cur_max:
                anchor_indices.append(i)
                cur_max = vals[i]
        if anchor_indices[-1] != n - 1:
            anchor_indices.append(n - 1)

    anchor_indices = sorted(list(set(anchor_indices)))
    anchor_x = x[anchor_indices]
    anchor_y = vals[anchor_indices]

    # If anchor points are too sparse, fallback to isotonic cumulative clamp
    if len(anchor_x) < 2:
        if direction.lower() == "downward":
            return np.minimum.accumulate(vals)
        else:
            return np.maximum.accumulate(vals)

    try:
        # PchipInterpolator guarantees monotonicity between monotonic sample points
        pchip = scipy.interpolate.PchipInterpolator(anchor_x, anchor_y)
        smoothed = pchip(x)
        # Ensure hard bounds
        if direction.lower() == "downward":
            smoothed = np.minimum.accumulate(smoothed)
        else:
            smoothed = np.maximum.accumulate(smoothed)
        return smoothed
    except Exception:
        if direction.lower() == "downward":
            return np.minimum.accumulate(vals)
        else:
            return np.maximum.accumulate(vals)

def resample_channel_to_grid(
    progress_vals: np.ndarray,
    channel_vals: np.ndarray,
    grid: np.ndarray,
    direction: str = "downward"
) -> np.ndarray:
    """
    Resamples a single sensor channel onto the 500-point uniform progress grid
    via linear/monotonic interpolation.
    
    progress_vals: monotonic progress array (from repaired test run)
    channel_vals: original sensor readings corresponding to progress_vals
    grid: uniform target grid (e.g., 500 points from 100.0 down to 0.0)
    """
    # np.interp expects strictly ascending x values
    if direction.lower() == "downward":
        # Progress goes 100 -> 0; sort ascending for interpolation
        sort_idx = np.argsort(progress_vals)
        x_sorted = progress_vals[sort_idx]
        y_sorted = channel_vals[sort_idx]
        
        # Grid goes 100 -> 0; invert to interpolate and then revert
        grid_asc = grid[::-1] # 0 -> 100
        resampled_asc = np.interp(grid_asc, x_sorted, y_sorted)
        resampled = resampled_asc[::-1] # back to 100 -> 0
    else:
        sort_idx = np.argsort(progress_vals)
        x_sorted = progress_vals[sort_idx]
        y_sorted = channel_vals[sort_idx]
        resampled = np.interp(grid, x_sorted, y_sorted)

    return resampled

def build_multi_reference_baseline(
    runs_data: List[Dict[str, Any]],
    target_col: str = "FMC%",
    direction: str = "downward",
    grid_points: int = 500,
    threshold_pct: float = 2.0
) -> Dict[str, Any]:
    """
    Core Pipeline for Feature 3:
    1. Evaluates monotonicity for each run's target progress variable.
    2. Filters/rejects failing runs with clear warning explanations.
    3. Normalizes accepted runs onto uniform synthetic progress grid (default 500 points).
    4. Computes Schema Union and Channel Availability Matrix.
    5. Calculates baseline mean mu_i(Target_norm) and standard deviation envelope sigma_i(Target_norm).
    """
    # Generate uniform synthetic progress grid
    if direction.lower() == "downward":
        synthetic_grid = np.linspace(100.0, 0.0, grid_points)
    else:
        synthetic_grid = np.linspace(0.0, 100.0, grid_points)

    accepted_runs = []
    rejected_runs = []
    all_numeric_channels = set()

    for run in runs_data:
        file_name = run.get("name", "Unnamed Run")
        df = run.get("df")
        
        if df is None or df.empty:
            rejected_runs.append({
                "file_name": file_name,
                "reason": f"Run '{file_name}' rejected: Data table is empty."
            })
            continue

        # Check if target progress variable exists
        matched_target_col = None
        for c in df.columns:
            if c.lower().strip() == target_col.lower().strip():
                matched_target_col = c
                break

        if not matched_target_col:
            rejected_runs.append({
                "file_name": file_name,
                "reason": f"Run '{file_name}' rejected: Target progress variable '{target_col}' not found."
            })
            continue

        raw_progress = pd.to_numeric(df[matched_target_col], errors="coerce").dropna().values
        is_valid, smoothed_progress, max_reversal, err_msg = check_and_repair_monotonicity(
            raw_progress, direction=direction, threshold_pct=threshold_pct
        )

        if not is_valid:
            rejected_runs.append({
                "file_name": file_name,
                "reason": f"Run '{file_name}' rejected: Target variable '{target_col}' violates monotonicity threshold (reversal: {max_reversal:.2f}% > {threshold_pct:.1f}%)."
            })
            continue

        # Extract all numeric sensor channels (excluding the progress variable)
        run_channels = {}
        for c in df.columns:
            if c == matched_target_col:
                continue
            numeric_vals = pd.to_numeric(df[c], errors="coerce").values
            # Keep if at least 50% non-null numeric
            valid_mask = ~np.isnan(numeric_vals)
            if np.sum(valid_mask) >= 0.5 * len(numeric_vals) and len(numeric_vals) > 0:
                # Interpolate internal NaNs if any
                s = pd.Series(numeric_vals).interpolate(method="linear").bfill().ffill().values
                run_channels[c] = s
                all_numeric_channels.add(c)

        accepted_runs.append({
            "file_name": file_name,
            "repaired_progress": smoothed_progress,
            "channels": run_channels
        })

    num_accepted = len(accepted_runs)
    if num_accepted == 0:
        return {
            "success": False,
            "error": "No reference runs passed monotonicity and validation checks.",
            "accepted_count": 0,
            "rejected_runs": rejected_runs,
            "availability_matrix": [],
            "baseline_channels": {},
            "grid": synthetic_grid.tolist()
        }

    # Resample all channels across accepted runs onto the 500-point uniform grid
    # Map: channel_name -> list of 500-pt arrays from runs where channel was present
    channel_resampled_runs: Dict[str, List[np.ndarray]] = {c: [] for c in all_numeric_channels}
    channel_presence_runs: Dict[str, List[str]] = {c: [] for c in all_numeric_channels}

    for run in accepted_runs:
        prog = run["repaired_progress"]
        fname = run["file_name"]
        for c, vals in run["channels"].items():
            # Align length of progress and channel
            min_len = min(len(prog), len(vals))
            p_slice = prog[:min_len]
            v_slice = vals[:min_len]
            
            resampled_500 = resample_channel_to_grid(p_slice, v_slice, synthetic_grid, direction=direction)
            channel_resampled_runs[c].append(resampled_500)
            channel_presence_runs[c].append(fname)

    # Compute Schema Availability Matrix & Baseline Profiles (mean, std)
    availability_matrix = []
    baseline_channels = {}

    for c in sorted(list(all_numeric_channels)):
        runs_present = channel_presence_runs[c]
        k_present = len(runs_present)
        pct_presence = round((k_present / num_accepted) * 100.0, 1)

        availability_matrix.append({
            "channel_name": c,
            "available_runs": k_present,
            "total_accepted_runs": num_accepted,
            "presence_pct": pct_presence,
            "present_in_runs": runs_present
        })

        # Calculate mean profile and std envelope across available runs
        stacked = np.array(channel_resampled_runs[c]) # Shape: (k_present, 500)
        mean_profile = np.nanmean(stacked, axis=0)
        # If only 1 run present, std defaults to 0.0 or 2% of mean amplitude for corridor floor
        if k_present > 1:
            std_profile = np.nanstd(stacked, axis=0, ddof=1)
        else:
            std_profile = np.zeros(grid_points)

        baseline_channels[c] = {
            "channel_name": c,
            "mean": mean_profile.tolist(),
            "std": std_profile.tolist(),
            "sample_count": k_present
        }

    return {
        "success": True,
        "target_variable": target_col,
        "direction": direction,
        "grid_points": grid_points,
        "grid": synthetic_grid.tolist(),
        "accepted_count": num_accepted,
        "rejected_count": len(rejected_runs),
        "rejected_runs": rejected_runs,
        "availability_matrix": availability_matrix,
        "baseline_channels": baseline_channels
    }

def evaluate_test_run_corridor(
    test_df: pd.DataFrame,
    test_file_name: str,
    baseline_profile: Dict[str, Any],
    target_col: str = "FMC%",
    k_sigma: float = 2.0,
    pct_margin: Optional[float] = None,
    mappings: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Evaluates a test run against the generated baseline profile:
    1. Normalizes target variable to the synthetic 500-point grid.
    2. Resamples test sensor channels.
    3. Calculates tolerance corridors: [mu - k*sigma, mu + k*sigma]
       (with optional min margin floor).
    4. Computes Trend Similarity Metrics:
       - Corridor Violation (%): % of points outside envelope.
       - Cumulative Absolute Deviation: Area outside corridor.
       - Pearson Slope Correlation: Rate-of-change trajectory agreement.
    5. Marks violating intervals for UI red highlights.
    6. Seamlessly handles test runs with fewer or more channels, using
       column mappings and lexical matching to bridge naming differences.
    """
    direction = baseline_profile.get("direction", "downward")
    grid = np.array(baseline_profile.get("grid", np.linspace(100.0, 0.0, 500)))
    grid_points = len(grid)
    baseline_channels = baseline_profile.get("baseline_channels", {})

    # Check target progress col in test run
    matched_target = None
    for c in test_df.columns:
        if c.lower().strip() == target_col.lower().strip():
            matched_target = c
            break

    if not matched_target:
        return {
            "success": False,
            "error": f"Target progress variable '{target_col}' not found in test file '{test_file_name}'. Please verify the Cycle Progress Sensor name in the sidebar."
        }

    test_progress_raw = pd.to_numeric(test_df[matched_target], errors="coerce").dropna().values
    is_valid, test_progress_smoothed, max_rev, err = check_and_repair_monotonicity(
        test_progress_raw, direction=direction, threshold_pct=2.0
    )

    if not is_valid:
        return {
            "success": False,
            "error": f"Test run '{test_file_name}' rejected: {err}"
        }

    results = {}
    matched_channels = []
    missing_channels = []
    matched_test_cols = set()

    for c, base_info in baseline_channels.items():
        matched_test_col = None

        # Priority 1: User-defined mappings from Column Alignment
        if mappings and c in mappings and mappings[c]:
            candidate = mappings[c]
            if candidate in test_df.columns:
                matched_test_col = candidate

        # Priority 2: Case-insensitive exact match
        if not matched_test_col:
            for tc in test_df.columns:
                if tc.lower().strip() == c.lower().strip():
                    matched_test_col = tc
                    break

        # Priority 3: Lexical / Token matching (stripping units or high similarity)
        if not matched_test_col:
            from app.services.alignment import clean_and_tokenize, string_similarity_score
            c_clean, _ = clean_and_tokenize(c)
            best_score = 0.0
            best_candidate = None
            for tc in test_df.columns:
                if tc == matched_target:
                    continue
                tc_clean, _ = clean_and_tokenize(tc)
                if c_clean and c_clean == tc_clean:
                    best_candidate = tc
                    break
                sim = string_similarity_score(c, tc)
                if sim >= 0.80 and sim > best_score:
                    best_score = sim
                    best_candidate = tc
            if best_candidate:
                matched_test_col = best_candidate

        if not matched_test_col:
            missing_channels.append(c)
            continue

        raw_c_vals = pd.to_numeric(test_df[matched_test_col], errors="coerce").values
        # Fill missing
        c_series = pd.Series(raw_c_vals).interpolate().bfill().ffill().values
        min_len = min(len(test_progress_smoothed), len(c_series))
        
        test_resampled = resample_channel_to_grid(
            test_progress_smoothed[:min_len],
            c_series[:min_len],
            grid,
            direction=direction
        )

        mu = np.array(base_info["mean"])
        sigma = np.array(base_info["std"])

        # Construct corridor boundary
        corridor_half_width = k_sigma * sigma
        
        # Optional percentage margin floor (e.g. +/- 5% of mean)
        if pct_margin is not None and pct_margin > 0:
            margin_floor = (pct_margin / 100.0) * np.maximum(np.abs(mu), 1.0)
            corridor_half_width = np.maximum(corridor_half_width, margin_floor)

        upper_bound = mu + corridor_half_width
        lower_bound = mu - corridor_half_width

        # 1. Corridor Violation (%)
        is_above = test_resampled > upper_bound
        is_below = test_resampled < lower_bound
        violating_mask = is_above | is_below
        violation_count = int(np.sum(violating_mask))
        violation_pct = round((violation_count / float(grid_points)) * 100.0, 2)

        # 2. Cumulative Absolute Deviation (CAD)
        # Integrated area between test signal and corridor boundary
        excess_above = np.maximum(0.0, test_resampled - upper_bound)
        excess_below = np.maximum(0.0, lower_bound - test_resampled)
        cumulative_abs_deviation = round(float(np.sum(excess_above + excess_below)), 4)

        # 3. Pearson Slope Correlation (Rate-of-Change Agreement)
        # Compute first derivatives: d(test)/dx vs d(mu)/dx
        d_test = np.gradient(test_resampled)
        d_mu = np.gradient(mu)
        if np.all(d_test == 0) or np.all(d_mu == 0):
            slope_corr = 1.0 if np.allclose(d_test, d_mu) else 0.0
        else:
            r, _ = scipy.stats.pearsonr(d_test, d_mu)
            slope_corr = float(r) if not np.isnan(r) else 0.0

        results[c] = {
            "channel_name": c,
            "matched_test_col": matched_test_col,
            "violation_pct": violation_pct,
            "cumulative_deviation": cumulative_abs_deviation,
            "slope_correlation": round(slope_corr, 4),
            "test_values": test_resampled.tolist(),
            "baseline_mean": mu.tolist(),
            "upper_corridor": upper_bound.tolist(),
            "lower_corridor": lower_bound.tolist(),
            "violating_mask": violating_mask.tolist()
        }
        matched_channels.append(c)
        matched_test_cols.add(matched_test_col)

    extra_test_channels = [
        tc for tc in test_df.columns 
        if tc != matched_target and tc not in matched_test_cols
    ]

    if not results:
        return {
            "success": False,
            "error": f"No matching sensor channels found between the baseline ({len(baseline_channels)} channels) and test file '{test_file_name}' ({len(test_df.columns)} channels). Map columns in the Column Alignment tab or check sensor names.",
            "test_file_name": test_file_name,
            "matched_channels": [],
            "missing_channels": list(baseline_channels.keys()),
            "extra_test_channels": extra_test_channels
        }

    return {
        "success": True,
        "test_file_name": test_file_name,
        "target_col": target_col,
        "k_sigma": k_sigma,
        "pct_margin": pct_margin,
        "grid": grid.tolist(),
        "channel_evaluations": results,
        "matched_channels": matched_channels,
        "missing_channels": missing_channels,
        "extra_test_channels": extra_test_channels
    }
