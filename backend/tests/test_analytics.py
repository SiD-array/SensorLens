import json
import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient
from main import app
from app.services.analytics import (
    calculate_pearson_matrix,
    calculate_spearman_matrix,
    calculate_kendall_matrix,
    calculate_dtw_matrix,
    calculate_mutual_info_matrix,
    diagnose_sensor_pair,
    train_and_compare_models
)

client = TestClient(app)

@pytest.fixture
def sample_sensor_df():
    np.random.seed(42)
    n = 100
    t = np.linspace(0, 10, n)
    s1 = np.sin(t)
    s2 = np.sin(t) + np.random.normal(0, 0.05, n) # High linear correlation
    s3 = np.exp(s1)                               # Monotonic non-linear
    s4 = s1 ** 2                                  # Non-monotonic non-linear
    s5 = np.random.normal(0, 1, n)                # Uncorrelated noise
    return pd.DataFrame({'sensor_1': s1, 'sensor_2': s2, 'sensor_3': s3, 'sensor_4': s4, 'noise': s5})

def test_correlation_matrices(sample_sensor_df):
    channels = ['sensor_1', 'sensor_2', 'sensor_3']
    
    # 1. Pearson
    p_mat = calculate_pearson_matrix(sample_sensor_df, channels)
    assert len(p_mat["matrix"]) == 3
    assert p_mat["matrix"][0][0] == 1.0
    assert p_mat["matrix"][0][1] > 0.95

    # 2. Spearman
    s_mat = calculate_spearman_matrix(sample_sensor_df, channels)
    assert s_mat["matrix"][0][2] > 0.95 # Monotonic relationship

    # 3. Kendall Tau
    k_mat = calculate_kendall_matrix(sample_sensor_df, channels)
    assert k_mat["matrix"][0][0] == 1.0
    assert k_mat["matrix"][0][1] > 0.8

    # 4. FastDTW
    dtw_mat = calculate_dtw_matrix(sample_sensor_df, channels)
    assert dtw_mat["matrix"][0][0] == 1.0
    assert dtw_mat["matrix"][0][1] > 0.80

    # 5. Mutual Information
    mi_mat = calculate_mutual_info_matrix(sample_sensor_df, channels)
    assert mi_mat["matrix"][0][0] == 1.0
    assert mi_mat["matrix"][0][1] > 0.5

def test_diagnose_sensor_pair(sample_sensor_df):
    # Test linear pair
    diag_linear = diagnose_sensor_pair(sample_sensor_df, 'sensor_1', 'sensor_2')
    assert 'recommended_algorithm' in diag_linear
    assert 'scores' in diag_linear
    assert diag_linear['scores']['pearson'] > 0.9

    # Test non-linear pair
    diag_nl = diagnose_sensor_pair(sample_sensor_df, 'sensor_1', 'sensor_4')
    assert diag_nl['scores']['mutual_info'] > 0

def test_train_and_compare_models(sample_sensor_df):
    result = train_and_compare_models(
        df=sample_sensor_df,
        target_col='sensor_1',
        feature_cols=['sensor_2', 'sensor_3', 'noise'],
        test_size=0.2
    )

    assert result['success'] is True
    assert 'champion' in result
    assert len(result['leaderboard']) == 3
    assert len(result['feature_importance_ranking']) == 3
    assert len(result['plot_data']['actual']) == 100

    # Verify best model has high R2
    best_perf = result['leaderboard'][0]
    assert best_perf['r2'] > 0.8
    assert best_perf['rmse'] < 0.5

