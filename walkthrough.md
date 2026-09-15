# Walkthrough: Senior UI/UX Upgrade & Predictive Target Correlation Studio

We have upgraded the **Analytics & ML Studio** into a cohesive 5-star experience, addressing the active runs popover stacking bug and introducing a **Target-Driven Predictive Workflow** that connects correlation discovery directly to ML training.

---

## 1. Stacking Context & Z-Index Bug Resolution
### Root Cause:
In [`frontend/src/index.css`](file:///c:/Users/sidb9/Desktop/Projects/SensorLens/frontend/src/index.css), `.analytics-header` lacked an explicit stacking context (`position: relative; z-index: ...`). Because `.analytics-body-grid` was a subsequent sibling in DOM order, its child containers (specifically HTML5 Canvas elements initialized by ECharts) created an isolated GPU composite layer that painted in front of the floating multi-run selector popover.

### Fix Implemented:
1. **Header Stacking Context**:
   Added `position: relative; z-index: 100;` to `.analytics-header`.
2. **Container Elevation**:
   Added `position: relative; z-index: 110;` to `.multi-run-selector-container`.
3. **Dropdown Popover Elevation**:
   Elevated `.multi-run-popover` to `z-index: 9999;`, guaranteeing the active runs popover floats crisply above all heatmaps, charts, and canvases.

---

## 2. Target Variable Integration into Correlation Explorer
Rather than examining correlations in a vacuum, industrial telemetry engineers can now define the **Target Metric / Sensor Objective** directly in the Correlation Explorer:

1. **Sidebar Target Variable Selector**:
   - Section 1 in the Correlation sidebar now features a dedicated **Target Variable Objective Card** (`.target-objective-card`) with an "Objective" badge and dropdown.
   - Allows choosing any sensor column or selecting `"-- No Target (General Discovery) --"`.
2. **Algorithm-Aware Driver Ranking**:
   - When a Target Variable is active, the backend (`/api/analytics/correlations`) ranks all other channels by their direct coupling score $|M[\text{target}, \text{feature}]|$ under the active algorithm.
   - The quick action button dynamically updates to **"Top 15 Drivers ★"**, automatically selecting the target and its 14 strongest predictive channels.

---

## 3. Dual-View Stage: Predictive Drivers Impact (Tornado Chart) vs. Heatmap Matrix
On the main stage, users can now toggle between two visualization modes:

1. **Predictive Drivers Impact (Tornado Chart)**:
   - Horizontal diverging bar chart ($r \in [-1, 1]$) with rounded bars.
   - **Emerald / Green (`#10b981`)**: Positive coupling (sensor increases with target).
   - **Rose / Red (`#f43f5e`)**: Inverse coupling (sensor decreases as target rises).
   - **Interactive Deep-Dive**: Clicking any bar immediately loads the **Pairwise Diagnostic & Recommendation** in the right panel (`Target ↔ Selected Driver`) with scatter plot, non-linearity detection, and phase-lag analysis.
2. **1-Click Bridge to ML Model Studio**:
   - A glowing **"Train ML Models with Drivers 🚀"** button right on the Tornado chart header transfers the target variable and top 8 predictive drivers directly into the ML Model Studio and switches tabs seamlessly.
3. **Full Correlation Matrix**:
   - The $N \times N$ interactive heatmap remains available via the stage toggle (`Matrix`) for holistic pairwise pattern discovery.

---

## 4. Manual PCA / Composite Sensor Builder
- Accessible via the **"Combine / PCA"** button in the sidebar.
- Allows combining collinear or redundant channels using **PCA (1st Principal Component)** or **Z-Score Normalized Averaging**.
- Injected in-place into all selected test runs, with variance explained percentage and instant re-analysis.

---

## 5. Automated Verification Results
- **Backend Test Suite**:
  - Ran `pytest backend/tests/ -v` &mdash; **20/20 tests passed (100%)**.
  - Verified tests for Pearson, Spearman, Kendall, FastDTW, Mutual Information, Pair Diagnosis, ML Model Training, Multi-Run Pooling, Target-Specific Feature Ranking, and PCA/Average Composite Sensor generation.
- **Frontend Production Build**:
  - Ran `npm run build` &mdash; **compiled cleanly in 1.39s with zero errors**.
- **Live Background Servers**:
  - **Backend API**: `http://127.0.0.1:8000` (FastAPI + Uvicorn with auto-reload).
  - **Frontend UI**: `http://localhost:5173/` (Vite + React dev server).
