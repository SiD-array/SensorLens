import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from main import app, uploaded_files_cache

client = TestClient(app)

def test_workspace_export_and_import_with_full_telemetry():
    # Setup cache with test runs
    uploaded_files_cache.clear()
    
    n = 60
    df1 = pd.DataFrame({
        "FMC%": np.linspace(100, 0, n),
        "Temp_Inlet": np.linspace(20, 80, n) + np.random.normal(0, 0.5, n),
        "Power_W": np.linspace(1500, 1800, n)
    })
    
    uploaded_files_cache["run_1"] = {
        "id": "run_1",
        "name": "Reference_Run_1.xlsx",
        "df": df1,
        "columns": [
            {"name": "FMC%", "type": "numeric", "min": 0, "max": 100, "mean": 50, "std": 30, "sparkline": [100, 50, 0]},
            {"name": "Temp_Inlet", "type": "numeric", "min": 20, "max": 80, "mean": 50, "std": 15, "sparkline": [20, 50, 80]},
            {"name": "Power_W", "type": "numeric", "min": 1500, "max": 1800, "mean": 1650, "std": 90, "sparkline": [1500, 1650, 1800]}
        ]
    }
    
    # 1. Test GET /api/workspace/export-session
    res_export = client.get("/api/workspace/export-session")
    assert res_export.status_code == 200
    export_data = res_export.json()
    assert export_data["status"] == "success"
    assert len(export_data["files"]) == 1
    file_exp = export_data["files"][0]
    assert file_exp["id"] == "run_1"
    assert file_exp["rowCount"] == n
    assert "FMC%" in file_exp["data"]
    assert len(file_exp["data"]["FMC%"]) == n
    
    # 2. Clear cache and import via POST /api/workspace/import-session
    uploaded_files_cache.clear()
    assert len(uploaded_files_cache) == 0
    
    res_import = client.post("/api/workspace/import-session", json={
        "files": export_data["files"],
        "tags": {"run_1": "reference"}
    })
    assert res_import.status_code == 200
    import_result = res_import.json()
    assert import_result["fileCount"] == 1
    assert "run_1" in uploaded_files_cache
    
    restored_df = uploaded_files_cache["run_1"]["df"]
    assert len(restored_df) == n
    assert "FMC%" in restored_df.columns
    assert "Temp_Inlet" in restored_df.columns

def test_workspace_import_legacy_session_fallback():
    # Test importing a session that ONLY has column metadata and NO rawData/data
    uploaded_files_cache.clear()
    
    legacy_session = {
        "files": [
            {
                "id": "legacy_run_1",
                "name": "Legacy_Run.xlsx",
                "rowCount": 80,
                "columns": [
                    {"name": "FMC%", "type": "numeric", "min": 0.0, "max": 100.0, "mean": 50.0, "std": 28.0, "sparkline": [100.0, 75.0, 50.0, 25.0, 0.0]},
                    {"name": "Temp_Probe", "type": "numeric", "min": 25.0, "max": 75.0, "mean": 50.0, "std": 14.0, "sparkline": [25.0, 40.0, 55.0, 70.0, 75.0]}
                ]
            }
        ]
    }
    
    res = client.post("/api/workspace/import-session", json=legacy_session)
    assert res.status_code == 200
    assert "legacy_run_1" in uploaded_files_cache
    
    # Verify that the synthesized dataframe has rows and is non-empty
    restored_df = uploaded_files_cache["legacy_run_1"]["df"]
    assert len(restored_df) == 80
    assert "FMC%" in restored_df.columns
    assert "Temp_Probe" in restored_df.columns
    # Check that the sparkline trend was smoothly resampled
    assert restored_df["FMC%"].iloc[0] > restored_df["FMC%"].iloc[-1]

def test_build_baseline_from_workspace_endpoint():
    uploaded_files_cache.clear()
    
    n = 100
    df_ref1 = pd.DataFrame({
        "FMC%": np.linspace(100, 0, n),
        "Heater_Temp": np.linspace(30, 85, n) + np.random.normal(0, 0.2, n),
        "Fan_RPM": np.linspace(1200, 1500, n)
    })
    df_ref2 = pd.DataFrame({
        "FMC%": np.linspace(100, 0, n),
        "Heater_Temp": np.linspace(31, 84, n) + np.random.normal(0, 0.2, n),
        "Fan_RPM": np.linspace(1210, 1490, n)
    })
    
    uploaded_files_cache["ref_1"] = {"id": "ref_1", "name": "Ref1.xlsx", "df": df_ref1, "columns": []}
    uploaded_files_cache["ref_2"] = {"id": "ref_2", "name": "Ref2.xlsx", "df": df_ref2, "columns": []}
    
    # Call /api/baseline/build-from-workspace
    payload = {
        "file_ids": ["ref_1", "ref_2"],
        "target_col": "FMC%",
        "direction": "downward",
        "threshold_pct": 2.0
    }
    res = client.post("/api/baseline/build-from-workspace", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "availability_matrix" in data
    assert len(data["availability_matrix"]) >= 2
