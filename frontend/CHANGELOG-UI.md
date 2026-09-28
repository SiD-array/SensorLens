# SensorLens UI/UX & Architecture Changelog

## Executive Summary
This document records the comprehensive architectural, accessibility (WCAG 2.2 AA), performance, and visual design upgrades implemented across the SensorLens frontend. 

The application retains its high-tech engineering identity (cyan/blue accents, refined glassmorphic surfaces) while dramatically improving accessibility, modularity, perceived performance, and industrial-grade telemetry workflows.

---

## 1. Accessibility (WCAG 2.2 AA Compliance)

### 1.1 Contrast & Color Token Hierarchy
- **Text & UI Contrast Ratios**:
  - Regular body text: Standardized to achieve **> 7:1** contrast in light mode and **> 10:1** in dark mode (exceeding WCAG 2.2 AA requirement of 4.5:1).
  - UI control borders, badges, and icons meet or exceed the **3:1** non-text contrast threshold.
  - Light mode accents use tailored Sky/Cyan (`#0284c7`) and Cobalt Blue (`#2563eb`), ensuring crisp legibility against bright backgrounds without loss of brand identity.

### 1.2 Focus Visibility & Keyboard Navigation
- **`:focus-visible` Focus Rings**:
  - Global focus indicator with a high-contrast 2px cyan ring (`var(--accent-cyan)`), 2px offset, and subtle ambient focus glow (`box-shadow: 0 0 0 4px var(--accent-glow)`).
  - Keyboard focus is trapped within active modals (`Modal.tsx`) with automatic cycling (Tab / Shift+Tab wrap-around) and Escape key listener (`onKeyDown`).
  - Focus restoration returns focus to the trigger button upon modal dismissal.

