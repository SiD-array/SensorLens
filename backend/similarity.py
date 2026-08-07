import numpy as np
import scipy.signal
import scipy.stats
from fastdtw import fastdtw

def levenshtein_distance(s1: str, s2: str) -> int:
    s1, s2 = s1.lower(), s2.lower()
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def suggest_mappings(ref_cols: list[str], test_cols: list[str]) -> dict[str, str]:
    """
    Suggests mappings from ref_cols to test_cols using string similarity.
    """
    suggestions = {}
    used_test_cols = set()
    
    # Sort reference columns to process shorter or more distinct ones
    for r_col in ref_cols:
        best_match = None
        min_dist = float('inf')
        
        for t_col in test_cols:
            # Skip already mapped columns to avoid mapping multiple refs to same test
            if t_col in used_test_cols:
                continue
            
            dist = levenshtein_distance(r_col, t_col)
            # Give a preference boost to exact or substring matches
            if r_col.lower() in t_col.lower() or t_col.lower() in r_col.lower():
                dist = dist * 0.5
                
            if dist < min_dist:
                min_dist = dist
                best_match = t_col
        
        # Only suggest if there's a reasonable match
        if best_match and min_dist < max(len(r_col), len(best_match)):
            suggestions[r_col] = best_match
            used_test_cols.add(best_match)
        else:
            suggestions[r_col] = "" # Leave unmapped for user to resolve
            
    return suggestions

def interpolate_series(series: np.ndarray, target_length: int = 500) -> np.ndarray:
    """
    Downsamples or interpolates a series to a fixed length for fast computations.
    """
    n = len(series)
    if n == 0:
        return np.zeros(target_length)
    if n == target_length:
        return series
    
    x_old = np.linspace(0, 1, n)
    x_new = np.linspace(0, 1, target_length)
    return np.interp(x_new, x_old, series)

def normalize_series(series: np.ndarray) -> np.ndarray:
    """
    Min-max normalization.
    """
    s_min = np.min(series)
    s_max = np.max(series)
    if s_max == s_min:
        return np.zeros_like(series)
    return (series - s_min) / (s_max - s_min)

def detect_time_lag(s1: np.ndarray, s2: np.ndarray) -> int:
    """
    Detects the starting lag (in index steps) of s2 relative to s1.
    Uses cross-correlation on normalized and interpolated series.
    Returns lag in terms of the original s2 series indexing.
    """
    n1, n2 = len(s1), len(s2)
    if n1 == 0 or n2 == 0:
        return 0
    
    # Interpolate to 500 points for lag calculation
    s1_interp = normalize_series(interpolate_series(s1, 500))
    s2_interp = normalize_series(interpolate_series(s2, 500))
    
    # Compute cross-correlation
    correlation = scipy.signal.correlate(s1_interp, s2_interp, mode='full')
    lags = scipy.signal.correlation_lags(500, 500, mode='full')
    
    best_lag_idx = np.argmax(correlation)
    lag_interp = lags[best_lag_idx]
    
    # Scale lag back to original s2 steps
    lag_original = int(lag_interp * (n2 / 500.0))
    return lag_original

