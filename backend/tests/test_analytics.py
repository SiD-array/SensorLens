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


def test_feature_ranking_and_composite_sensor(sample_sensor_df):
    from app.services.analytics import rank_features_from_matrix, generate_composite_sensor
    from io import BytesIO

    # 1. Test rank_features_from_matrix
    cols = ["a", "b", "c"]
    mat = [
        [1.0, 0.9, 0.8],
        [0.9, 1.0, 0.4],
        [0.8, 0.4, 1.0]
    ]
    rankings = rank_features_from_matrix(cols, mat)
    assert len(rankings) == 3
    # "a" has (0.9 + 0.8)/2 = 0.85 -> highest coupling score
    assert rankings[0]["column"] == "a"
    assert rankings[0]["rank"] == 1
    assert rankings[0]["score"] == 0.85

    # 2. Test generate_composite_sensor (PCA)
    df_copy = sample_sensor_df.copy()
    pca_res = generate_composite_sensor(
        dfs=[df_copy],
        source_cols=["sensor_1", "sensor_2"],
        method="pca",
        new_sensor_name="PCA_s1_s2"
    )
    assert pca_res["success"] is True
    assert "PCA_s1_s2" in df_copy.columns
    # Highly collinear sensors should yield >90% variance explained
    assert pca_res["variance_explained_pct"] > 90.0
    assert pca_res["sensor_column"]["name"] == "PCA_s1_s2"
    assert len(pca_res["sensor_column"]["sparkline"]) == 30

    # 3. Test generate_composite_sensor (Average)
    avg_res = generate_composite_sensor(
        dfs=[df_copy],
        source_cols=["sensor_1", "sensor_2"],
        method="average",
        new_sensor_name="Avg_s1_s2"
    )
    assert avg_res["success"] is True
    assert "Avg_s1_s2" in df_copy.columns
    assert avg_res["variance_explained_pct"] is None

    # 4. Test API endpoint POST /api/analytics/composite-sensor
    buf = BytesIO()
    sample_sensor_df.to_excel(buf, index=False)
    buf.seek(0)
    upload_res = client.post(
        "/api/upload",
        files={"file": ("pca_test.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    file_id = upload_res.json()["id"]

    comp_api_res = client.post(
        "/api/analytics/composite-sensor",
        json={
            "file_ids": [file_id],
            "source_cols": ["sensor_1", "sensor_2"],
            "method": "pca",
            "new_sensor_name": "PCA_Merged_Sensors"
        }
    )
    assert comp_api_res.status_code == 200
    comp_api_data = comp_api_res.json()
    assert comp_api_data["new_sensor_name"] == "PCA_Merged_Sensors"
    assert comp_api_data["variance_explained_pct"] > 90.0

    # 5. Verify feature_rankings in POST /api/analytics/correlations
    corr_res = client.post(
        "/api/analytics/correlations",
        data={
            "file_id": file_id,
            "algorithm": "all",
            "columns_json": json.dumps(["sensor_1", "sensor_2", "PCA_Merged_Sensors"])
        }
    )
    assert corr_res.status_code == 200
    corr_json = corr_res.json()
    assert "feature_rankings" in corr_json
    assert "pearson" in corr_json["feature_rankings"]
    assert len(corr_json["feature_rankings"]["pearson"]) == 3

    # 6. Verify feature_rankings with target_col specified
    corr_target_res = client.post(
        "/api/analytics/correlations",
        data={
            "file_id": file_id,
            "algorithm": "pearson",
            "columns_json": json.dumps(["sensor_1", "sensor_2", "PCA_Merged_Sensors"]),
            "target_col": "sensor_1"
        }
    )
    assert corr_target_res.status_code == 200
    corr_target_json = corr_target_res.json()
    assert corr_target_json["target_col"] == "sensor_1"
    rankings_target = corr_target_json["feature_rankings"]["pearson"]
    # Should exclude target itself and rank other features
    assert len(rankings_target) == 2
    assert all(r["column"] != "sensor_1" for r in rankings_target)
    assert rankings_target[0]["score"] > 0.8