def test_api_analytics_endpoints(sample_sensor_df):
    # Upload sample file first to get file_id
    from io import BytesIO
    buffer = BytesIO()
    sample_sensor_df.to_excel(buffer, index=False)
    buffer.seek(0)

    upload_res = client.post(
        "/api/upload",
        files={"file": ("test_analytics_data.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert upload_res.status_code == 200
    file_id = upload_res.json()["id"]

    # 1. Test /api/analytics/correlations (form data)
    corr_res = client.post(
        "/api/analytics/correlations",
        data={
            "file_id": file_id,
            "algorithm": "all",
            "columns_json": json.dumps(["sensor_1", "sensor_2", "sensor_3"])
        }
    )
    assert corr_res.status_code == 200
    corr_data = corr_res.json()
    assert "matrices" in corr_data
    assert "pearson" in corr_data["matrices"]

    # 2. Test /api/analytics/diagnose-pair (json data)
    diag_res = client.post(
        "/api/analytics/diagnose-pair",
        json={
            "file_id": file_id,
            "col_a": "sensor_1",
            "col_b": "sensor_2"
        }
    )
    assert diag_res.status_code == 200
    diag_data = diag_res.json()
    assert diag_data["col_a"] == "sensor_1"
    assert "recommended_algorithm" in diag_data

    # 3. Test /api/analytics/ml-train (form data)
    ml_res = client.post(
        "/api/analytics/ml-train",
        data={
            "file_id": file_id,
            "target_col": "sensor_1",
            "feature_cols_json": json.dumps(["sensor_2", "sensor_3", "noise"]),
            "test_size": 0.2
        }
    )
    assert ml_res.status_code == 200
    ml_data = ml_res.json()
    assert ml_data["success"] is True
    assert len(ml_data["leaderboard"]) == 3
    assert "champion" in ml_data


def test_multi_run_pooling_endpoints(sample_sensor_df):
    from io import BytesIO
    from app.services.analytics import pool_datasets

    # 1. Test pool_datasets service function directly
    df1 = sample_sensor_df.copy()
    df2 = sample_sensor_df.copy()
    pooled_df, common_cols = pool_datasets([df1, df2])
    assert len(pooled_df) == len(df1) + len(df2)
    assert set(common_cols) == set(df1.columns)

    # 2. Upload two runs
    buf1 = BytesIO()
    df1.to_excel(buf1, index=False)
    buf1.seek(0)
    res1 = client.post(
        "/api/upload",
        files={"file": ("run_1.xlsx", buf1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    file_id_1 = res1.json()["id"]

    buf2 = BytesIO()
    df2.to_excel(buf2, index=False)
    buf2.seek(0)
    res2 = client.post(
        "/api/upload",
        files={"file": ("run_2.xlsx", buf2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    file_id_2 = res2.json()["id"]

    file_ids = [file_id_1, file_id_2]

    # 3. Multi-file correlation
    corr_multi = client.post(
        "/api/analytics/correlations",
        data={
            "file_ids_json": json.dumps(file_ids),
            "algorithm": "all",
            "columns_json": json.dumps(["sensor_1", "sensor_2", "sensor_3"])
        }
    )
    assert corr_multi.status_code == 200
    c_data = corr_multi.json()
    assert c_data["total_runs"] == 2
    assert c_data["total_samples"] == 200
    assert "pearson" in c_data["matrices"]

    # 4. Multi-file pair diagnose
    diag_multi = client.post(
        "/api/analytics/diagnose-pair",
        json={
            "file_ids": file_ids,
            "col_a": "sensor_1",
            "col_b": "sensor_2"
        }
    )
    assert diag_multi.status_code == 200
    d_data = diag_multi.json()
    assert d_data["total_runs"] == 2
    assert d_data["total_samples"] == 200
    assert "recommended_algorithm" in d_data

    # 5. Multi-file ML training
    ml_multi = client.post(
        "/api/analytics/ml-train",
        data={
            "file_ids_json": json.dumps(file_ids),
            "target_col": "sensor_1",
            "feature_cols_json": json.dumps(["sensor_2", "sensor_3"]),
            "test_size": 0.2
        }
    )
    assert ml_multi.status_code == 200
    m_data = ml_multi.json()
    assert m_data["success"] is True
    assert m_data["total_runs"] == 2
    assert m_data["total_samples"] == 200
    assert len(m_data["leaderboard"]) == 3