def find_peaks_and_compare(s1: np.ndarray, s2: np.ndarray) -> dict:
    """
    Finds key peaks and compares their counts and values.
    """
    # Normalize for stable peak finding (prominence is scale-free this way)
    s1_norm = normalize_series(s1)
    s2_norm = normalize_series(s2)
    
    peaks1, _ = scipy.signal.find_peaks(s1_norm, prominence=0.15, distance=len(s1)//20 + 1)
    peaks2, _ = scipy.signal.find_peaks(s2_norm, prominence=0.15, distance=len(s2)//20 + 1)
    
    peak_count1 = len(peaks1)
    peak_count2 = len(peaks2)
    
    max_val1 = float(np.max(s1)) if len(s1) > 0 else 0.0
    max_val2 = float(np.max(s2)) if len(s2) > 0 else 0.0
    
    # Find height of tallest peak in original units
    tallest_peak1 = float(np.max(s1[peaks1])) if len(peaks1) > 0 else max_val1
    tallest_peak2 = float(np.max(s2[peaks2])) if len(peaks2) > 0 else max_val2
    
    return {
        "peaks_ref": peak_count1,
        "peaks_test": peak_count2,
        "max_ref": max_val1,
        "max_test": max_val2,
        "tallest_peak_ref": tallest_peak1,
        "tallest_peak_test": tallest_peak2
    }

def compute_similarity(s_ref: np.ndarray, s_test: np.ndarray) -> dict:
    """
    Computes Pearson Correlation and DTW Distance between two series.
    Returns normalized scores [0, 1].
    """
    n_ref = len(s_ref)
    n_test = len(s_test)
    
    if n_ref == 0 or n_test == 0:
        return {"pearson": 0.0, "dtw": 0.0, "hybrid": 0.0}
    
    # 1. Normalize
    s_ref_norm = normalize_series(s_ref)
    s_test_norm = normalize_series(s_test)
    
    # 2. Pearson Correlation
    # Pearson requires same length, so interpolate test to match reference length
    s_test_interp_ref = interpolate_series(s_test, n_ref)
    s_test_interp_ref_norm = normalize_series(s_test_interp_ref)
    
    # Handle zero-variance cases
    if np.all(s_ref_norm == 0) or np.all(s_test_interp_ref_norm == 0):
        pearson_val = 1.0 if np.all(s_ref_norm == s_test_interp_ref_norm) else 0.0
    else:
        r, _ = scipy.stats.pearsonr(s_ref_norm, s_test_interp_ref_norm)
        pearson_val = max(0.0, float(r)) if not np.isnan(r) else 0.0
        
    # 3. DTW Similarity
    # Interpolate both to 300 points for fast, consistent DTW calculation
    s_ref_dtw_input = interpolate_series(s_ref_norm, 300)
    s_test_dtw_input = interpolate_series(s_test_norm, 300)
    
    distance, _ = fastdtw(s_ref_dtw_input, s_test_dtw_input, dist=lambda x, y: abs(x - y))
    
    # Maximum possible distance is 300 (if one is all 0s and one is all 1s)
    dtw_similarity = max(0.0, 1.0 - (distance / 300.0))
    
    return {
        "pearson": pearson_val,
        "dtw": dtw_similarity
    }

def generate_local_report(
    ref_col: str,
    test_col: str,
    hybrid_score: float,
    pearson_score: float,
    dtw_score: float,
    lag: int,
    peaks_info: dict,
    category: str,
    time_step_sec: float = 1.0
) -> str:
    """
    Generates a natural-language report summarizing similarity findings.
    """
    lag_seconds = abs(lag * time_step_sec)
    lag_text = ""
    if lag > 2:
        lag_text = f"a start delay of approximately {lag_seconds:.1f} seconds"
    elif lag < -2:
        lag_text = f"starting approximately {lag_seconds:.1f} seconds earlier"
    else:
        lag_text = "no significant starting delay"
        
    # Peak comparison
    ref_peaks = peaks_info["peaks_ref"]
    test_peaks = peaks_info["peaks_test"]
    peak_diff = test_peaks - ref_peaks
    peak_text = ""
    if peak_diff == 0:
        peak_text = f"both show the same number of peaks ({ref_peaks})"
    elif peak_diff > 0:
        peak_text = f"the test run shows {test_peaks} peaks (which is {peak_diff} more than the reference's {ref_peaks})"
    else:
        peak_text = f"the test run shows {test_peaks} peaks (which is {abs(peak_diff)} fewer than the reference's {ref_peaks})"
        
    # Amplitude check
    max_ref = peaks_info["max_ref"]
    max_test = peaks_info["max_test"]
    amp_diff = max_test - max_ref
    pct_diff = (amp_diff / max_ref * 100.0) if max_ref != 0 else 0.0
    
    amp_text = ""
    if abs(amp_diff) < 0.02 * (max_ref + 0.1):
        amp_text = "their peak values are well-aligned"
    elif amp_diff > 0:
        amp_text = f"the test run's maximum value ({max_test:.2f}) is higher by {amp_diff:.2f} ({pct_diff:.1f}%)"
    else:
        amp_text = f"the test run's maximum value ({max_test:.2f}) is lower by {abs(amp_diff):.2f} ({abs(pct_diff):.1f}%)"

    report = (
        f"Comparing '{test_col}' against reference '{ref_col}': "
        f"The comparison shows a **{category.upper()}** with an overall hybrid similarity index of **{hybrid_score:.1%}**. "
        f"Shape agreement (Pearson correlation) is **{pearson_score:.1%}**, and temporal alignment (DTW similarity) is **{dtw_score:.1%}**. "
        f"Analysis of the signals indicates {lag_text} in the test run. "
        f"Regarding major events, {peak_text}, and {amp_text}. "
    )
    
    if category == "match":
        report += "This test run represents a highly reliable match to the expected operational reference profile."
    elif category == "similar":
        report += "While the general operational profile is preserved, the observed deviations in peak timing or amplitude warrant inspection to confirm if they fall within tolerance limits."
    else:
        report += "The test run deviates significantly from the expected reference. It should be flagged for engineering review."
        
    return report
