import pytest
import numpy as np
import pandas as pd
from app.services.baseline import (
    resample_channel_to_grid,
    build_multi_reference_baseline,
    evaluate_test_run_corridor
)

def test_resample_channel_to_500_grid():
    # Progress: 100 -> 0 over 100 points
    progress = np.linspace(100.0, 0.0, 100)
    # Channel values: linear ramp from 20 to 80
    channel = np.linspace(20.0, 80.0, 100)
    grid = np.linspace(100.0, 0.0, 500)
    
    resampled = resample_channel_to_grid(progress, channel, grid, direction="downward")
    assert len(resampled) == 500
    assert np.isclose(resampled[0], 20.0, atol=0.5)
    assert np.isclose(resampled[-1], 80.0, atol=0.5)

def test_multi_reference_baseline_union_schema():
    # Run 1 has channels A, B
    p1 = np.linspace(100.0, 0.0, 50)
    df1 = pd.DataFrame({
        "FMC%": p1,
        "Temp_A": np.linspace(25, 75, 50),
        "Speed_B": np.full(50, 1200)
    })
    
    # Run 2 has channels A, C
    p2 = np.linspace(100.0, 0.0, 60)
    df2 = pd.DataFrame({
        "FMC%": p2,
        "Temp_A": np.linspace(27, 73, 60),
        "Power_C": np.full(60, 2000)
    })
    
    runs = [
        {"name": "run1.xlsx", "df": df1},
        {"name": "run2.xlsx", "df": df2}
    ]
    
    result = build_multi_reference_baseline(runs, target_col="FMC%", direction="downward")
    assert result["success"] is True
    assert result["accepted_count"] == 2
    assert result["rejected_count"] == 0
    
    # Schema Availability Matrix should include all union channels: Temp_A, Speed_B, Power_C
    avail = {item["channel_name"]: item for item in result["availability_matrix"]}
    assert "Temp_A" in avail
    assert avail["Temp_A"]["available_runs"] == 2
    assert avail["Temp_A"]["presence_pct"] == 100.0
    
    assert "Speed_B" in avail
    assert avail["Speed_B"]["available_runs"] == 1
    assert avail["Speed_B"]["presence_pct"] == 50.0
    
    assert "Power_C" in avail
    assert avail["Power_C"]["available_runs"] == 1
    assert avail["Power_C"]["presence_pct"] == 50.0

def test_corridor_evaluation_metrics():
    # Build baseline with 2 runs
    p = np.linspace(100.0, 0.0, 50)
    df1 = pd.DataFrame({"FMC%": p, "Temp": np.full(50, 50.0)})
    df2 = pd.DataFrame({"FMC%": p, "Temp": np.full(50, 52.0)})
    runs = [{"name": "r1.xlsx", "df": df1}, {"name": "r2.xlsx", "df": df2}]
    baseline = build_multi_reference_baseline(runs, target_col="FMC%")
    
    # Test run within corridor
    df_test_good = pd.DataFrame({"FMC%": p, "Temp": np.full(50, 51.0)})
    eval_good = evaluate_test_run_corridor(df_test_good, "good.xlsx", baseline, target_col="FMC%", k_sigma=2.0)
    assert eval_good["success"] is True
    assert eval_good["channel_evaluations"]["Temp"]["violation_pct"] == 0.0
    assert eval_good["channel_evaluations"]["Temp"]["cumulative_deviation"] == 0.0
    
    # Test run violating corridor
    df_test_bad = pd.DataFrame({"FMC%": p, "Temp": np.full(50, 90.0)}) # Way outside [51 - 2, 51 + 2]
    eval_bad = evaluate_test_run_corridor(df_test_bad, "bad.xlsx", baseline, target_col="FMC%", k_sigma=2.0)
    assert eval_bad["success"] is True
    assert eval_bad["channel_evaluations"]["Temp"]["violation_pct"] == 100.0
    assert eval_bad["channel_evaluations"]["Temp"]["cumulative_deviation"] > 0.0
