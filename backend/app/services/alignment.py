import re
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
import scipy.stats
from fastdtw import fastdtw

# Common engineering unit patterns to strip during normalized token matching
ENGINEERING_UNITS = {
    "degc", "deg_c", "degf", "deg_f", "celsius", "fahrenheit",
    "rpm", "pct", "percent", "percentage",
    "w", "kw", "mw", "wh", "kwh",
    "bar", "mbar", "kpa", "pa", "psi",
    "v", "mv", "a", "ma", "hz", "khz",
    "kg", "g", "mg", "l", "ml", "lpm", "m3h",
    "sec", "s", "min", "h", "hr"
}

def clean_and_tokenize(col_name: str) -> Tuple[str, List[str]]:
    """
    Cleans a column name by removing delimiters, normalizing casing,
    and stripping common engineering units.
    Returns:
      (normalized_compact_string, list_of_meaningful_tokens)
    """
    if not col_name:
        return "", []
    
    # 1. Lowercase and replace common separators with spaces
    cleaned = col_name.lower().strip()
    cleaned = re.sub(r'[\_\-\.\:\/\[\]\(\)\s]+', ' ', cleaned)
    
    # 2. Extract alphanumeric tokens
    raw_tokens = [tok for tok in cleaned.split() if tok]
    
    # 3. Filter out pure engineering units if there are other tokens
    filtered_tokens = []
    for tok in raw_tokens:
        if tok in ENGINEERING_UNITS and len(raw_tokens) > 1:
            continue
        filtered_tokens.append(tok)
        
    if not filtered_tokens:
        filtered_tokens = raw_tokens

    # 4. Create a compact normalized string (e.g., 'tempzone1')
    normalized_compact = "".join(filtered_tokens)
    
    return normalized_compact, filtered_tokens

def levenshtein_distance(s1: str, s2: str) -> int:
    """
    Standard dynamic programming Levenshtein edit distance.
    """
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

def string_similarity_score(s1: str, s2: str) -> float:
    """
    Returns normalized string similarity [0.0, 1.0] based on Levenshtein distance.
    """
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 1.0
    dist = levenshtein_distance(s1, s2)
    return max(0.0, 1.0 - (dist / float(max_len)))

def match_columns_lexical(
    ref_cols: List[str],
    test_cols: List[str],
    threshold: float = 0.85
) -> Dict[str, Any]:
    """
    Deterministic Lexical Matcher (Stage 1).
    Does NOT match based on waveforms or values.
    
    Rule Hierarchy:
    1. Case-insensitive exact match
    2. Normalized token match (stripped delimiters and engineering units)
    3. High-confidence string similarity (Levenshtein >= threshold, default 0.85)
    
    Returns:
    {
        "matches": [
            {
                "ref_col": "Temp_Zone1_degC",
                "test_col": "temp_zone1",
                "match_type": "exact" | "normalized_token" | "lexical_similarity",
                "confidence": 1.0
            },
            ...
        ],
        "mapping_dict": { "ref_col": "test_col", ... },
        "unassigned_ref": ["col_A", ...],
        "unassigned_test": ["col_B", ...]
    }
    """
    assigned_test = set()
    matches = []
    mapping_dict = {}
    
    ref_processed = {}
    for r in ref_cols:
        norm_str, tokens = clean_and_tokenize(r)
        ref_processed[r] = {
            "lower": r.lower().strip(),
            "norm": norm_str,
            "tokens": tokens
        }
        
    test_processed = {}
    for t in test_cols:
        norm_str, tokens = clean_and_tokenize(t)
        test_processed[t] = {
            "lower": t.lower().strip(),
            "norm": norm_str,
            "tokens": tokens
        }

    unmatched_ref = set(ref_cols)

    # Stage 1: Case-insensitive exact match
    for r in list(unmatched_ref):
        r_info = ref_processed[r]
        for t in test_cols:
            if t in assigned_test:
                continue
            if r_info["lower"] == test_processed[t]["lower"]:
                matches.append({
                    "ref_col": r,
                    "test_col": t,
                    "match_type": "exact",
                    "confidence": 1.0
                })
                mapping_dict[r] = t
                assigned_test.add(t)
                unmatched_ref.remove(r)
                break

    # Stage 2: Normalized token match (stripping delimiters and units)
    for r in list(unmatched_ref):
        r_norm = ref_processed[r]["norm"]
        if not r_norm:
            continue
        for t in test_cols:
            if t in assigned_test:
                continue
            t_norm = test_processed[t]["norm"]
            if r_norm == t_norm:
                matches.append({
                    "ref_col": r,
                    "test_col": t,
                    "match_type": "normalized_token",
                    "confidence": 0.98
                })
                mapping_dict[r] = t
                assigned_test.add(t)
                unmatched_ref.remove(r)
                break

    # Stage 3: High-confidence string similarity (Levenshtein >= threshold, default 0.85)
    for r in list(unmatched_ref):
        r_info = ref_processed[r]
        best_t = None
        best_score = 0.0

        for t in test_cols:
            if t in assigned_test:
                continue
            t_info = test_processed[t]
            
            # Compare both normalized compact and lower strings
            score_compact = string_similarity_score(r_info["norm"], t_info["norm"])
            score_raw = string_similarity_score(r_info["lower"], t_info["lower"])
            score = max(score_compact, score_raw)

            # Extra token overlap bonus if token set is identical or subset
            set_r = set(r_info["tokens"])
            set_t = set(t_info["tokens"])
            if set_r and set_t and (set_r.issubset(set_t) or set_t.issubset(set_r)):
                score = max(score, 0.88)

            if score > best_score:
                best_score = score
                best_t = t

        if best_t and best_score >= threshold:
            matches.append({
                "ref_col": r,
                "test_col": best_t,
                "match_type": "lexical_similarity",
                "confidence": round(best_score, 3)
            })
            mapping_dict[r] = best_t
            assigned_test.add(best_t)
            unmatched_ref.remove(r)

    unassigned_ref = [r for r in ref_cols if r in unmatched_ref]
    unassigned_test = [t for t in test_cols if t not in assigned_test]

    return {
        "matches": matches,
        "mapping_dict": mapping_dict,
        "unassigned_ref": unassigned_ref,
        "unassigned_test": unassigned_test
    }

