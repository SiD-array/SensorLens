import React, { useState, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Upload, Sliders, Activity, RefreshCw, BarChart2, 
  ArrowDown, ArrowUp, Lightbulb, CheckCircle2, AlertTriangle, Trash2
} from 'lucide-react';
import type { 
  TestFile, BaselineProfile, BaselineEvaluationResponse 
} from '../../types/baseline';

interface BaselineEngineViewProps {
  files: TestFile[];
  mappings?: Record<string, string>;
  isActive?: boolean;
}

const STORAGE_KEYS = {
  PROFILE: 'sensorlens_baseline_profile',
  EVAL: 'sensorlens_baseline_eval',
  TARGET_COL: 'sensorlens_baseline_target_col',
  DIRECTION: 'sensorlens_baseline_direction',
  K_SIGMA: 'sensorlens_baseline_k_sigma',
  PCT_MARGIN: 'sensorlens_baseline_pct_margin',
  TEST_ID: 'sensorlens_baseline_test_id',
  EVAL_CH: 'sensorlens_baseline_eval_ch',
  REF_NAMES: 'sensorlens_baseline_ref_names'
};

function getSessionItem<T>(key: string, fallback: T): T {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch {
    return fallback;
  }
}

function setSessionItem<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to write to sessionStorage:', e);
  }
}

