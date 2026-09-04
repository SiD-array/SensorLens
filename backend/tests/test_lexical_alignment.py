import pytest
from app.services.alignment import (
    clean_and_tokenize,
    levenshtein_distance,
    string_similarity_score,
    match_columns_lexical
)

def test_clean_and_tokenize_engineering_units():
    norm, tokens = clean_and_tokenize("Temp_Zone1_degC")
    assert "degc" not in tokens
    assert norm == "tempzone1"

    norm2, tokens2 = clean_and_tokenize("Motor_Speed_rpm")
    assert "rpm" not in tokens2
    assert norm2 == "motorspeed"

    norm3, tokens3 = clean_and_tokenize("Heater_Power_W")
    assert "w" not in tokens3
    assert norm3 == "heaterpower"

def test_case_insensitive_exact_match():
    ref_cols = ["Temp_Zone1", "Pressure_Main"]
    test_cols = ["temp_zone1", "PRESSURE_MAIN"]
    res = match_columns_lexical(ref_cols, test_cols)
    assert res["mapping_dict"]["Temp_Zone1"] == "temp_zone1"
    assert res["mapping_dict"]["Pressure_Main"] == "PRESSURE_MAIN"
    assert len(res["unassigned_ref"]) == 0
    assert len(res["unassigned_test"]) == 0

def test_normalized_token_match():
    # Delimiters and units differing
    ref_cols = ["Temp_Zone1_degC", "Flow_Rate_lpm"]
    test_cols = ["temp-zone1", "flow_rate"]
    res = match_columns_lexical(ref_cols, test_cols)
    assert res["mapping_dict"]["Temp_Zone1_degC"] == "temp-zone1"
    assert res["mapping_dict"]["Flow_Rate_lpm"] == "flow_rate"

def test_unassigned_test_channels_stay_in_bank():
    ref_cols = ["Temp_Zone1"]
    test_cols = ["temp_zone1", "Completely_Unrelated_Sensor_XYZ", "Aux_Power_99"]
    res = match_columns_lexical(ref_cols, test_cols, threshold=0.85)
    assert res["mapping_dict"]["Temp_Zone1"] == "temp_zone1"
    assert "Completely_Unrelated_Sensor_XYZ" in res["unassigned_test"]
    assert "Aux_Power_99" in res["unassigned_test"]
    assert len(res["unassigned_ref"]) == 0
