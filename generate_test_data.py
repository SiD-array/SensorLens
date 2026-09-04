import os
import pandas as pd
import numpy as np

def generate_legacy_runs():
    np.random.seed(42)
    time = np.arange(0, 100, 1)
    
    # 1. Normal Reference Run
    temp = 22 + 53 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.3, len(time))
    flow = np.zeros(len(time))
    flow[15:80] = 5.2 + np.random.normal(0, 0.1, len(time[15:80]))
    flow[80:] = np.random.normal(0, 0.02, len(time[80:]))
    pressure = np.zeros(len(time))
    pressure[15:80] = 2.4 + np.random.normal(0, 0.05, len(time[15:80]))
    
    df_ref = pd.DataFrame({
        "Time": time,
        "Temp_Zone1": temp,
        "Flow_Rate": flow,
        "Pressure_Zone1": pressure
    })
    df_ref.to_excel("test_reference.xlsx", index=False)
    print("Generated test_reference.xlsx")

    # 2. Useful Run (with offset & slight differences)
    shift = 8
    temp_raw = 22 + 50 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.4, len(time))
    temp_u = np.roll(temp_raw, shift)
    temp_u[:shift] = 22.0
    
    flow_raw = np.zeros(len(time))
    flow_raw[15:80] = 5.0 + np.random.normal(0, 0.12, len(time[15:80]))
    flow_u = np.roll(flow_raw, shift)
    flow_u[:shift] = 0.0
    
    pressure_raw = np.zeros(len(time))
    pressure_raw[15:80] = 2.25 + np.random.normal(0, 0.06, len(time[15:80]))
    pressure_u = np.roll(pressure_raw, shift)
    pressure_u[:shift] = 0.0
    
    df_use = pd.DataFrame({
        "Time": time,
        "T_Sensor_ZoneA": temp_u,
        "Flow_Rate_Sensor": flow_u,
        "P_Sensor_1": pressure_u
    })
    df_use.to_excel("test_useful.xlsx", index=False)
    print("Generated test_useful.xlsx")

    # 3. Anomaly Run
    temp_a = 22 + 53 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.3, len(time))
    temp_a[45:] = 22 + 10 * np.exp(-(time[45:] - 45) / 10) + np.random.normal(0, 0.5, len(time[45:]))
    flow_a = np.zeros(len(time))
    flow_a[15:80] = 5.2 + np.random.normal(0, 0.1, len(time[15:80]))
    flow_a[40:60] = 1.1 + np.random.normal(0, 0.15, len(time[40:60]))
    pressure_a = np.zeros(len(time))
    pressure_a[15:80] = 2.4 + np.random.normal(0, 0.05, len(time[15:80]))
    pressure_a[40:60] = 0.3 + np.random.normal(0, 0.05, len(time[40:60]))
    
    df_ano = pd.DataFrame({
        "Time": time,
        "T_Sensor_ZoneA": temp_a,
        "Flow_Rate_Sensor": flow_a,
        "P_Sensor_1": pressure_a
    })
    df_ano.to_excel("test_anomaly.xlsx", index=False)
    print("Generated test_anomaly.xlsx")

