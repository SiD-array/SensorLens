# SensorLens

**SensorLens** is a domain-agnostic full-stack web application designed for appliance engineering teams to ingest sensor test runs in Excel format, explore them through interactive charts, and run pattern-matching similarity diagnostics against baseline profiles.

Since it is domain-agnostic, the platform makes no assumptions about sensor names, thresholds, or appliance types (laundry, dishwashers, refrigeration, etc.). Everything is fully configurable at runtime.

---

## 🌟 Key Features

1. **Test Run Ingestion & Tagging**: Upload multiple Excel log files. Manage them in a central library list and categorize them as `Reference` (correct baseline profiles), `Useful Runs`, `Needs Review`, or `Archive`.
2. **Multi-Series Graphing (Apache ECharts)**: Cross-plot multiple sensors from different runs on a single Canvas. Zoom into specific timeframes, pan, and hover over individual legend names to isolate/highlight specific curves.
3. **Tactile Drag-and-Drop Sensor Alignment**: Align mismatched sensor names (e.g. mapping `Temp_Zone_1` in the Reference run to `T_Sensor_A` in the Test run) by dragging cards into target slots. Features a **Smart Auto-Suggest** algorithm (Levenshtein distance) that pre-maps matching pairs automatically.
4. **Time-Series Matching Engine**: Compares waveforms using advanced data science methods:
   * **Pearson Correlation**: Measures wave shape timing synchronization (synchronized rises and falls).
   * **Dynamic Time Warping (DTW)**: Stretches and aligns curves in time to measure pattern likeness regardless of starting delays or speed shifts.
   * **Physical Offsets**: Automatically detects starting lag in seconds, baseline calibration shifts, and peak height deviations.
5. **Easy-to-Read Engineering Reports**: Generates a natural-language report summarising the physical signal differences (e.g., delays, peak value drops) using simple, intuitive terminology.
6. **Workspace Session Save & OneDrive Export**:
   * Export/Import the entire active workspace (all files, tags, mappings, and comments) as a single JSON file.
   * Sync and export markdown reports directly into a local OneDrive folder for team AI assistants (like Copilot) to index and query.

---

## 🛠️ Technology Stack

* **Frontend**: React, Vite, TypeScript, Apache ECharts (`echarts-for-react`), Lucide Icons, Vanilla CSS
* **Backend**: Python, FastAPI, Pandas, NumPy, SciPy (signals/correlation), FastDTW, Pydantic, Uvicorn

---

## 🚀 Setup & Installation

### 1. Backend Setup
1. Open your terminal and navigate to the `backend/` folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # On Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source .venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI backend server (running on port 8000):
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```

### 2. Frontend Setup
1. In a new terminal window, navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Install the node packages:
   ```bash
   npm install
   ```
3. Start the Vite React development server (running on port 5173):
   ```bash
   npm run dev -- --port 5173
   ```

### 3. Generate Mock Test Data (Optional)
To quickly test the platform, run the data generator script in the root directory. It generates three Excel runs with shifts and anomalies:
```bash
# Run this from the project root using the activated backend virtual environment
python generate_test_data.py
```
This generates:
* `test_reference.xlsx`: The expected operational pattern.
* `test_useful.xlsx`: A valid test run featuring a 8-second delay offset.
* `test_anomaly.xlsx`: A faulty test run featuring a mid-cycle heating element shutdown and a water flow leak.

---

## 📖 Quick User Guide

1. **Ingest Runs**: Upload `test_reference.xlsx`, `test_useful.xlsx`, and `test_anomaly.xlsx` in the dashboard.
2. **Assign Roles**:
   * For `test_reference.xlsx`, click **Ref** (Reference baseline).
   * For `test_useful.xlsx`, click **Test** (evaluation run).
3. **Graphing**: Click the `T_Sensor_ZoneA` card and switch to **Visual Report** to inspect the temperature heating curves.
4. **Align Columns**: Switch to the **Similarity Matcher** tab. Note that similar columns are auto-aligned. Drag-and-drop cards to swap or re-align if needed.
5. **Run Comparison**: Click **Run Similarity Engine**. Review the gauges and check the engineering assessment text. Mark correct/incorrect and write comments.
