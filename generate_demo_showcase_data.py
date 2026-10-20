import os
import numpy as np
import pandas as pd

def create_demo_datasets():
    output_dir = "demo_datasets"
    os.makedirs(output_dir, exist_ok=True)
    
    n_pts = 160
    time = np.linspace(0, 3600, n_pts) # 1 hour drying/heating cycle
    
    # Progress variable: Final Moisture Content (FMC) decreasing from 100% down to 0%
    fmc_curve = 100.0 * np.exp(-time / 1400.0)
    fmc_curve = np.clip((fmc_curve - fmc_curve[-1]) / (fmc_curve[0] - fmc_curve[-1]) * 100.0, 0, 100)

    # Base physics profiles
    drum_temp_base = 22.0 + 54.0 * (1 - np.exp(-time / 700.0))
    cond_in_base = 24.0 + 48.0 * (1 - np.exp(-time / 800.0))
    cond_out_base = 22.0 + 38.0 * (1 - np.exp(-time / 850.0))
    evap_in_base = 18.0 + 12.0 * np.sin(time / 500.0)
    comp_base = 25.0 + 58.0 * (1 - np.exp(-time / 900.0))
    ambient_base = 21.5 + 1.2 * np.sin(time / 1200.0)
    speed_base = 800.0 + 350.0 * (time / 3600.0)
    power_base = 2100.0 * np.exp(-time / 1600.0) + 250.0
    moisture_sensor_base = 450.0 * (fmc_curve / 100.0)**1.2 + 40.0
    pressure_base = 1.2 + 0.6 * np.sin(time / 450.0)
    flow_base = 4.8 + 0.4 * np.cos(time / 600.0)
    energy_base = np.cumsum(power_base * (time[1] - time[0]) / 3600000.0)
    voltage_base = 230.0 + 1.5 * np.sin(time / 300.0)

    # 1. Golden Baseline Run 01
    np.random.seed(101)
    df_ref1 = pd.DataFrame({
        "Time_s": np.round(time, 1),
        "FMC_Progress_%": np.round(fmc_curve, 2),
        "Drum_Moisture_Sensor": np.round(moisture_sensor_base + np.random.normal(0, 1.5, n_pts), 1),
        "Drum_Temperature_degC": np.round(drum_temp_base + np.random.normal(0, 0.3, n_pts), 2),
        "Condenser_Inlet_Temp_degC": np.round(cond_in_base + np.random.normal(0, 0.3, n_pts), 2),
        "Condenser_Outlet_Temp_degC": np.round(cond_out_base + np.random.normal(0, 0.25, n_pts), 2),
        "Evaporator_Temp_degC": np.round(evap_in_base + np.random.normal(0, 0.2, n_pts), 2),
        "Compressor_Base_Temp_degC": np.round(comp_base + np.random.normal(0, 0.4, n_pts), 2),
        "Ambient_Temperature_degC": np.round(ambient_base + np.random.normal(0, 0.1, n_pts), 2),
        "Motor_Speed_RPM": np.round(speed_base + np.random.normal(0, 4.0, n_pts), 1),
        "Heater_Power_W": np.round(power_base + np.random.normal(0, 8.0, n_pts), 1),
        "System_Pressure_bar": np.round(pressure_base + np.random.normal(0, 0.02, n_pts), 3),
        "Circulation_Flow_Rate_lpm": np.round(flow_base + np.random.normal(0, 0.05, n_pts), 2),
        "Active_Energy_kWh": np.round(energy_base, 3),
        "Mains_Voltage_V": np.round(voltage_base + np.random.normal(0, 0.4, n_pts), 1)
    })
    path_ref1 = os.path.join(output_dir, "Golden_Baseline_Run_01.xlsx")
    df_ref1.to_excel(path_ref1, index=False)
    print(f"Generated: {path_ref1}")

    # 2. Golden Baseline Run 02 (Slight natural variance)
    np.random.seed(102)
    df_ref2 = pd.DataFrame({
        "Time_s": np.round(time, 1),
        "FMC_Progress_%": np.round(np.clip(fmc_curve + np.random.normal(0, 0.3, n_pts), 0, 100), 2),
        "Drum_Moisture_Sensor": np.round(moisture_sensor_base + np.random.normal(0, 2.0, n_pts), 1),
        "Drum_Temperature_degC": np.round(drum_temp_base + np.random.normal(0.4, 0.35, n_pts), 2),
        "Condenser_Inlet_Temp_degC": np.round(cond_in_base + np.random.normal(0.3, 0.3, n_pts), 2),
        "Condenser_Outlet_Temp_degC": np.round(cond_out_base + np.random.normal(0.2, 0.25, n_pts), 2),
        "Evaporator_Temp_degC": np.round(evap_in_base + np.random.normal(0, 0.25, n_pts), 2),
        "Compressor_Base_Temp_degC": np.round(comp_base + np.random.normal(0.5, 0.4, n_pts), 2),
        "Ambient_Temperature_degC": np.round(ambient_base + np.random.normal(0.2, 0.1, n_pts), 2),
        "Motor_Speed_RPM": np.round(speed_base + np.random.normal(0, 5.0, n_pts), 1),
        "Heater_Power_W": np.round(power_base + np.random.normal(0, 10.0, n_pts), 1),
        "System_Pressure_bar": np.round(pressure_base + np.random.normal(0, 0.02, n_pts), 3),
        "Circulation_Flow_Rate_lpm": np.round(flow_base + np.random.normal(0, 0.05, n_pts), 2),
        "Active_Energy_kWh": np.round(energy_base * 1.01, 3),
        "Mains_Voltage_V": np.round(voltage_base + np.random.normal(0, 0.4, n_pts), 1)
    })
    path_ref2 = os.path.join(output_dir, "Golden_Baseline_Run_02.xlsx")
    df_ref2.to_excel(path_ref2, index=False)
    print(f"Generated: {path_ref2}")

    # 3. Golden Baseline Run 03 (Another baseline run)
    np.random.seed(103)
    df_ref3 = pd.DataFrame({
        "Time_s": np.round(time, 1),
        "FMC_Progress_%": np.round(np.clip(fmc_curve + np.random.normal(0, 0.35, n_pts), 0, 100), 2),
        "Drum_Moisture_Sensor": np.round(moisture_sensor_base + np.random.normal(0, 1.8, n_pts), 1),
        "Drum_Temperature_degC": np.round(drum_temp_base + np.random.normal(-0.3, 0.3, n_pts), 2),
        "Condenser_Inlet_Temp_degC": np.round(cond_in_base + np.random.normal(-0.2, 0.3, n_pts), 2),
        "Condenser_Outlet_Temp_degC": np.round(cond_out_base + np.random.normal(-0.2, 0.25, n_pts), 2),
        "Evaporator_Temp_degC": np.round(evap_in_base + np.random.normal(0, 0.2, n_pts), 2),
        "Compressor_Base_Temp_degC": np.round(comp_base + np.random.normal(-0.4, 0.4, n_pts), 2),
        "Ambient_Temperature_degC": np.round(ambient_base + np.random.normal(-0.1, 0.1, n_pts), 2),
        "Motor_Speed_RPM": np.round(speed_base + np.random.normal(0, 4.0, n_pts), 1),
        "Heater_Power_W": np.round(power_base + np.random.normal(0, 9.0, n_pts), 1),
        "System_Pressure_bar": np.round(pressure_base + np.random.normal(0, 0.02, n_pts), 3),
        "Circulation_Flow_Rate_lpm": np.round(flow_base + np.random.normal(0, 0.05, n_pts), 2),
        "Active_Energy_kWh": np.round(energy_base * 0.99, 3),
        "Mains_Voltage_V": np.round(voltage_base + np.random.normal(0, 0.4, n_pts), 1)
    })
    path_ref3 = os.path.join(output_dir, "Golden_Baseline_Run_03.xlsx")
    df_ref3.to_excel(path_ref3, index=False)
    print(f"Generated: {path_ref3}")

    # 4. Normal Validation Test Run (Mismatched header names for column alignment)
    np.random.seed(201)
    df_val_norm = pd.DataFrame({
        "Time": np.round(time, 1),
        "FMC_%": np.round(fmc_curve, 2),
        "Drum_Moisture_Raw": np.round(moisture_sensor_base + np.random.normal(0, 2.2, n_pts), 1),
        "Drum_Temp_degC": np.round(drum_temp_base + np.random.normal(0.2, 0.4, n_pts), 2),
        "Condenser_Inlet_T": np.round(cond_in_base + np.random.normal(0.1, 0.35, n_pts), 2),
        "Condenser_Outlet_T": np.round(cond_out_base + np.random.normal(0.1, 0.3, n_pts), 2),
        "Evaporator_Inlet_T": np.round(evap_in_base + np.random.normal(0, 0.25, n_pts), 2),
        "Compressor_Temp_C": np.round(comp_base + np.random.normal(0.3, 0.4, n_pts), 2),
        "Ambient_Temp": np.round(ambient_base + np.random.normal(0, 0.1, n_pts), 2),
        "Motor_RPM": np.round(speed_base + np.random.normal(0, 5.0, n_pts), 1),
        "Heater_Power": np.round(power_base + np.random.normal(0, 10.0, n_pts), 1),
        "Pressure_Zone1_bar": np.round(pressure_base + np.random.normal(0, 0.02, n_pts), 3),
        "Flow_Rate_Sensor_lpm": np.round(flow_base + np.random.normal(0, 0.06, n_pts), 2),
        "Energy_Consumption_kWh": np.round(energy_base * 1.02, 3),
        "Mains_Voltage": np.round(voltage_base + np.random.normal(0, 0.5, n_pts), 1)
    })
    path_norm = os.path.join(output_dir, "Validation_Test_Run_Normal.xlsx")
    df_val_norm.to_excel(path_norm, index=False)
    print(f"Generated: {path_norm}")

    # 5. Validation Test Run with DEFECT / ANOMALY
    # Causes an explicit corridor violation on Drum_Moisture_Raw & Drum_Temp
    np.random.seed(301)
    drum_temp_defect = drum_temp_base.copy()
    drum_temp_defect[60:110] = drum_temp_defect[60:110] - 18.0 + np.random.normal(0, 0.8, 50) # Heating failure
    moisture_defect = moisture_sensor_base.copy()
    moisture_defect[70:125] = moisture_defect[70:125] + 85.0 + np.random.normal(0, 3.0, 55) # Residual moisture anomaly
    
    df_val_ano = pd.DataFrame({
        "Time": np.round(time, 1),
        "FMC_%": np.round(fmc_curve, 2),
        "Drum_Moisture_Raw": np.round(moisture_defect, 1),
        "Drum_Temp_degC": np.round(drum_temp_defect, 2),
        "Condenser_Inlet_T": np.round(cond_in_base - 10.0 + np.random.normal(0, 0.4, n_pts), 2),
        "Condenser_Outlet_T": np.round(cond_out_base - 8.0 + np.random.normal(0, 0.3, n_pts), 2),
        "Evaporator_Inlet_T": np.round(evap_in_base + np.random.normal(0, 0.3, n_pts), 2),
        "Compressor_Temp_C": np.round(comp_base - 14.0 + np.random.normal(0, 0.5, n_pts), 2),
        "Ambient_Temp": np.round(ambient_base + np.random.normal(0, 0.1, n_pts), 2),
        "Motor_RPM": np.round(speed_base + np.random.normal(0, 5.0, n_pts), 1),
        "Heater_Power": np.round(np.where(time > 1500, 300.0, power_base) + np.random.normal(0, 10.0, n_pts), 1),
        "Pressure_Zone1_bar": np.round(pressure_base - 0.4 + np.random.normal(0, 0.03, n_pts), 3),
        "Flow_Rate_Sensor_lpm": np.round(flow_base + np.random.normal(0, 0.05, n_pts), 2),
        "Energy_Consumption_kWh": np.round(energy_base * 0.75, 3),
        "Mains_Voltage": np.round(voltage_base + np.random.normal(0, 0.5, n_pts), 1)
    })
    path_ano = os.path.join(output_dir, "Validation_Test_Run_Anomaly.xlsx")
    df_val_ano.to_excel(path_ano, index=False)
    print(f"Generated: {path_ano}")

if __name__ == "__main__":
    create_demo_datasets()
