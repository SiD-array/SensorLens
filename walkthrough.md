# Walkthrough: Analytics UI Alignment & Global Font Size Scaling

We have resolved the UI layout issues in the **Analytics & ML Studio** tab and globally scaled the typography across every element in the frontend.

---

## 1. Analytics & ML Studio UI Layout Alignment
The class names in [`AnalyticsView.tsx`](file:///c:/Users/sidb9/Desktop/Projects/SensorLens/frontend/src/components/Analytics/AnalyticsView.tsx) now have complete, dedicated, dark-themed styling in [`index.css`](file:///c:/Users/sidb9/Desktop/Projects/SensorLens/frontend/src/index.css):

- **Header Bar**:
  - Full-width dark glass header with title, descriptive subtitle, active dataset selector, and styled navigation tab buttons (`Correlation Explorer` vs. `ML Model Studio`) with cyan glow active indicators.
- **Correlation Explorer Layout**:
  - **Left Sidebar (330px)**:
    - Algorithm Selector cards (`.algo-pill-btn`) for **Pearson**, **Spearman**, **Kendall Tau**, **FastDTW**, and **Mutual Information** with active dot indicators and description subtitles.
    - Sensor multi-select checklist (`.corr-channels-scroll`) with **Top 15** and **Clear** quick buttons.
    - Prominent **Compute Correlation Matrix** action button (`.btn-run-benchmark`) with gradient styling.
  - **Right Main Stage Grid**:
    - Split into a 2-column layout (`1.5fr : 1fr`):
      - **Left Column**: Responsive ECharts correlation heatmap with toolbar title and hover hints.
      - **Right Column**: Pairwise Diagnostic & Recommendation card with:
        - `col_a ↔ col_b` badge.
        - Emerald green recommendation banner explaining why a specific algorithm is recommended.
        - 5-score comparison grid (Pearson, Spearman, Kendall, FastDTW, Mutual Info).
        - Embedded scatter plot preview.
- **ML Model Studio Layout**:
  - **Left Sidebar**:
    - Target Variable dropdown selector.
    - Input Feature Sensors checklist with **All Features** and **Clear** quick buttons.
    - Train/Test Split slider with dynamic percentage indicator.
    - **Train & Compare Models** action button.
  - **Right Main Stage**:
    - **Model Leaderboard Grid**: 3 responsive cards for **Random Forest**, **XGBoost**, and **LightGBM** with **BEST MODEL** champion badges, R² scores, RMSE, MAE, and training time.
    - **Actual vs Predicted Trajectory**: Full-width ECharts curve with dual X+Y zoom, train/test split boundary, and residual analysis.
    - **Feature Importance Rankings**: Horizontal bar chart ranking top predictive sensors.

---

## 2. Global Frontend Font Size Scaling
To address the tiny text across the dashboard, cards, lists, and tables:
1. **Base Root Font Scaling**:
   - Added `html { font-size: 18px; }` to [`index.css`](file:///c:/Users/sidb9/Desktop/Projects/SensorLens/frontend/src/index.css) (up from default `16px`), which automatically scales **all `rem`-based font sizes by +12.5%** across every screen in the app.
2. **Body Base Typography**:
   - Set `body { font-size: 0.95rem; line-height: 1.5; }`.
3. **Component-Specific Font Elevating**:
   - **Navigation & Brand**:
     - Brand title: `1.5rem` (up from 1.35rem).
     - Brand subtitle: `0.85rem` (up from 0.75rem).
     - Navigation toggle buttons: `0.95rem` (up from 0.85rem).
   - **Cards & Sensor Telemetry**:
     - Sensor titles: `1.0rem` (up from 0.88rem).
     - Sensor stats: `0.88rem` (up from 0.78rem).
     - File titles: `0.98rem` (up from 0.85rem).
     - Badges and status tags: `0.78rem` - `0.84rem` (up from 0.62rem - 0.70rem).
   - **Baseline & Scorecard**:
     - Channel names & headers: `1.1rem` (up from 0.95rem).
     - Diagnostic scorecard table cells: `0.85rem` (up from 0.72rem).
     - Diagnostic scorecard table headers: `0.76rem` (up from 0.62rem).
     - Verdict strip title: `1.05rem` (up from 0.84rem).
     - Verdict summary: `0.88rem` (up from 0.72rem).
   - **Form Controls**:
     - Inputs, selects, and textareas: `0.90rem` - `0.92rem` (up from 0.76rem - 0.80rem).

---

## 3. Verification & Live Servers
- **Automated Tests**: Ran `pytest backend/tests/ -v` &mdash; **18/18 tests passed (100%)**.
- **Frontend Production Build**: Ran `npm run build` &mdash; **compiled cleanly in 1.02s with zero errors**.
- **Live Servers Active**:
  - **Backend API**: `http://127.0.0.1:8000` (FastAPI + Uvicorn)
  - **Frontend UI**: `http://localhost:5173/` (Vite + React)
