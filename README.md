# SensorLens 🔬

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat&logo=vite&logoColor=white)](https://vite.dev/)
[![Apache ECharts](https://img.shields.io/badge/Apache_ECharts-6.1-AA344D?style=flat&logo=apacheecharts&logoColor=white)](https://echarts.apache.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**SensorLens** is a domain-agnostic, full-stack telemetry analytics workbench designed for appliance validation, hardware engineering, and R&D teams. It enables engineers to ingest multi-channel sensor logs in Excel/CSV format, explore complex waveforms through high-performance charts, establish statistical tolerance corridors, and run machine learning diagnostics against golden baseline profiles.

Since it is **domain-agnostic**, SensorLens makes no assumptions about sensor naming conventions, operational thresholds, or appliance architectures. Everything—from custom category groupings and lexical alignment to confidence envelopes—adapts dynamically at runtime.

---

## 🌟 Key Engines & Features

### 1. Workspace Dashboard & Live Sparklines
* **Multi-File Library Management**: Drag & drop multiple Excel or CSV run files. Tag files as `Reference` (golden standards), `Useful Runs`, `Needs Review`, or `Archive`.
* **Live Channel Statistics**: Instant min, max, mean, and sparkline trend previews for all detected sensor channels across all active datasets.
* **Auto-Reconciling Selection**: Intelligent header state synchronization ensuring active reference and test comparison runs remain balanced across views.

### 2. Visual Report & Multi-Axis Plotter (Apache ECharts)
* **Custom Sensor Buckets & Category Manager**: Create, rename, recolor, delete, and bulk-assign channels to user-defined categories (e.g. Temperature, Pressure, Flow Rate, Motor Speed, Cycle Progress) with persisted custom color palettes.
* **Fast Channel Reassignment**: In-line `⇄` popovers for quick category swaps, and bulk `Move Selected (N) to...` operations.
* **Responsive Stage**: Toggle chart types (Line, Scatter, Bar), responsive time-series scrubbing with dual sliders, and color-matched channel badges with instant remove buttons.

### 3. Two-Stage Lexical + Tactile Column Alignment
* **Stage 1 Lexical Auto-Matching**: Deterministic normalization, engineering unit stripping (`degC`, `rpm`, `bar`, `w`, `lpm`, etc.), and Levenshtein string similarity ($\ge 0.85$).
* **Stage 2 Interactive DnD Workspace**: Tactile drag-and-drop bank powered by `@hello-pangea/dnd` to map unassigned test channels into golden reference slots.
* **Stage 3 Dynamic Pair Scoring**: Real-time Pearson $r$ correlation and FastDTW temporal score badges calculated on drop and swap.

### 4. Multi-Reference Baseline Engine with Tolerance Corridors
* **Multi-File Baseline Aggregation**: Pool multiple golden reference runs simultaneously to capture natural machine-to-machine manufacturing variance.
* **Progress Variable Normalization**: Resample cycles against physical progress metrics (e.g. Final Moisture Content `FMC%` or heating progress) on a 500-point uniform grid.
* **Monotonicity Guard**: Automatically detects non-monotonic progress reversals (<2% repaired via shape-preserving PCHIP interpolation; >2% triggers a safety rejection warning).
* **Dynamic Tolerance Corridors**: Configurable confidence envelope ($\mu \pm k\sigma$) with shaded band overlays, safety floor margins, and automatic out-of-bounds defect violation scorecards (Cumulative Absolute Deviation & Out-of-Bounds %).

### 5. Waveform Similarity Matcher & AI Assessment
* **Multi-Metric Comparison**: Dual-waveform overlay comparing test curves against golden baselines using Pearson correlation, FastDTW temporal warping, starting lag detection, calibration offsets, and peak height deviations.
* **Automated Engineering Assessment**: Human-readable diagnostic summaries explaining waveform compliance, temporal delays, and anomaly locations.
* **Human-in-the-Loop Feedback**: Feedback logger to record engineering judgments and tune similarity thresholds over time.

### 6. Analytics & Machine Learning Studio
* **Predictive Drivers & Sensitivity Tornado Chart**: Rank the strongest physical drivers behind any selected target sensor across 5 mathematical algorithms (Pearson $r$, Spearman $\rho$, Kendall $\tau$, FastDTW, and Mutual Information).
* **Machine Learning Model Studio**: Train and benchmark 6 ML architectures (Random Forest, LightGBM, XGBoost, Support Vector Regressors, ElasticNet, and MLP Neural Networks) across cross-run pooled telemetry, complete with actual vs. predicted trajectory overlays and feature importance rankings.
* **Feature Studio & Composite Sensors**: Construct derived virtual sensors using mathematical operations (Difference, Ratio, Power, Derivative, Normalized, Product) and rolling window aggregations.
* **Remaining Useful Life (RUL) Prognostics**: Fit mathematical degradation models (Exponential, Polynomial, Linear) to extrapolate future operating horizons and estimate Remaining Useful Life before reaching critical failure boundaries.

### 7. Workspace State Persistence & OneDrive Sync
* Export and import the entire active workspace (all datasets, tags, mappings, and annotations) as a single portable JSON session file.
* Direct export of markdown test reports to target team folders or cloud storage directories for documentation.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Apache ECharts (`echarts-for-react`), `@hello-pangea/dnd`, Lucide Icons, Vanilla CSS Design System |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, Pandas, NumPy, SciPy (PCHIP monotonic interpolation & signal processing), FastDTW, Pydantic |
| **Machine Learning** | scikit-learn, XGBoost, LightGBM |
| **Deployment** | Vercel (Edge Frontend CDN), Render (Python API Web Service), Multi-Stage Dockerfile |

---

## 🌐 Online Deployment

SensorLens is designed for production cloud hosting:

* **Frontend**: Hosted on **Vercel** with global Edge CDN caching and instantaneous route loading.
* **Backend**: Hosted on **Render** (or Docker container) running FastAPI and Uvicorn.
* **Dynamic API Configuration**: Automatically switches between local development (`http://localhost:8000`) and the production API URL via `VITE_API_URL` without code changes.

---

## 🚀 Local Setup & Installation

### ⚡ 1-Click Setup & Launch (Windows)
When cloning or downloading the repository on a new machine:
* **First-Time Setup**: Double-click **`setup_first_time.bat`**. This automatically creates the Python virtual environment, installs all Python packages (`requirements.txt`), installs frontend packages (`npm install`), and places a **SensorLens** shortcut on your Desktop.
* **Launch**: Double-click **`start_sensorlens.bat`** (or the Desktop shortcut). Both backend and frontend servers launch in the background and SensorLens opens automatically in your browser at `http://localhost:5173/`.
* **Stop**: Double-click **`stop_sensorlens.bat`** to terminate all background services.

---

### 💻 Manual Setup

#### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m venv .venv

# Activate virtual environment:
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
pytest tests/
python -m uvicorn main:app --reload --port 8000
```

#### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev -- --port 5173
```

---

## 🧪 Demonstration & Test Datasets

SensorLens includes automated generators for synthetic appliance thermodynamic data:

### 1. Public Demonstration Showcase (`demo_datasets/`)
To generate clean, compliant demo datasets with realistic appliance sensor names (`Drum_Temperature_degC`, `Condenser_Inlet_Temp_degC`, `FMC_Progress_%`, `System_Pressure_bar`):
```bash
python generate_demo_showcase_data.py
```
This produces 5 ready-to-use Excel datasets in `demo_datasets/`:
* `Golden_Baseline_Run_01.xlsx`, `Golden_Baseline_Run_02.xlsx`, `Golden_Baseline_Run_03.xlsx` (Reference baseline pool)
* `Validation_Test_Run_Normal.xlsx` (Clean test run with schema naming variations)
* `Validation_Test_Run_Anomaly.xlsx` (Test run with injected heating failure and moisture defect for corridor evaluation)

### 2. Edge-Case Unit Test Data
```bash
python generate_test_data.py
```
Generates synthetic files specifically designed for unit testing:
* `ref_jitter_repaired.xlsx`: Jitter deviation (<2%) repaired by monotonic PCHIP.
* `ref_rejected_severe_reversal.xlsx`: Severe progress reversal (>2%) triggering safety rejection.
* `test_eval_run.xlsx`: Out-of-bounds excursion run.

---

## 🧪 Automated Testing

Backend test suites cover signal processing, PCHIP monotonicity guards, progress normalization, lexical matching, and session import/export:
```bash
pytest backend/tests/
```

Frontend build and type verification:
```bash
cd frontend
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