### 1.3 ARIA Roles & Semantic Structure
- **Tabs**: Complete WAI-ARIA tab pattern (`role="tablist"`, `role="tab"`, `aria-selected="true|false"`, `aria-controls`) with full Arrow Left/Right/Home/End keyboard navigation.
- **Modals**: Complete dialog pattern (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`).
- **Icon-Only Buttons**: Accessible labels via `aria-label` and `title` attributes on all icon triggers (`IconButton.tsx`, header triggers, modal dismissals, quick-action controls).
- **Dual-Encoded Violations**:
  - Baseline envelope corridor deviations are encoded by **both color** (`#f43f5e` red) **and shape** (`symbol: 'diamond'`, 8px glyphs) with explicit visual legend, ensuring colorblind accessibility.

### 1.4 Reduced Motion
- Added `@media (prefers-reduced-motion: reduce)` media query across `tokens.css` and `base.css`:
  - Instantly collapses transition durations and animation steps (`transition-duration: 0.01ms !important`, `animation-duration: 0.01ms !important`).
  - Preserves instant state changes without disorientation for vestibular disorders.

### 1.5 Touch Targets
- All interactive controls, channel row items, buttons, and switches maintain touch bounding boxes of **≥ 40px** (`min-height: 40px`, padded hit targets).

---

## 2. Performance & Code Architecture

### 2.1 Code Splitting & Bundle Optimization
- **`manualChunks` Rollup Architecture**:
  - Isolated heavy vendor libraries into dedicated chunks:
    - `echarts-vendor`: `echarts`, `zrender` (~1.14 MB uncompressed, cached across routes)
    - `react-vendor`: `react`, `react-dom` (~182 kB)
    - `ui-vendor`: `lucide-react`, `@hello-pangea/dnd` (~110 kB)
- **`React.lazy` + `Suspense` Per View**:
  - The main application entry point (`index.js`) dropped from **1,671 kB down to 84 kB** (a **95% reduction** in initial bundle size).
  - Sub-views load asynchronously on demand with structured skeleton loaders:
    - `VisualReportView`: 23.9 kB
    - `ColumnAlignmentView`: 15.5 kB
    - `BaselineEngineView`: 34.1 kB
    - `AnalyticsView`: 72.8 kB
  - Zero build warnings; production builds complete in ~820ms.

### 2.2 Virtualized Sensor Channel Selector
- Implemented `VirtualizedChannelList` in `SensorSelector.tsx`:
  - Automatically activates windowing when category item counts exceed 25 channels.
  - Dynamically calculates visible slice using viewport scroll tracking and top/bottom padding spacers.
  - Eliminates DOM bloat and UI freeze when loading complex automotive/industrial datasets containing hundreds of sensor channels.

---

## 3. Visual Polish & Design System

### 3.1 Dual Light/Dark Theme Engine & Contrast Safeguards
- Persisted theme switch in `AppHeader`:
  - Automatically detects system preference via `prefers-color-scheme`.
  - Persists user selection in `localStorage` under `sensorlens_theme`.
  - Comprehensive light mode contrast safeguards in `base.css` enforcing `color: var(--text-primary) !important` on all titles, cards, and panel headers.
  - Eliminated hardcoded `#fff` text and pitch-black dropdown containers, ensuring WCAG 2.2 AA compliant contrast (> 7:1) across both themes.
  - Re-themed the System Architecture roadmap banner with soft surface cards and dark text in light mode.

### 3.2 Workflow Stepper & Context Chip Redesign
- Replaced mismatched, native-styled button pills with an integrated glassmorphic navigation stepper:
  - Clean transparent background with subtle border container (`background: var(--surface-card)`).
  - Sleek active step indicator with cyan glow (`background: rgba(var(--accent-cyan-rgb), 0.14)`, border `rgba(var(--accent-cyan-rgb), 0.35)`).
  - Aligned 32px height across stepper and active context chip (`REF vs TEST`).

### 3.3 Runs & Datasets (Library) Toolbar Redesign
- Redesigned the left workspace library panel to blend seamlessly into the dark/light glass aesthetic:
  - Header: Compact title group with rounded item count badge and a refined, glowing upload button (28px height).
  - Search & Sort: Unified glass search bar with embedded clear button and integrated custom dropdown capsule for sorting.
  - Filter Segments: Sleek segmented button group (`.library-filter-segments`) providing compact, radio-style category selection.

### 3.4 Progressive Disclosure
- Collapsed advanced settings by default in the Settings modal using `<details className="settings-accordion">`:
  - **Similarity Decision Thresholds**: Range sliders for Match and Similar confidence cutoffs.
  - **Metric Weight Distribution**: Sliders for Pearson (Shape Sync) vs. FastDTW (Time Warp Alignment).
  - **Enterprise Integrations**: OneDrive local directory sync and Google Gemini API keys.
  - Smooth 180° animated chevron indicator upon disclosure.

---

## 4. User Experience & Feedback Systems

### 4.1 Dialogs & Notifications
- Replaced all legacy `alert()` and `confirm()` calls with non-blocking toast notifications (`useToast`) and accessible `ConfirmDialog` with **Undo** action for deletions.
- Global command palette accessible via `Ctrl + K` / `Cmd + K` for rapid navigation, file switching, and sensor searching.

### 4.2 Ingestion & Diagnostics
- Drag-and-drop file upload zone with animated active drop state and file validation.
- Per-file ingestion progress indicators with actionable parse error hints.
- Library toolbar with search, sorting, tag filter chips, and bulk selection.

### 4.3 Data Export & Explanations
- CSV data export (`exportToCsv`) integrated directly into the Baseline Engine, Similarity Matcher, and Visualizer.
- Plain-language diagnostic popovers explaining Pearson Correlation, FastDTW, Tolerance Envelopes ($\mu \pm k\sigma$), and Time-Progress Normalization.

---

## 5. Before vs. After Comparison Matrix

| Aspect | Before | After |
| :--- | :--- | :--- |
| **Initial JS Bundle** | `1,671 kB` (Single monolithic bundle, Vite >500 kB warning) | **`84 kB`** (Code-split with `React.lazy` + `manualChunks`) |
| **Theme Support** | Dark-only | **Persisted Dark & Light Modes** (WCAG AA compliant) |
| **Accessibility (WCAG)** | 0 ARIA attributes, no focus ring, reliance on color alone | **WCAG 2.2 AA compliant**, dual-encoded corridor violations, full keyboard traps & ARIA roles |
| **Motion Sensitivity** | Fixed CSS animations | **`prefers-reduced-motion`** instant collapse support |
| **Sensor Channel List** | Full DOM rendering (lag with 100+ sensors) | **Virtualized Channel Windowing** (constant ~15-20 nodes) |
| **Modal Experience** | Native `alert()` / `confirm()` | Custom **`ConfirmDialog` with Undo** + Non-blocking **Toasts** |
| **Settings UI** | Static long modal with all inputs exposed | **Progressive Disclosure Accordions** (collapsed by default) |
| **Touch Targets** | Sub-30px hit targets | **≥ 40px** compliant touch targets |

---

## 6. Cross-Tab Theme Blending & Contrast Standardization

To eliminate visual fractures and guarantee cohesive aesthetic blending in both light and dark modes across every tab:
- **Visualizer (`visual-report.css`)**:
  - Converted `.preset-card-section`, `.selector-tabs-header`, and `.category-group` to semantic tokens (`--surface-panel`, `--surface-card`).
  - Swapped raw white/light text (`#fff`, `#e2e8f0`, `#f3f4f6`) on channel names and empty states for `--text-primary` with light mode overrides.
  - Re-themed `.quick-preset-btn` and action controls for WCAG AA contrast against bright canvases.
- **Column Alignment Engine (`column-alignment.css`)**:
  - Replaced hardcoded dark `#111827` bar (`.alignment-selectors-bar`) with dynamic `--surface-panel` and crisp subtle borders.
  - Updated reference and test dropdowns (`.run-select`) and channel cards (`.aligned-test-card`, `.bank-channel-card`) to inherit `--surface-input` and `--surface-card`.
  - Fixed empty-state placeholder title contrast (`.alignment-placeholder h3`).
- **Baseline Engine (`baseline.css`)**:
  - Fixed dark rectangular boxes (`.sidebar-empty-box`, `.concept-badge-item`) to render cleanly as `--surface-panel` / `--surface-card`.
  - Restored invisible white text (`.channel-name`, `.stage-idle-title`, `.baseline-empty-hero h3`) to `--text-primary`.
  - Re-themed direction toggles (`.toggle-btn-sm`) with cyan pill highlights and crisp active states.
- **Analytics & ML Studio (`analytics.css`)**:
  - Eliminated dark container backgrounds, re-binding `.analytics-layout`, `.analytics-header`, `.analytics-sidebar`, and `.analytics-main-stage` to `--bg-primary` and `--surface-card`.
  - Re-themed Target Objective card, algorithm pills (`.algo-pill-btn`), and correlation empty state (`.analytics-empty-state`).
  - **RUL Prognostics Studio**: Fixed KPI cards (`.rul-kpi-card`), forecast chart card (`.rul-chart-card`), and sidebar parameter cards (`.sidebar-section-card`) to eliminate dark slate containers in light mode. Styled direction toggles (`.btn-toggle`) and indicator select (`.target-select-dropdown`) with dedicated glass styling.
- **Compare & Similarity Matcher (`dashboard.css`)**:
  - Updated `.mapping-row`, `.mapping-target-slot`, `.draggable-card`, and `.draggable-pool` to dynamic surfaces.
  - Upgraded AI Report Box, KPI gauges, and similarity badges with full light/dark responsiveness.
- **UI Tooltips (`Tooltip.tsx`, `ui.css`)**:
  - Resolved tooltip collapse bug where CSS `bottom` and dynamic `top` caused the container to squash into a thin line and push text outside the bubble.
  - Standardized `.ui-tooltip-bubble` across positions with explicit `'auto'` resets, consistent padding, and high-contrast pill styling.

