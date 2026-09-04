import React, { useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Upload, Sliders, Activity, RefreshCw, BarChart2, 
  ArrowDown, ArrowUp, Lightbulb, CheckCircle2, AlertTriangle
} from 'lucide-react';
import type { 
  TestFile, BaselineProfile, BaselineEvaluationResponse 
} from '../../types/baseline';

interface BaselineEngineViewProps {
  files: TestFile[];
}

export const BaselineEngineView: React.FC<BaselineEngineViewProps> = ({ files }) => {
  // Guide banner toggle (off by default so user sees clean workbench immediately)
  const [showGuide, setShowGuide] = useState(false);

  // Config
  const [targetCol, setTargetCol] = useState('FMC%');
  const [direction, setDirection] = useState<'downward' | 'upward'>('downward');
  const [kSigma, setKSigma] = useState(2.0);
  const [pctMargin, setPctMargin] = useState<number>(0);

  // Reference Files to Ingest for Baseline
  const [refFilesList, setRefFilesList] = useState<File[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [baselineProfile, setBaselineProfile] = useState<BaselineProfile | null>(null);

  // Test Run Evaluation
  const [selectedTestFileId, setSelectedTestFileId] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<BaselineEvaluationResponse | null>(null);
  const [selectedEvalChannel, setSelectedEvalChannel] = useState('');

  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setRefFilesList(prev => [...prev, ...selected]);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setRefFilesList(prev => prev.filter((_, i) => i !== idx));
  };

  // Build Baseline Endpoint Call
  const handleBuildBaseline = async () => {
    if (refFilesList.length === 0) return;
    setIsBuilding(true);

    try {
      const formData = new FormData();
      refFilesList.forEach(file => {
        formData.append('files', file);
      });
      formData.append('target_col', targetCol);
      formData.append('direction', direction);
      formData.append('threshold_pct', '2.0');

      const res = await fetch('http://localhost:8000/api/baseline/build', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Baseline calculation failed');
      const data: BaselineProfile = await res.json();
      setBaselineProfile(data);

      // Auto select first channel for evaluation view
      if (data.availability_matrix && data.availability_matrix.length > 0) {
        setSelectedEvalChannel(data.availability_matrix[0].channel_name);
      }
    } catch (e) {
      console.error('Failed to build multi-reference baseline:', e);
    } finally {
      setIsBuilding(false);
    }
  };

  // Evaluate Test Run against Baseline
  const handleEvaluateTestRun = async () => {
    if (!baselineProfile || !selectedTestFileId) return;
    setIsEvaluating(true);

    try {
      const formData = new FormData();
      formData.append('test_file_id', selectedTestFileId);
      formData.append('target_col', targetCol);
      formData.append('k_sigma', kSigma.toString());
      if (pctMargin > 0) {
        formData.append('pct_margin', pctMargin.toString());
      }

      const res = await fetch('http://localhost:8000/api/baseline/evaluate', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Evaluation failed');
      const data: BaselineEvaluationResponse = await res.json();
      setEvaluationResult(data);

      if (data.channel_evaluations) {
        const firstCh = Object.keys(data.channel_evaluations)[0];
        if (firstCh) setSelectedEvalChannel(firstCh);
      }
    } catch (e) {
      console.error('Failed to evaluate test run against baseline:', e);
    } finally {
      setIsEvaluating(false);
    }
  };

  // ECharts Option for Shaded Tolerance Corridor with Red Violation Highlights
  const getCorridorChartOption = () => {
    if (!baselineProfile || !selectedEvalChannel) return {};

    const baseChannel = baselineProfile.baseline_channels[selectedEvalChannel];
    if (!baseChannel) return {};

    const grid = baselineProfile.grid;
    const mu = baseChannel.mean;
    const sigma = baseChannel.std;

    // Corridor bounds
    const lowerBound: number[] = [];
    const bandWidth: number[] = [];
    const meanPoints = mu.map((val, idx) => [grid[idx], val]);

    for (let i = 0; i < grid.length; i++) {
      const halfWidth = Math.max(kSigma * sigma[i], (pctMargin / 100.0) * Math.max(Math.abs(mu[i]), 1.0));
      const low = mu[i] - halfWidth;
      const high = mu[i] + halfWidth;
      lowerBound.push(low);
      bandWidth.push(high - low);
    }

    const seriesList: any[] = [
      // Lower bound (transparent base for confidence area)
      {
        name: 'Lower Corridor Base',
        type: 'line',
        data: lowerBound.map((val, idx) => [grid[idx], val]),
        lineStyle: { opacity: 0 },
        stack: 'confidence-band',
        symbol: 'none',
        silent: true
      },
      // Shaded corridor area (stacked on top of lower base)
      {
        name: 'Tolerance Corridor (kσ)',
        type: 'line',
        data: bandWidth.map((val, idx) => [grid[idx], val]),
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: 'rgba(99, 102, 241, 0.22)'
        },
        stack: 'confidence-band',
        symbol: 'none'
      },
      // Baseline Mean Line
      {
        name: 'Baseline Mean (μ)',
        type: 'line',
        data: meanPoints,
        lineStyle: { width: 3, color: '#818cf8' },
        itemStyle: { color: '#818cf8' },
        smooth: true,
        symbol: 'none',
        emphasis: { focus: 'series' }
      }
    ];

    // If test run evaluation exists for this channel, overlay it and red violations
    if (evaluationResult && evaluationResult.channel_evaluations[selectedEvalChannel]) {
      const evalCh = evaluationResult.channel_evaluations[selectedEvalChannel];
      const testPoints = evalCh.test_values.map((val, idx) => [grid[idx], val]);

      // Normal test trace
      seriesList.push({
        name: `Test: ${evaluationResult.test_file_name}`,
        type: 'line',
        data: testPoints,
        lineStyle: { width: 2.5, color: '#00f2fe' },
        itemStyle: { color: '#00f2fe' },
        smooth: true,
        symbol: 'none',
        emphasis: { focus: 'series' }
      });

      // Violating points in RED
      const violatingPoints = evalCh.test_values
        .map((val, idx) => evalCh.violating_mask[idx] ? [grid[idx], val] : null)
        .filter(Boolean);

      if (violatingPoints.length > 0) {
        seriesList.push({
          name: 'Corridor Violations',
          type: 'scatter',
          data: violatingPoints,
          symbolSize: 6,
          itemStyle: {
            color: '#ef4444',
            shadowColor: '#ef4444',
            shadowBlur: 8
          },
          emphasis: { focus: 'series' }
        });
      }
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: seriesList.filter(s => s.name !== 'Lower Corridor Base').map(s => s.name),
        textStyle: { color: '#ccc' },
        top: 0
      },
      grid: { left: '4%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
      dataZoom: [
        { type: 'slider', show: true, textStyle: { color: '#aaa' }, bottom: '2%' },
        { type: 'inside' }
      ],
      xAxis: {
        type: 'value',
        name: `Progress (${targetCol})`,
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        inverse: direction === 'downward'
      },
      yAxis: {
        type: 'value',
        name: 'Sensor Amplitude',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      series: seriesList
    };
  };

  const currentEvalMetrics = evaluationResult?.channel_evaluations?.[selectedEvalChannel];

  return (
    <div className="baseline-workbench">
      
      {/* Concept Explainer Modal */}
      {showGuide && (
        <div className="concept-modal-backdrop" onClick={() => setShowGuide(false)}>
          <div className="concept-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="concept-modal-header">
              <div className="concept-modal-title">
                <Lightbulb size={20} className="text-accent-cyan" />
                <h3>How the Baseline Engine Works (Concept Guide)</h3>
              </div>
              <button onClick={() => setShowGuide(false)} className="modal-close-btn">×</button>
            </div>
            <div className="concept-modal-body">
              <div className="concept-card">
                <span className="concept-badge">1. Cycle Progress (0% → 100%)</span>
                <h4>Why not compare by seconds?</h4>
                <p>
                  Cycles naturally run faster or slower depending on ambient temperature or load size. Comparing clock seconds gives false alarms.
                  We resample all runs onto a uniform <b>0% to 100% Progress Scale</b> (e.g. moisture drop <code>FMC%</code>) to compare identical physical stages.
                </p>
              </div>

              <div className="concept-card">
                <span className="concept-badge">2. Golden Standard (Mean μ)</span>
                <h4>Average of healthy reference runs</h4>
                <p>
                  Upload multiple known-good runs. The engine calculates the true average waveform (<b>Mean μ</b>) to create a noise-free benchmark.
                </p>
              </div>

              <div className="concept-card">
                <span className="concept-badge">3. Tolerance Guardrails (kσ)</span>
                <h4>Catch defects in bright red</h4>
                <p>
                  The blue shaded envelope represents normal operating boundaries. Any test point outside these guardrails is flagged in <b>bright red</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar (350px): All Inputs, Files, Availability Matrix, Evaluation */}
      <aside className="baseline-sidebar">
        <div className="sidebar-header-bar">
          <div className="sidebar-title-row">
            <Sliders size={16} className="text-accent-cyan" />
            <span className="sidebar-title">Baseline Controller</span>
          </div>
          <span className={`baseline-status-pill ${baselineProfile?.success ? 'active' : ''}`}>
            {baselineProfile?.success ? 'Active' : 'Setup'}
          </span>
        </div>

        <div className="sidebar-scrollable-body">
          {/* Section 1: Ingestion & Config */}
          <div className="sidebar-section">
            <div className="section-label-row">
              <span className="section-label">1. Reference Ingestion</span>
              <button 
                onClick={() => multiFileInputRef.current?.click()}
                className="btn-select-files"
              >
                <Upload size={12} />
                <span>Select Files ({refFilesList.length})</span>
              </button>
              <input 
                type="file" 
                multiple 
                ref={multiFileInputRef}
                onChange={handleSelectFiles}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
            </div>

            {refFilesList.length > 0 ? (
              <div className="sidebar-files-pills">
                {refFilesList.map((f, idx) => (
                  <span key={idx} className="sidebar-file-chip">
                    <span className="chip-name" title={f.name}>{f.name}</span>
                    <button onClick={() => removeSelectedFile(idx)} className="chip-remove">×</button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="sidebar-files-empty">
                No files queued. Click "Select Files" to queue 2+ reference runs.
              </div>
            )}

            {/* Cycle Progress Sensor Input */}
            <div className="sidebar-field-group">
              <label className="field-label">Cycle Progress Sensor:</label>
              <input 
                type="text" 
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                placeholder="e.g. FMC%, Moisture, Progress%"
                className="field-input"
              />
              <span className="field-hint">Defaults to <b>FMC%</b> (drying moisture).</span>
            </div>

            {/* Cycle Direction Toggle */}
            <div className="sidebar-field-group">
              <label className="field-label">Cycle Direction:</label>
              <div className="sidebar-toggle-group">
                <button 
                  onClick={() => setDirection('downward')}
                  className={`toggle-btn-sm ${direction === 'downward' ? 'active' : ''}`}
                >
                  <ArrowDown size={12} />
                  <span>Drying (100→0)</span>
                </button>
                <button 
                  onClick={() => setDirection('upward')}
                  className={`toggle-btn-sm ${direction === 'upward' ? 'active' : ''}`}
                >
                  <ArrowUp size={12} />
                  <span>Heating (0→100)</span>
                </button>
              </div>
            </div>

            {/* Tolerance Guardrail Slider */}
            <div className="sidebar-field-group">
              <div className="field-label-split">
                <label className="field-label">Corridor Guardrails:</label>
                <span className="field-val-badge">±{kSigma.toFixed(1)}σ</span>
              </div>
              <input 
                type="range" min="0.5" max="3.5" step="0.1"
                value={kSigma}
                onChange={(e) => {
                  setKSigma(parseFloat(e.target.value));
                  if (evaluationResult) handleEvaluateTestRun();
                }}
                className="field-slider"
              />
              <span className="field-hint">
                {kSigma <= 1.2 ? 'Strict tolerance (flags small deviations)' : kSigma >= 2.5 ? 'Relaxed tolerance (major defects only)' : 'Standard balance (recommended ±2.0σ)'}
              </span>
            </div>

            {/* Min Safety Margin Floor */}
            <div className="sidebar-field-group">
              <div className="field-label-split">
                <label className="field-label">Min Safety Floor:</label>
                <span className="field-val-badge">±{pctMargin}%</span>
              </div>
              <input 
                type="range" min="0" max="15" step="1"
                value={pctMargin}
                onChange={(e) => {
                  setPctMargin(parseFloat(e.target.value));
                  if (evaluationResult) handleEvaluateTestRun();
                }}
                className="field-slider"
              />
            </div>

            <button 
              onClick={handleBuildBaseline}
              disabled={isBuilding || refFilesList.length === 0}
              className="btn btn-primary btn-generate-baseline"
            >
              {isBuilding ? <RefreshCw className="animate-spin" size={14} /> : <Sliders size={14} />}
              <span>{baselineProfile ? 'Re-Generate Baseline' : 'Generate Golden Baseline'}</span>
            </button>
          </div>

          {/* Rejection notice if any runs rejected */}
          {baselineProfile && baselineProfile.rejected_runs && baselineProfile.rejected_runs.length > 0 && (
            <div className="sidebar-rejection-card">
              <span className="rejection-card-title">⚠️ {baselineProfile.rejected_runs.length} Run(s) Rejected</span>
              {baselineProfile.rejected_runs.map((r, i) => (
                <span key={i} className="rejection-card-detail">{r.file_name}: {r.reason}</span>
              ))}
            </div>
          )}

          {/* Section 2: Availability Matrix (When generated) */}
          {baselineProfile && baselineProfile.success && (
            <>
              <div className="sidebar-divider" />

              <div className="sidebar-section">
                <div className="section-label-row">
                  <span className="section-label">2. Schema Availability Matrix</span>
                  <span className="matrix-count-badge">{baselineProfile.availability_matrix.length} ch</span>
                </div>

                <div className="sidebar-matrix-list">
                  {baselineProfile.availability_matrix.map(row => {
                    const isSelected = selectedEvalChannel === row.channel_name;
                    return (
                      <div 
                        key={row.channel_name}
                        onClick={() => setSelectedEvalChannel(row.channel_name)}
                        className={`matrix-item-row ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="matrix-item-left">
                          <span className="matrix-item-name" title={row.channel_name}>{row.channel_name}</span>
                          <span className="matrix-item-runs">{row.available_runs}/{row.total_accepted_runs} runs</span>
                        </div>
                        <div className="matrix-item-bar-box">
                          <div className="matrix-item-bar-fill" style={{ width: `${row.presence_pct}%` }} />
                          <span className="matrix-item-pct">{row.presence_pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sidebar-divider" />

              {/* Section 3: Verify Test Run */}
              <div className="sidebar-section">
                <span className="section-label">3. Verify Test Appliance</span>
                <select 
                  value={selectedTestFileId}
                  onChange={(e) => setSelectedTestFileId(e.target.value)}
                  className="field-select"
                >
                  <option value="">-- Choose Test Run --</option>
                  {files.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.columns.length} ch)</option>
                  ))}
                </select>

                <button 
                  onClick={handleEvaluateTestRun}
                  disabled={isEvaluating || !selectedTestFileId}
                  className="btn btn-accent btn-verify-test"
                >
                  {isEvaluating ? <RefreshCw className="animate-spin" size={13} /> : <Activity size={13} />}
                  <span>Verify Against Baseline</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Right Main Stage: Toolbar + ECharts Canvas + Verdict Banner */}
      <main className="baseline-main">
        {/* Stage Header Toolbar */}
        <div className="baseline-stage-toolbar">
          <div className="stage-toolbar-left">
            {selectedEvalChannel ? (
              <div className="channel-active-indicator">
                <span className="channel-name">{selectedEvalChannel}</span>
                <span className="channel-grid-tag">500-pt Progress Grid (±{kSigma}σ corridor)</span>
                {evaluationResult && (
                  <span className="channel-test-tag">Testing: {evaluationResult.test_file_name}</span>
                )}
              </div>
            ) : (
              <span className="stage-idle-title">Multi-Reference Baseline Engine</span>
            )}
          </div>

          <div className="stage-toolbar-right">
            <button onClick={() => setShowGuide(true)} className="btn-guide-toggle">
              <Lightbulb size={13} />
              <span>Concept Guide</span>
            </button>
          </div>
        </div>

        {/* Stage Canvas Area */}
        <div className="baseline-stage-body">
          {baselineProfile && baselineProfile.success ? (
            <div className="baseline-chart-wrapper">
              <ReactECharts 
                option={getCorridorChartOption()}
                notMerge={true}
                lazyUpdate={true}
                style={{ height: '100%', width: '100%' }}
                theme="dark"
              />
            </div>
          ) : (
            <div className="baseline-empty-hero">
              <BarChart2 size={54} className="text-accent-cyan" style={{ opacity: 0.8 }} />
              <h3>No Golden Baseline Generated Yet</h3>
              <p className="empty-desc">
                Use the <b>Baseline Controller</b> on the left to queue 2 or more reference runs, then click <b>Generate Golden Baseline</b>.
              </p>
              <div className="hero-concept-badges">
                <div className="concept-badge-item">
                  <span className="badge-num">1</span>
                  <div>
                    <b>Progress Normalized (0% → 100%)</b>
                    <p>Compares cycles by drying or heating progress rather than seconds.</p>
                  </div>
                </div>
                <div className="concept-badge-item">
                  <span className="badge-num">2</span>
                  <div>
                    <b>Golden Standard (Mean μ)</b>
                    <p>Calculates the true average curve across your healthy runs.</p>
                  </div>
                </div>
                <div className="concept-badge-item">
                  <span className="badge-num">3</span>
                  <div>
                    <b>Tolerance Guardrails (kσ)</b>
                    <p>Shaded envelope highlights defects and deviations in bright red.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stage Footer: Diagnostic Verdict Banner */}
        {currentEvalMetrics && (
          <div className="baseline-stage-footer">
            <div className={`verdict-strip ${
              currentEvalMetrics.violation_pct === 0 ? 'pass' : 
              currentEvalMetrics.violation_pct < 5 ? 'acceptable' : 
              currentEvalMetrics.violation_pct < 15 ? 'warning' : 'defect'
            }`}>
              <div className="verdict-icon">
                {currentEvalMetrics.violation_pct < 5 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div className="verdict-content">
                <div className="verdict-title-row">
                  <span className="verdict-title">
                    {currentEvalMetrics.violation_pct === 0 
                      ? "PASS — Flawless Operation" 
                      : currentEvalMetrics.violation_pct < 5 
                      ? `ACCEPTABLE — Normal Tolerance (${currentEvalMetrics.violation_pct}% deviation)`
                      : currentEvalMetrics.violation_pct < 15 
                      ? `WARNING — Moderate Out-of-Bounds (${currentEvalMetrics.violation_pct}% drift)`
                      : `DEFECT DETECTED — Severe Anomaly (${currentEvalMetrics.violation_pct}% out-of-bounds)`}
                  </span>
                  <span className="verdict-metrics-summary">
                    Guardrail Violation: <b>{currentEvalMetrics.violation_pct}%</b> • Severity (CAD): <b>{currentEvalMetrics.cumulative_deviation.toFixed(1)}</b> • Timing Sync: <b>{(currentEvalMetrics.slope_correlation * 100).toFixed(0)}%</b>
                  </span>
                </div>
                <span className="verdict-explanation">
                  {currentEvalMetrics.violation_pct < 5 
                    ? "This test unit stayed safely inside reference guardrails across the entire cycle." 
                    : "Red markers on the graph indicate exact points where sensor readings deviated outside the safety corridor."}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