export const BaselineEngineView: React.FC<BaselineEngineViewProps> = ({ files, mappings, isActive }) => {
  // Guide banner toggle (off by default so user sees clean workbench immediately)
  const [showGuide, setShowGuide] = useState(false);

  // Config
  const [targetCol, setTargetCol] = useState<string>(() => 
    getSessionItem(STORAGE_KEYS.TARGET_COL, 'FMC%')
  );
  const [direction, setDirection] = useState<'downward' | 'upward'>(() => 
    getSessionItem(STORAGE_KEYS.DIRECTION, 'downward')
  );
  const [kSigma, setKSigma] = useState<number>(() => 
    getSessionItem(STORAGE_KEYS.K_SIGMA, 2.0)
  );
  const [pctMargin, setPctMargin] = useState<number>(() => 
    getSessionItem(STORAGE_KEYS.PCT_MARGIN, 0)
  );

  // Reference Files to Ingest for Baseline
  const [refFilesList, setRefFilesList] = useState<File[]>([]);
  const [refFileNames, setRefFileNames] = useState<string[]>(() => 
    getSessionItem(STORAGE_KEYS.REF_NAMES, [])
  );
  const [isBuilding, setIsBuilding] = useState(false);
  const [baselineProfile, setBaselineProfile] = useState<BaselineProfile | null>(() => 
    getSessionItem(STORAGE_KEYS.PROFILE, null)
  );

  // Test Run Evaluation
  const [selectedTestFileId, setSelectedTestFileId] = useState<string>(() => 
    getSessionItem(STORAGE_KEYS.TEST_ID, '')
  );
  const [selectedTestFile, setSelectedTestFile] = useState<File | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<BaselineEvaluationResponse | null>(() => 
    getSessionItem(STORAGE_KEYS.EVAL, null)
  );
  const [selectedEvalChannel, setSelectedEvalChannel] = useState<string>(() => 
    getSessionItem(STORAGE_KEYS.EVAL_CH, '')
  );

  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);
  const echartsRef = useRef<any>(null);

  // Resize ECharts when active view tab changes to baseline
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        echartsRef.current?.getEchartsInstance()?.resize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  // Synchronize state changes to sessionStorage
  useEffect(() => {
    setSessionItem(STORAGE_KEYS.TARGET_COL, targetCol);
  }, [targetCol]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.DIRECTION, direction);
  }, [direction]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.K_SIGMA, kSigma);
  }, [kSigma]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.PCT_MARGIN, pctMargin);
  }, [pctMargin]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.PROFILE, baselineProfile);
  }, [baselineProfile]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.REF_NAMES, refFileNames);
  }, [refFileNames]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.TEST_ID, selectedTestFileId);
  }, [selectedTestFileId]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.EVAL, evaluationResult);
  }, [evaluationResult]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.EVAL_CH, selectedEvalChannel);
  }, [selectedEvalChannel]);

  const handleResetEngine = () => {
    setBaselineProfile(null);
    setEvaluationResult(null);
    setEvalError(null);
    setRefFilesList([]);
    setRefFileNames([]);
    setSelectedTestFileId('');
    setSelectedTestFile(null);
    setSelectedEvalChannel('');
    Object.values(STORAGE_KEYS).forEach(k => sessionStorage.removeItem(k));
  };

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setRefFilesList(prev => [...prev, ...selected]);
    }
  };

  const handleSelectTestFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedTestFile(e.target.files[0]);
      setSelectedTestFileId('');
      setEvalError(null);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setRefFilesList(prev => prev.filter((_, i) => i !== idx));
  };

  // Build Baseline Endpoint Call
  const handleBuildBaseline = async () => {
    if (refFilesList.length === 0) return;
    setIsBuilding(true);
    setEvalError(null);

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

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Baseline calculation failed');
      }
      const data: BaselineProfile = await res.json();
      setBaselineProfile(data);
      setRefFileNames(refFilesList.map(f => f.name));

      // Auto select first channel for evaluation view
      if (data.availability_matrix && data.availability_matrix.length > 0) {
        setSelectedEvalChannel(data.availability_matrix[0].channel_name);
      }
    } catch (e: any) {
      console.error('Failed to build multi-reference baseline:', e);
      setEvalError(e.message || 'Failed to build baseline');
    } finally {
      setIsBuilding(false);
    }
  };

  // Evaluate Test Run against Baseline
  const handleEvaluateTestRun = async () => {
    if (!baselineProfile || (!selectedTestFileId && !selectedTestFile)) return;
    setIsEvaluating(true);
    setEvalError(null);

    try {
      const formData = new FormData();
      if (selectedTestFile) {
        formData.append('test_file', selectedTestFile);
      } else if (selectedTestFileId) {
        formData.append('test_file_id', selectedTestFileId);
      }
      formData.append('target_col', targetCol);
      formData.append('k_sigma', kSigma.toString());
      if (pctMargin > 0) {
        formData.append('pct_margin', pctMargin.toString());
      }
      formData.append('baseline_profile_json', JSON.stringify(baselineProfile));
      const profileBlob = new Blob([JSON.stringify(baselineProfile)], { type: 'application/json' });
      formData.append('baseline_profile_file', profileBlob, 'baseline_profile.json');
      if (mappings && Object.keys(mappings).length > 0) {
        formData.append('mappings_json', JSON.stringify(mappings));
      }

      const res = await fetch('http://localhost:8000/api/baseline/evaluate', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Evaluation failed');
      }
      const data: BaselineEvaluationResponse = await res.json();
      setEvaluationResult(data);

      if (data.channel_evaluations) {
        const availableChs = Object.keys(data.channel_evaluations);
        if (availableChs.length > 0 && !data.channel_evaluations[selectedEvalChannel]) {
          setSelectedEvalChannel(availableChs[0]);
        }
      }
    } catch (e: any) {
      console.error('Failed to evaluate test run against baseline:', e);
      setEvalError(e.message || 'Verification failed against baseline');
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
          <div className="sidebar-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(baselineProfile || evaluationResult || refFilesList.length > 0) && (
              <button 
                onClick={handleResetEngine}
                className="btn-clear-baseline"
                title="Reset baseline profile, evaluation data, and calculations"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
            <span className={`baseline-status-pill ${baselineProfile?.success ? 'active' : ''}`}>
              {baselineProfile?.success ? 'Active' : 'Setup'}
            </span>
          </div>
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
            ) : refFileNames.length > 0 && baselineProfile ? (
              <div className="sidebar-files-pills active-ref-summary">
                <span className="active-ref-label">Active Baseline Built From:</span>
                {refFileNames.map((name, idx) => (
                  <span key={idx} className="sidebar-file-chip persisted">
                    <span className="chip-name" title={name}>{name}</span>
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
                    const evalCh = evaluationResult?.channel_evaluations?.[row.channel_name];
                    const isMissingInTest = evaluationResult && evaluationResult.channel_evaluations && !evalCh;

                    return (
                      <div 
                        key={row.channel_name}
                        onClick={() => setSelectedEvalChannel(row.channel_name)}
                        className={`matrix-item-row ${isSelected ? 'selected' : ''} ${isMissingInTest ? 'channel-missing-row' : ''}`}
                      >
                        <div className="matrix-item-left">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span className="matrix-item-name" title={row.channel_name}>{row.channel_name}</span>
                            {evalCh && (
                              <span className="matrix-status-pill evaluated" title={`Evaluated with test channel: ${evalCh.matched_test_col || row.channel_name}`}>
                                ✓ Tested
                              </span>
                            )}
                            {isMissingInTest && (
                              <span className="matrix-status-pill missing" title="This sensor was not found in the tested file">
                                Missing
                              </span>
                            )}
                          </div>
                          <span className="matrix-item-runs">
                            {row.available_runs}/{row.total_accepted_runs} ref runs
                            {evalCh?.matched_test_col && evalCh.matched_test_col !== row.channel_name ? ` → ${evalCh.matched_test_col}` : ''}
                          </span>
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
                <div className="section-label-row">
                  <span className="section-label">3. Verify Test Appliance</span>
                  <button 
                    onClick={() => testFileInputRef.current?.click()}
                    className="btn-select-files"
                    title="Upload a test file directly from disk to verify"
                  >
                    <Upload size={12} />
                    <span>Upload Test Run</span>
                  </button>
                  <input 
                    type="file" 
                    ref={testFileInputRef}
                    onChange={handleSelectTestFile}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                </div>

                {selectedTestFile ? (
                  <div className="sidebar-files-pills">
                    <span className="sidebar-file-chip">
                      <span className="chip-name" title={selectedTestFile.name}>
                        Testing: <b>{selectedTestFile.name}</b>
                      </span>
                      <button onClick={() => setSelectedTestFile(null)} className="chip-remove">×</button>
                    </span>
                  </div>
                ) : (
                  <select 
                    value={selectedTestFileId}
                    onChange={(e) => {
                      setSelectedTestFileId(e.target.value);
                      setSelectedTestFile(null);
                    }}
                    className="field-select"
                  >
                    <option value="">-- Choose From Uploaded Runs --</option>
                    {files.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.columns.length} ch)</option>
                    ))}
                  </select>
                )}

                {evalError && (
                  <div className="sidebar-eval-error-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} className="text-red-400" />
                      <span className="eval-error-title">Verification Warning</span>
                    </div>
                    <span className="eval-error-detail">{evalError}</span>
                  </div>
                )}

                <button 
                  onClick={handleEvaluateTestRun}
                  disabled={isEvaluating || (!selectedTestFileId && !selectedTestFile)}
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
                  evaluationResult.channel_evaluations?.[selectedEvalChannel] ? (
                    <span className="channel-test-tag">Testing: {evaluationResult.test_file_name}</span>
                  ) : (
                    <span className="channel-test-tag missing-tag">Not recorded in {evaluationResult.test_file_name}</span>
                  )
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
                ref={echartsRef}
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
        {currentEvalMetrics ? (
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
        ) : evaluationResult && evaluationResult.channel_evaluations && selectedEvalChannel && !currentEvalMetrics ? (
          <div className="baseline-stage-footer">
            <div className="verdict-strip acceptable">
              <div className="verdict-icon">
                <AlertTriangle size={18} />
              </div>
              <div className="verdict-content">
                <div className="verdict-title-row">
                  <span className="verdict-title">Sensor Not Recorded in Test Appliance</span>
                </div>
                <span className="verdict-explanation">
                  Sensor <b>{selectedEvalChannel}</b> is part of the golden baseline, but was not present in test file <b>{evaluationResult.test_file_name}</b>. Click any sensor marked <b>✓ Tested</b> in the Schema Availability Matrix to inspect verified test data.
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};
