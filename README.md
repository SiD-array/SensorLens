# SensorLens

**SensorLens** is a domain-agnostic full-stack web application designed for appliance engineering teams to ingest sensor test runs in Excel format, explore them through interactive charts, and run pattern-matching similarity diagnostics against baseline profiles.

Since it is domain-agnostic, the platform makes no assumptions about sensor names, thresholds, or appliance types (laundry, dishwashers, refrigeration, etc.). Everything is fully configurable at runtime.

---

## 🌟 Key Features

1. **Test Run Ingestion & Tagging**: Upload multiple Excel or CSV log files. Manage them in a central library list and categorize them as `Reference` (correct baseline profiles), `Useful Runs`, `Needs Review`, or `Archive`.
2. **Visual Report 2-Column Workbench (Apache ECharts)**: 
   * **User-Configurable Sensor Categories (Buckets)**: Complete flexibility to create custom sensor categories with curated color palettes. Open the **Category Manager** modal to create, rename, recolor, delete, and bulk-assign sensors across categories.
   * **Fast Sensor Reassignments**: Move individual sensors to any category via in-line `⇄` quick-pick popovers, or select multiple sensors and use the bulk `Move Selected (N) to...` action. All groupings and custom categories persist automatically in `localStorage`.
   * **Left Sidebar**: Fuzzy search, category grouping accordions, channel diagnostic presets saved to `localStorage`, dual "Available" vs "Active Plotted" views, and sleek mouse-wheel scrolling with high-contrast indicator bars.
   * **Main Stage**: Color-matched channel badges with quick-remove buttons, chart type toggling (Line, Scatter, Bar), and responsive full-height time-series visualization.
3. **Two-Stage Lexical + Tactile Drag-and-Drop Column Alignment**: 
   * **Stage 1 Lexical Auto-Matching**: Deterministic normalization, engineering unit stripping (`degc`, `rpm`, `bar`, `w`, etc.), and Levenshtein similarity ($\ge 0.85$).
   * **Stage 2 Interactive DnD Workspace**: Unassigned channel bank, reference drop targets, and drag-and-drop realignment via `@hello-pangea/dnd`.
   * **Stage 3 Dynamic Pair Scoring**: Real-time Pearson $r$ correlation and FastDTW score badges calculated on drop/swap.
4. **Generalized Multi-Reference Baseline Engine with Tolerance Corridors**:
   * **Multi-File Reference Aggregation**: Ingest multiple golden reference runs simultaneously.
   * **Progress Variable Normalization**: Resample cycles against progress variables (e.g. `FMC%` or elapsed progress) using a 500-point uniform grid.
   * **Monotonicity Guard**: Automatically detects progress reversals (<2% PCHIP monotonic repair, >2% rejection warning banner).
   * **Dynamic Tolerance Corridors**: Configurable confidence envelope ($\mu \pm k\sigma$), shaded band overlay, red out-of-bounds violation highlighting, and quantitative scorecard metrics (Violation %, Cumulative Absolute Deviation, Trend Correlation).
5. **Time-Series Matching Engine**: Compares waveforms using Pearson Correlation, FastDTW, starting lag detection, baseline calibration shifts, and peak height deviations.
6. **Workspace Session Save & OneDrive Export**:
   * Export/Import the entire active workspace (all files, tags, mappings, and comments) as a single JSON file.
   * Sync and export markdown reports directly into a local folder for team documentation and AI search.

---

## 🛠️ Technology Stack

* **Frontend**: React, Vite, TypeScript, Apache ECharts (`echarts-for-react`), `@hello-pangea/dnd`, Lucide Icons, Vanilla CSS
* **Backend**: Python, FastAPI, Pandas, NumPy, SciPy (PCHIP monotonic interpolation & signal correlation), FastDTW, Pydantic, Uvicorn

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
4. Run automated backend tests:
   ```bash
   pytest tests/
   ```
5. Start the FastAPI backend server (running on port 8000):
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```

### 2. Frontend Setup
1. In a new terminal window, navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server (running on port 5173):
   ```bash
   npm run dev -- --port 5173
   ```

### 3. Generate Mock Test Data
To quickly generate reference, anomaly, baseline, and evaluation runs, run the test generator:
```bash
python generate_test_data.py
```
This generates:
* `test_reference.xlsx`, `test_useful.xlsx`, `test_anomaly.xlsx`: Legacy comparison runs.
* `ref_baseline_run1.xlsx`, `ref_baseline_run2.xlsx`, `ref_baseline_run3.xlsx`: Multi-reference baseline golden runs.
* `ref_jitter_repaired.xlsx`: Run with minor jitter repaired by monotonic PCHIP.
* `ref_rejected_severe_reversal.xlsx`: Run with severe progress reversal triggering safety rejection.
* `test_eval_run.xlsx`: Appliance test run with artificial cooling failures and heater dropouts for corridor evaluation.

---

## 📖 Quick User Guide

1. **Upload Runs**: In **Dashboard**, upload reference and evaluation runs.
2. **Visual Report**: Switch to **Visual Report**, use presets (Thermal, Motor, Pressure) or search channels, toggle channels, and inspect multi-series overlays.
3. **Column Alignment**: Switch to **Column Alignment** to verify Stage 1 lexical matches, drag channels from the unassigned bank, and inspect real-time Pearson and DTW scores.
4. **Baseline Engine**: Switch to **Baseline Engine**, upload multiple reference files, configure the $k\sigma$ tolerance slider, and evaluate test runs against the dynamic tolerance corridor.
