import pandas as pd
import numpy as np

def generate_reference():
    np.random.seed(42)
    time = np.arange(0, 100, 1) # 100 seconds
    
    # Normal temperature profile: heats up from 22°C to 75°C, then stabilizes, then cools
    temp = 22 + 53 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.3, len(time))
    
    # Normal flow rate: starts slow, step up at t=15, turns off at t=80
    flow = np.zeros(len(time))
    flow[15:80] = 5.2 + np.random.normal(0, 0.1, len(time[15:80]))
    flow[80:] = np.random.normal(0, 0.02, len(time[80:]))
    
    # Pressure profile
    pressure = np.zeros(len(time))
    pressure[15:80] = 2.4 + np.random.normal(0, 0.05, len(time[15:80]))
    
    df = pd.DataFrame({
        "Time": time,
        "Temp_Zone1": temp,
        "Flow_Rate": flow,
        "Pressure_Zone1": pressure
    })
    df.to_excel("test_reference.xlsx", index=False)
    print("Generated test_reference.xlsx")

def generate_useful_run():
    np.random.seed(101)
    time = np.arange(0, 100, 1)
    
    # Useful run: delayed by 8 seconds (lag), slightly lower heating peak (72°C), different column names
    # Create time shift by shifting curves
    shift = 8
    
    # Temp curve: shifted
    temp_raw = 22 + 50 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.4, len(time))
    temp = np.roll(temp_raw, shift)
    temp[:shift] = 22.0 # pad start
    
    # Flow curve: shifted
    flow_raw = np.zeros(len(time))
    flow_raw[15:80] = 5.0 + np.random.normal(0, 0.12, len(time[15:80]))
    flow = np.roll(flow_raw, shift)
    flow[:shift] = 0.0
    
    # Pressure curve: shifted and slightly scaled
    pressure_raw = np.zeros(len(time))
    pressure_raw[15:80] = 2.25 + np.random.normal(0, 0.06, len(time[15:80]))
    pressure = np.roll(pressure_raw, shift)
    pressure[:shift] = 0.0
    
    df = pd.DataFrame({
        "Time": time,
        "T_Sensor_ZoneA": temp,         # Mismatched name (Ref: Temp_Zone1)
        "Flow_Rate_Sensor": flow,       # Mismatched name (Ref: Flow_Rate)
        "P_Sensor_1": pressure          # Mismatched name (Ref: Pressure_Zone1)
    })
    df.to_excel("test_useful.xlsx", index=False)
    print("Generated test_useful.xlsx")

def generate_anomaly_run():
    np.random.seed(99)
    time = np.arange(0, 100, 1)
    
    # Anomaly run: Heating breaks down midway (t=45), flow has massive leak spike at t=35, names match the useful run
    temp = 22 + 53 * (1 - np.exp(-time / 20)) + np.random.normal(0, 0.3, len(time))
    # Drop temp to room temp starting from t=45
    temp[45:] = 22 + 10 * np.exp(-(time[45:] - 45) / 10) + np.random.normal(0, 0.5, len(time[45:]))
    
    # Flow: massive drop at t=40 (leak)
    flow = np.zeros(len(time))
    flow[15:80] = 5.2 + np.random.normal(0, 0.1, len(time[15:80]))
    flow[40:60] = 1.1 + np.random.normal(0, 0.15, len(time[40:60])) # leak!
    
    # Pressure: drops to near-zero during flow leak
    pressure = np.zeros(len(time))
    pressure[15:80] = 2.4 + np.random.normal(0, 0.05, len(time[15:80]))
    pressure[40:60] = 0.3 + np.random.normal(0, 0.05, len(time[40:60]))
    
    df = pd.DataFrame({
        "Time": time,
        "T_Sensor_ZoneA": temp,
        "Flow_Rate_Sensor": flow,
        "P_Sensor_1": pressure
    })
    df.to_excel("test_anomaly.xlsx", index=False)
    print("Generated test_anomaly.xlsx")

if __name__ == "__main__":
    generate_reference()
    generate_useful_run()
    generate_anomaly_run()