def generate_multi_reference_baseline_data():
    """
    Generates datasets to test Feature 3 Multi-Reference Baseline Engine:
    - Target Progress Variable: FMC% (Drying progress: 100% -> 0%)
    - ref_baseline_run1.xlsx: Clean normal cycle
    - ref_baseline_run2.xlsx: Slight natural appliance variation
    - ref_baseline_run3.xlsx: Union schema variation (contains extra sensor Flow_Rate_lpm)
    - ref_jitter_repaired.xlsx: Jitter deviation < 2% (repaired by monotonic PCHIP)
    - ref_rejected_severe_reversal.xlsx: Severe reversal > 2% (rejected from baseline pool)
    - test_eval_run.xlsx: Test run with corridor violations
    """
    n_pts = 120
    time = np.linspace(0, 3600, n_pts) # 1 hour cycle

    # FMC% progress from 100% down to 0%
    fmc_base = 100.0 * np.exp(-time / 1400.0)
    fmc_base = (fmc_base - fmc_base[-1]) / (fmc_base[0] - fmc_base[-1]) * 100.0

    # Channels
    temp_profile = 22.0 + 55.0 * (1 - np.exp(-time / 600.0))
    speed_profile = 800.0 + 400.0 * (time / 3600.0)
    power_profile = 2200.0 * np.exp(-time / 1800.0) + 200.0
    pressure_profile = 1.2 + 0.8 * np.sin(time / 400.0)

    # 1. Reference Run 1 (Clean baseline)
    np.random.seed(10)
    df_run1 = pd.DataFrame({
        "FMC%": np.round(fmc_base, 2),
        "Temp_Zone1": np.round(temp_profile + np.random.normal(0, 0.4, n_pts), 2),
        "Motor_Speed_rpm": np.round(speed_profile + np.random.normal(0, 5, n_pts), 1),
        "Heater_Power_W": np.round(power_profile + np.random.normal(0, 10, n_pts), 1),
        "Pressure_Zone1": np.round(pressure_profile + np.random.normal(0, 0.02, n_pts), 3)
    })
    df_run1.to_excel("ref_baseline_run1.xlsx", index=False)
    print("Generated ref_baseline_run1.xlsx")

    # 2. Reference Run 2 (Natural appliance variation ~3%)
    np.random.seed(20)
    df_run2 = pd.DataFrame({
        "FMC%": np.round(fmc_base, 2),
        "Temp_Zone1": np.round(temp_profile * 0.97 + np.random.normal(0, 0.4, n_pts), 2),
        "Motor_Speed_rpm": np.round(speed_profile * 1.02 + np.random.normal(0, 6, n_pts), 1),
        "Heater_Power_W": np.round(power_profile * 0.98 + np.random.normal(0, 12, n_pts), 1),
        "Pressure_Zone1": np.round(pressure_profile * 1.03 + np.random.normal(0, 0.02, n_pts), 3)
    })
    df_run2.to_excel("ref_baseline_run2.xlsx", index=False)
    print("Generated ref_baseline_run2.xlsx")

    # 3. Reference Run 3 (Union Schema with extra channel Flow_Rate_lpm)
    np.random.seed(30)
    flow_lpm = 4.5 + 1.2 * np.sin(time / 300.0) + np.random.normal(0, 0.05, n_pts)
    df_run3 = pd.DataFrame({
        "FMC%": np.round(fmc_base, 2),
        "Temp_Zone1": np.round(temp_profile * 1.02 + np.random.normal(0, 0.3, n_pts), 2),
        "Motor_Speed_rpm": np.round(speed_profile * 0.99 + np.random.normal(0, 5, n_pts), 1),
        "Heater_Power_W": np.round(power_profile * 1.01 + np.random.normal(0, 10, n_pts), 1),
        "Flow_Rate_lpm": np.round(flow_lpm, 2)
    })
    df_run3.to_excel("ref_baseline_run3.xlsx", index=False)
    print("Generated ref_baseline_run3.xlsx (Union Schema with Flow_Rate_lpm)")

    # 4. Jitter Run (Small noise jump < 2% of range = 0.8% at idx 40, recoverable by PCHIP)
    fmc_jitter = fmc_base.copy()
    fmc_jitter[40] = fmc_jitter[39] + 0.8 # 0.8% non-monotonic dip
    df_jitter = pd.DataFrame({
        "FMC%": np.round(fmc_jitter, 2),
        "Temp_Zone1": np.round(temp_profile + np.random.normal(0, 0.4, n_pts), 2),
        "Motor_Speed_rpm": np.round(speed_profile, 1),
        "Heater_Power_W": np.round(power_profile, 1)
    })
    df_jitter.to_excel("ref_jitter_repaired.xlsx", index=False)
    print("Generated ref_jitter_repaired.xlsx (Noise <2% repaired by PCHIP)")

    # 5. Rejected Severe Reversal Run (Large jump > 2% of range = 6.5% reversal at idx 50)
    fmc_severe = fmc_base.copy()
    fmc_severe[50] = fmc_severe[49] + 6.5 # 6.5% violation (> 2% threshold)
    df_severe = pd.DataFrame({
        "FMC%": np.round(fmc_severe, 2),
        "Temp_Zone1": np.round(temp_profile, 2),
        "Motor_Speed_rpm": np.round(speed_profile, 1)
    })
    df_severe.to_excel("ref_rejected_severe_reversal.xlsx", index=False)
    print("Generated ref_rejected_severe_reversal.xlsx (Severe reversal >2% rejected)")

    # 6. Test Evaluation Run (deviates midway for corridor violation test)
    temp_eval = temp_profile.copy()
    temp_eval[40:70] += 16.0 # Severe overheating exceeding tolerance corridor
    speed_eval = speed_profile * 0.95
    df_eval = pd.DataFrame({
        "FMC%": np.round(fmc_base, 2),
        "Temp_Zone1": np.round(temp_eval + np.random.normal(0, 0.5, n_pts), 2),
        "Motor_Speed_rpm": np.round(speed_eval, 1),
        "Heater_Power_W": np.round(power_profile + np.random.normal(0, 15, n_pts), 1),
        "Pressure_Zone1": np.round(pressure_profile, 3)
    })
    df_eval.to_excel("test_eval_run.xlsx", index=False)
    print("Generated test_eval_run.xlsx (Contains corridor overheating violations)")

if __name__ == "__main__":
    generate_legacy_runs()
    generate_multi_reference_baseline_data()
