import pytest
import numpy as np
from app.services.baseline import check_and_repair_monotonicity

def test_perfect_monotonic_downward():
    # Perfect downward 100 -> 0
    vals = np.linspace(100.0, 0.0, 200)
    is_valid, smoothed, max_rev, err = check_and_repair_monotonicity(vals, direction="downward", threshold_pct=2.0)
    assert is_valid is True
    assert max_rev == 0.0
    assert err is None
    assert np.allclose(smoothed, vals)

def test_perfect_monotonic_upward():
    # Perfect upward 0 -> 100
    vals = np.linspace(0.0, 100.0, 200)
    is_valid, smoothed, max_rev, err = check_and_repair_monotonicity(vals, direction="upward", threshold_pct=2.0)
    assert is_valid is True
    assert max_rev == 0.0
    assert err is None
    assert np.allclose(smoothed, vals)

def test_minor_jitter_repaired_by_pchip():
    # Downward signal with tiny sensor jitter (< 2%)
    base = np.linspace(100.0, 0.0, 100)
    jitter = base.copy()
    # Add a small jump of 1.0 (1% of 100 range) at index 30
    jitter[30] = jitter[29] + 0.8
    is_valid, smoothed, max_rev, err = check_and_repair_monotonicity(jitter, direction="downward", threshold_pct=2.0)
    assert is_valid is True
    assert max_rev <= 2.0
    assert err is None
    # Verify smoothed output is strictly non-increasing
    diffs = np.diff(smoothed)
    assert np.all(diffs <= 1e-6)

def test_severe_monotonicity_violation_rejected():
    # Downward signal with severe reversal (> 2%)
    base = np.linspace(100.0, 0.0, 100)
    severe = base.copy()
    # Add a jump of 8.0 (8% of 100 range) at index 45
    severe[45] = severe[44] + 8.0
    is_valid, smoothed, max_rev, err = check_and_repair_monotonicity(severe, direction="downward", threshold_pct=2.0)
    assert is_valid is False
    assert max_rev > 2.0
    assert err is not None
    assert "violates monotonicity threshold" in err