def interpolate_series_1d(series: np.ndarray, target_length: int = 300) -> np.ndarray:
    """
    Monotonic/linear downsampling or resampling for rapid similarity scoring.
    """
    n = len(series)
    if n == 0:
        return np.zeros(target_length)
    if n == target_length:
        return series.astype(float)
    x_old = np.linspace(0, 1, n)
    x_new = np.linspace(0, 1, target_length)
    return np.interp(x_new, x_old, series)

def normalize_min_max(series: np.ndarray) -> np.ndarray:
    """
    Min-max normalization to [0, 1].
    """
    s_min = np.nanmin(series)
    s_max = np.nanmax(series)
    if np.isnan(s_min) or np.isnan(s_max) or s_max == s_min:
        return np.zeros_like(series, dtype=float)
    return (series - s_min) / (s_max - s_min)

def compute_pair_score(s_ref: np.ndarray, s_test: np.ndarray) -> Dict[str, float]:
    """
    Stage 3 On-Demand Dynamic Scoring:
    Computes linear Pearson correlation r and normalized DTW distance
    for an aligned pair. Vectorized and fast for responsive debounced UI calls.
    """
    # Filter out NaNs
    s_ref = s_ref[~np.isnan(s_ref)]
    s_test = s_test[~np.isnan(s_test)]

    if len(s_ref) < 2 or len(s_test) < 2:
        return {"pearson": 0.0, "dtw": 0.0, "hybrid": 0.0}

    # Interpolate to common length (300 points)
    resampled_ref = interpolate_series_1d(s_ref, 300)
    resampled_test = interpolate_series_1d(s_test, 300)

    # Normalize
    norm_ref = normalize_min_max(resampled_ref)
    norm_test = normalize_min_max(resampled_test)

    # 1. Pearson Correlation
    if np.all(norm_ref == norm_ref[0]) or np.all(norm_test == norm_test[0]):
        pearson_val = 1.0 if np.allclose(norm_ref, norm_test) else 0.0
    else:
        r, _ = scipy.stats.pearsonr(norm_ref, norm_test)
        pearson_val = float(max(0.0, r)) if not np.isnan(r) else 0.0

    # 2. Dynamic Time Warping (DTW)
    dist, _ = fastdtw(norm_ref, norm_test, dist=lambda a, b: abs(a - b))
    # Normalized DTW similarity: max distance is 300 for [0, 1] normalized series of len 300
    dtw_similarity = float(max(0.0, 1.0 - (dist / 300.0)))

    # Hybrid score
    hybrid = round(0.5 * pearson_val + 0.5 * dtw_similarity, 4)

    return {
        "pearson": round(pearson_val, 4),
        "dtw": round(dtw_similarity, 4),
        "hybrid": hybrid
    }
