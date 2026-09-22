import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Upload, Sliders, Activity, RefreshCw, BarChart2, 
  ArrowDown, ArrowUp, Lightbulb, CheckCircle2, AlertTriangle, Trash2,
  Layers, ListFilter
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
  TEST_IDS: 'sensorlens_baseline_test_ids',
  EVAL_CH: 'sensorlens_baseline_eval_ch',
  EVAL_CHS: 'sensorlens_baseline_eval_channels',
  REF_NAMES: 'sensorlens_baseline_ref_names'
};

const SENSOR_PALETTE = ['#00f2fe', '#818cf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#f43f5e', '#a855f7', '#06b6d4', '#eab308'];
const RUN_PALETTE = ['#00f2fe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7'];

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
  // Guide banner toggle
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
  const [selectedWorkspaceRefIds, setSelectedWorkspaceRefIds] = useState<string[]>(() => {
    const refTagged = files.filter(f => f.tag === 'reference').map(f => f.id);
    if (refTagged.length > 0) return refTagged;
    return files.length > 0 ? [files[0].id] : [];
  });
  const [isBuilding, setIsBuilding] = useState(false);
  const [baselineProfile, setBaselineProfile] = useState<BaselineProfile | null>(() => 
    getSessionItem(STORAGE_KEYS.PROFILE, null)
  );

  // Test Run Evaluation (Single & Multi-Test support)
  const [selectedTestFileId, setSelectedTestFileId] = useState<string>(() => 
    getSessionItem(STORAGE_KEYS.TEST_ID, '')
  );
  const [selectedTestFileIds, setSelectedTestFileIds] = useState<string[]>(() => 
    getSessionItem(STORAGE_KEYS.TEST_IDS, [])
  );
  const [selectedTestFile, setSelectedTestFile] = useState<File | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<BaselineEvaluationResponse | null>(() => 
    getSessionItem(STORAGE_KEYS.EVAL, null)
  );

  // Channel Selection (Single focus & Multi-channel support)
  const [selectedEvalChannel, setSelectedEvalChannel] = useState<string>(() => 
    getSessionItem(STORAGE_KEYS.EVAL_CH, '')
  );
  const [selectedEvalChannels, setSelectedEvalChannels] = useState<string[]>(() => 
    getSessionItem(STORAGE_KEYS.EVAL_CHS, [])
  );

  // Batch Test Run Switcher Tab ('all' or specific file_id)
  const [activeBatchRunId, setActiveBatchRunId] = useState<string>('all');

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

  // Auto-detect available numeric channels from files
  const availableColumns = useMemo(() => {
    const colSet = new Set<string>();
    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => colSet.add(c.name));
    });
    return Array.from(colSet);
  }, [files]);

  useEffect(() => {
    if (selectedWorkspaceRefIds.length === 0 && files.length > 0) {
      const refTagged = files.filter(f => f.tag === 'reference').map(f => f.id);
      setSelectedWorkspaceRefIds(refTagged.length > 0 ? refTagged : [files[0].id]);
    }
  }, [files]);

  useEffect(() => {
    if (availableColumns.length > 0 && !availableColumns.includes(targetCol)) {
      const fmc = availableColumns.find(c => c.toUpperCase().includes('FMC'));
      const timeOrProgress = availableColumns.find(c => /time|cycle|step|progress/i.test(c));
      setTargetCol(fmc || timeOrProgress || availableColumns[0]);
    }
  }, [availableColumns]);

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
    setSessionItem(STORAGE_KEYS.TEST_IDS, selectedTestFileIds);
  }, [selectedTestFileIds]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.EVAL, evaluationResult);
  }, [evaluationResult]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.EVAL_CH, selectedEvalChannel);
  }, [selectedEvalChannel]);

  useEffect(() => {
    setSessionItem(STORAGE_KEYS.EVAL_CHS, selectedEvalChannels);
  }, [selectedEvalChannels]);

  const handleResetEngine = () => {
    setBaselineProfile(null);
    setEvaluationResult(null);
    setEvalError(null);
    setRefFilesList([]);
    setRefFileNames([]);
    setSelectedTestFileId('');
    setSelectedTestFileIds([]);
    setSelectedTestFile(null);
    setSelectedEvalChannel('');
    setSelectedEvalChannels([]);
    setActiveBatchRunId('all');
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
      setSelectedTestFileIds([]);
      setEvalError(null);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setRefFilesList(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleEvalChannel = (chName: string) => {
    setSelectedEvalChannels(prev => {
      const next = prev.includes(chName) ? prev.filter(c => c !== chName) : [...prev, chName];
      if (next.length === 1) {
        setSelectedEvalChannel(next[0]);
      } else if (!next.includes(selectedEvalChannel) && next.length > 0) {
        setSelectedEvalChannel(next[0]);
      }
      return next;
    });
  };

  const selectAllChannels = () => {
    if (!baselineProfile) return;
    const all = baselineProfile.availability_matrix.map(r => r.channel_name);
    setSelectedEvalChannels(all);
    if (!selectedEvalChannel && all.length > 0) {
      setSelectedEvalChannel(all[0]);
    }
  };

  const clearAllChannels = () => {
    setSelectedEvalChannels([]);
  };

  const toggleTestFileId = (fId: string) => {
    setSelectedTestFile(null);
    setSelectedTestFileIds(prev => {
      const exists = prev.includes(fId);
      const next = exists ? prev.filter(id => id !== fId) : [...prev, fId];
      if (next.length === 1) {
        setSelectedTestFileId(next[0]);
      } else {
        setSelectedTestFileId(next[0] || '');
      }
      return next;
    });
  };

  const selectAllTests = () => {
    setSelectedTestFile(null);
    const allIds = files.map(f => f.id);
    setSelectedTestFileIds(allIds);
    if (allIds.length > 0) setSelectedTestFileId(allIds[0]);
  };

  const clearAllTests = () => {
    setSelectedTestFile(null);
    setSelectedTestFileIds([]);
    setSelectedTestFileId('');
  };

  // Build Baseline Endpoint Call
  const handleBuildBaseline = async () => {
    const hasFiles = refFilesList.length > 0 || selectedWorkspaceRefIds.length > 0;
    if (!hasFiles) return;
    setIsBuilding(true);
    setEvalError(null);

    try {
      let res: Response;
      if (refFilesList.length > 0) {
        const formData = new FormData();
        refFilesList.forEach(file => {
          formData.append('files', file);
        });
        formData.append('target_col', targetCol);
        formData.append('direction', direction);
        formData.append('threshold_pct', '2.0');

        res = await fetch('http://localhost:8000/api/baseline/build', {
          method: 'POST',
          body: formData
        });
      } else {
        res = await fetch('http://localhost:8000/api/baseline/build-from-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_ids: selectedWorkspaceRefIds,
            target_col: targetCol,
            direction: direction,
            threshold_pct: 2.0
          })
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Baseline calculation failed');
      }
      const data: BaselineProfile = await res.json();
      setBaselineProfile(data);
      const names = refFilesList.length > 0
        ? refFilesList.map(f => f.name)
        : files.filter(f => selectedWorkspaceRefIds.includes(f.id)).map(f => f.name);
      setRefFileNames(names);

      // Auto select first channel for evaluation view
      if (data.availability_matrix && data.availability_matrix.length > 0) {
        const firstCh = data.availability_matrix[0].channel_name;
        setSelectedEvalChannel(firstCh);
        if (selectedEvalChannels.length === 0) {
          setSelectedEvalChannels([firstCh]);
        }
      }
    } catch (e: any) {
      console.error('Failed to build multi-reference baseline:', e);
      setEvalError(e.message || 'Failed to build baseline');
    } finally {
      setIsBuilding(false);
    }
  };

  // Evaluate Test Run(s) against Baseline
  const handleEvaluateTestRun = async () => {
    const hasTest = selectedTestFile || selectedTestFileIds.length > 0 || selectedTestFileId;
    if (!baselineProfile || !hasTest) return;
    setIsEvaluating(true);
    setEvalError(null);

    try {
      const formData = new FormData();
      if (selectedTestFile) {
        formData.append('test_file', selectedTestFile);
      } else if (selectedTestFileIds.length > 1) {
        formData.append('test_file_ids_json', JSON.stringify(selectedTestFileIds));
        formData.append('test_file_id', selectedTestFileIds[0]);
      } else if (selectedTestFileIds.length === 1) {
        formData.append('test_file_id', selectedTestFileIds[0]);
      } else if (selectedTestFileId) {
        formData.append('test_file_id', selectedTestFileId);
      }

      formData.append('target_col', targetCol);
      formData.append('k_sigma', kSigma.toString());
      if (pctMargin > 0) {
        formData.append('pct_margin', pctMargin.toString());
      }
      if (baselineProfile) {
        const profileBlob = new Blob([JSON.stringify(baselineProfile)], { type: 'application/json' });
        formData.append('baseline_profile_file', profileBlob, 'baseline_profile.json');
      }
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
      setActiveBatchRunId('all');

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

  // ECharts Option for Shaded Tolerance Corridor with Multi-Sensor & Multi-Test Overlays
  const getCorridorChartOption = () => {
    if (!baselineProfile) return {};

    const activeChannels = selectedEvalChannels.length > 0 
      ? selectedEvalChannels 
      : (selectedEvalChannel ? [selectedEvalChannel] : []);

    if (activeChannels.length === 0) return {};

    const grid = baselineProfile.grid;
    const isSingleChannel = activeChannels.length === 1;
    const primaryCh = activeChannels[0];
    const seriesList: any[] = [];

    if (isSingleChannel) {
      // Single channel mode: Draw shaded corridor (±kσ), baseline mean (μ), and all test traces
      const baseChannel = baselineProfile.baseline_channels[primaryCh];
      if (baseChannel) {
        const mu = baseChannel.mean;
        const sigma = baseChannel.std;

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

        // Lower bound (transparent base)
        seriesList.push({
          name: 'Lower Corridor Base',
          type: 'line',
          data: lowerBound.map((val, idx) => [grid[idx], val]),
          lineStyle: { opacity: 0 },
          stack: 'confidence-band',
          symbol: 'none',
          silent: true
        });

        // Shaded corridor area
        seriesList.push({
          name: 'Tolerance Corridor (kσ)',
          type: 'line',
          data: bandWidth.map((val, idx) => [grid[idx], val]),
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(99, 102, 241, 0.22)'
          },
          stack: 'confidence-band',
          symbol: 'none'
        });

        // Baseline Mean Line
        seriesList.push({
          name: `Baseline Mean (μ) [${primaryCh}]`,
          type: 'line',
          data: meanPoints,
          lineStyle: { width: 3, color: '#818cf8' },
          itemStyle: { color: '#818cf8' },
          smooth: true,
          symbol: 'none',
          emphasis: { focus: 'series' }
        });
      }

      // Add Test Run Trace(s)
      if (evaluationResult) {
        if (evaluationResult.evaluations_by_run && Object.keys(evaluationResult.evaluations_by_run).length > 0) {
          // Batch runs available
          const runEntries = Object.entries(evaluationResult.evaluations_by_run);
          runEntries.forEach(([runId, runEval], runIdx) => {
            if (activeBatchRunId !== 'all' && activeBatchRunId !== runId) return;

            const chEval = runEval.channel_evaluations?.[primaryCh];
            if (!chEval) return;

            const color = RUN_PALETTE[runIdx % RUN_PALETTE.length];
            const testPoints = chEval.test_values.map((val, idx) => [grid[idx], val]);

            seriesList.push({
              name: `Test: ${runEval.test_file_name}`,
              type: 'line',
              data: testPoints,
              lineStyle: { width: 2.2, color },
              itemStyle: { color },
              smooth: true,
              symbol: 'none',
              emphasis: { focus: 'series' }
            });

            // Violations
            const violatingPoints = chEval.test_values
              .map((val, idx) => chEval.violating_mask[idx] ? [grid[idx], val] : null)
              .filter(Boolean);

            if (violatingPoints.length > 0) {
              seriesList.push({
                name: `Violations (${runEval.test_file_name})`,
                type: 'scatter',
                data: violatingPoints,
                symbolSize: 6,
                itemStyle: { color: '#ef4444', shadowColor: '#ef4444', shadowBlur: 6 },
                emphasis: { focus: 'series' }
              });
            }
          });
        } else if (evaluationResult.channel_evaluations?.[primaryCh]) {
          // Single test run
          const chEval = evaluationResult.channel_evaluations[primaryCh];
          const testPoints = chEval.test_values.map((val, idx) => [grid[idx], val]);

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

          const violatingPoints = chEval.test_values
            .map((val, idx) => chEval.violating_mask[idx] ? [grid[idx], val] : null)
            .filter(Boolean);

          if (violatingPoints.length > 0) {
            seriesList.push({
              name: 'Corridor Violations',
              type: 'scatter',
              data: violatingPoints,
              symbolSize: 6,
              itemStyle: { color: '#ef4444', shadowColor: '#ef4444', shadowBlur: 8 },
              emphasis: { focus: 'series' }
            });
          }
        }
      }
    } else {
      // Multi-channel mode: Overlay each sensor's Baseline Mean and Test Traces
      activeChannels.forEach((chName, chIdx) => {
        const chColor = SENSOR_PALETTE[chIdx % SENSOR_PALETTE.length];
        const baseChannel = baselineProfile.baseline_channels[chName];

        if (baseChannel) {
          const meanPoints = baseChannel.mean.map((val, idx) => [grid[idx], val]);
          seriesList.push({
            name: `Baseline μ: ${chName}`,
            type: 'line',
            data: meanPoints,
            lineStyle: { width: 2.5, color: chColor, type: 'dashed' },
            itemStyle: { color: chColor },
            smooth: true,
            symbol: 'none',
            emphasis: { focus: 'series' }
          });
        }

        // Test run trace for this channel
        if (evaluationResult) {
          if (evaluationResult.evaluations_by_run && Object.keys(evaluationResult.evaluations_by_run).length > 0) {
            Object.entries(evaluationResult.evaluations_by_run).forEach(([runId, runEval]) => {
              if (activeBatchRunId !== 'all' && activeBatchRunId !== runId) return;

              const chEval = runEval.channel_evaluations?.[chName];
              if (!chEval) return;

              const testPoints = chEval.test_values.map((val, idx) => [grid[idx], val]);
              seriesList.push({
                name: `${runEval.test_file_name}: ${chName}`,
                type: 'line',
                data: testPoints,
                lineStyle: { width: 2, color: chColor },
                itemStyle: { color: chColor },
                smooth: true,
                symbol: 'none',
                emphasis: { focus: 'series' }
              });

              // Red scatter points for violations
              const violatingPoints = chEval.test_values
                .map((val, idx) => chEval.violating_mask[idx] ? [grid[idx], val] : null)
                .filter(Boolean);

              if (violatingPoints.length > 0) {
                seriesList.push({
                  name: `Violations (${chName})`,
                  type: 'scatter',
                  data: violatingPoints,
                  symbolSize: 5,
                  itemStyle: { color: '#ef4444' },
                  emphasis: { focus: 'series' }
                });
              }
            });
          } else if (evaluationResult.channel_evaluations?.[chName]) {
            const chEval = evaluationResult.channel_evaluations[chName];
            const testPoints = chEval.test_values.map((val, idx) => [grid[idx], val]);
            seriesList.push({
              name: `Test: ${chName}`,
              type: 'line',
              data: testPoints,
              lineStyle: { width: 2, color: chColor },
              itemStyle: { color: chColor },
              smooth: true,
              symbol: 'none',
              emphasis: { focus: 'series' }
            });

            const violatingPoints = chEval.test_values
              .map((val, idx) => chEval.violating_mask[idx] ? [grid[idx], val] : null)
              .filter(Boolean);

            if (violatingPoints.length > 0) {
              seriesList.push({
                name: `Violations (${chName})`,
                type: 'scatter',
                data: violatingPoints,
                symbolSize: 5,
                itemStyle: { color: '#ef4444' },
                emphasis: { focus: 'series' }
              });
            }
          }
        }
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: seriesList.filter(s => s.name !== 'Lower Corridor Base').map(s => s.name),
        textStyle: { color: '#ccc', fontSize: 11 },
        type: 'scroll',
        top: 0
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'all',
            xAxisIndex: 'all',
            title: { zoom: 'Area Zoom (X+Y)', back: 'Restore Zoom' }
          },
          restore: { title: 'Reset View' }
        },
        iconStyle: { borderColor: '#00f2fe' },
        right: '4%',
        top: 0
      },
      grid: { left: '4%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: 0,
          textStyle: { color: '#aaa' },
          bottom: '2%',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          fillerColor: 'rgba(0, 242, 254, 0.15)',
          handleStyle: { color: '#00f2fe' }
        },
        { type: 'inside', xAxisIndex: 0 },
        {
          type: 'slider',
          show: true,
          yAxisIndex: 0,
          right: '1%',
          width: 18,
          textStyle: { color: '#aaa' },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          fillerColor: 'rgba(99, 102, 241, 0.2)',
          handleStyle: { color: '#818cf8' }
        },
        { type: 'inside', yAxisIndex: 0 }
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
  const isMultiSensor = selectedEvalChannels.length > 1;
  const isBatchMode = Boolean(evaluationResult?.is_batch && evaluationResult?.runs_summary && evaluationResult.runs_summary.length > 0);

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
                  Drying or heating cycles naturally vary in duration. Comparing cycles by elapsed seconds causes false errors when one run takes slightly longer. SensorLens resamples sensor readings against <b>Cycle Progress (FMC% or Temperature)</b> onto a uniform 500-point grid.
                </p>
              </div>

              <div className="concept-card">
                <span className="concept-badge">2. Golden Baseline (Mean μ)</span>
                <h4>The True Golden Curve</h4>
                <p>
                  SensorLens computes the mathematical mean across all healthy reference runs at each step of the cycle, giving the true reference trajectory.
                </p>
              </div>

              <div className="concept-card">
                <span className="concept-badge">3. Multi-Sensor & Batch Verification</span>
                <h4>Diagnose Multiple Sensors & Test Runs</h4>
                <p>
                  Select multiple sensors to overlay their responses on a unified progress axis, and select multiple test runs to perform automated batch verification against your golden baseline in a single click.
                </p>
              </div>
            </div>
            <div className="concept-modal-footer">
              <button onClick={() => setShowGuide(false)} className="btn btn-primary">
                Got it, let's analyze!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar: Controls & Selection Matrices */}
      <aside className="baseline-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <Sliders size={16} className="text-accent-cyan" />
            <h2>Baseline Controller</h2>
          </div>
          <button 
            onClick={handleResetEngine} 
            className="btn-icon text-muted hover-red"
            title="Reset All Baseline Data"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="sidebar-body">
          {/* Section 1: Ingestion */}
          <div className="sidebar-section">
            <div className="section-label-row">
              <span className="section-label">1. Reference Runs (Baseline Ingestion)</span>
              <button 
                onClick={() => multiFileInputRef.current?.click()}
                className="btn-select-files"
              >
                <Upload size={12} />
                <span>Add Files</span>
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

            {/* Workspace Reference Runs Selector */}
            {files.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>From Workspace Runs:</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>{selectedWorkspaceRefIds.length} selected</span>
                </div>
                <div className="test-selection-list" style={{ maxHeight: '110px' }}>
                  {files.map(f => {
                    const isChecked = selectedWorkspaceRefIds.includes(f.id);
                    return (
                      <label key={f.id} className={`test-selection-item ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedWorkspaceRefIds(prev => 
                              prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id]
                            );
                          }}
                          className="test-checkbox"
                        />
                        <span className="test-file-title" title={f.name}>{f.name}</span>
                        {f.tag === 'reference' && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--accent-cyan)', background: 'rgba(0, 242, 254, 0.12)', padding: '1px 4px', borderRadius: '3px' }}>REF</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reference Files Pill Container for local files */}
            {refFilesList.length > 0 && (
              <div className="sidebar-files-pills" style={{ marginBottom: '8px' }}>
                {refFilesList.map((f, i) => (
                  <span key={i} className="sidebar-file-chip">
                    <span className="chip-name" title={f.name}>{f.name}</span>
                    <button onClick={() => removeSelectedFile(i)} className="chip-remove">×</button>
                  </span>
                ))}
              </div>
            )}

            {refFilesList.length === 0 && files.length === 0 && refFileNames.length > 0 && (
              <div className="sidebar-files-pills">
                {refFileNames.map((name, i) => (
                  <span key={i} className="sidebar-file-chip loaded">
                    <span className="chip-name" title={name}>✓ {name}</span>
                  </span>
                ))}
              </div>
            )}

            {refFilesList.length === 0 && files.length === 0 && refFileNames.length === 0 && (
              <div 
                onClick={() => multiFileInputRef.current?.click()}
                className="sidebar-empty-box"
              >
                <Upload size={18} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <span>Select 2+ healthy run files</span>
              </div>
            )}

            {/* Normalization Target Column */}
            <div className="sidebar-field-group">
              <label className="field-label">Cycle Progress Sensor:</label>
              {availableColumns.length > 0 ? (
                <select 
                  value={targetCol}
                  onChange={(e) => setTargetCol(e.target.value)}
                  className="field-input"
                  style={{ cursor: 'pointer' }}
                >
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={targetCol}
                  onChange={(e) => setTargetCol(e.target.value)}
                  placeholder="e.g. FMC% or Temperature"
                  className="field-input"
                />
              )}
            </div>

            {/* Cycle Direction Toggle */}
            <div className="sidebar-field-group">
              <label className="field-label">Cycle Direction:</label>
              <div className="toggle-btn-group">
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
              disabled={isBuilding || (refFilesList.length === 0 && selectedWorkspaceRefIds.length === 0)}
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

          {/* Section 2: Schema Availability Matrix (Multi-Sensor Select) */}
          {baselineProfile && baselineProfile.success && (
            <>
              <div className="sidebar-divider" />

              <div className="sidebar-section">
                <div className="section-label-row">
                  <span className="section-label">2. Sensor Selection</span>
                  <div className="selection-quick-actions">
                    <button onClick={selectAllChannels} className="btn-text-sm" title="Select All Channels">All</button>
                    <button onClick={clearAllChannels} className="btn-text-sm" title="Deselect All">None</button>
                    <span className="matrix-count-badge">
                      {selectedEvalChannels.length}/{baselineProfile.availability_matrix.length}
                    </span>
                  </div>
                </div>

                <div className="sidebar-matrix-list">
                  {baselineProfile.availability_matrix.map(row => {
                    const isChecked = selectedEvalChannels.includes(row.channel_name);
                    const isFocused = selectedEvalChannel === row.channel_name;
                    const evalCh = evaluationResult?.channel_evaluations?.[row.channel_name];
                    const isMissingInTest = evaluationResult && evaluationResult.channel_evaluations && !evalCh;

                    return (
                      <div 
                        key={row.channel_name}
                        onClick={() => {
                          setSelectedEvalChannel(row.channel_name);
                          if (!isChecked) toggleEvalChannel(row.channel_name);
                        }}
                        className={`matrix-item-row ${isFocused ? 'selected' : ''} ${isMissingInTest ? 'channel-missing-row' : ''}`}
                      >
                        <div className="matrix-item-left">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleEvalChannel(row.channel_name);
                              }}
                              className="matrix-checkbox"
                            />
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

              {/* Section 3: Verify Test Run(s) (Multi-Test Run Select) */}
              <div className="sidebar-section">
                <div className="section-label-row">
                  <span className="section-label">3. Verify Test Runs</span>
                  <div className="selection-quick-actions">
                    <button onClick={selectAllTests} className="btn-text-sm" title="Select All Uploaded Runs">All</button>
                    <button onClick={clearAllTests} className="btn-text-sm" title="Clear Selection">Clear</button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
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
                        Custom File: <b>{selectedTestFile.name}</b>
                      </span>
                      <button onClick={() => setSelectedTestFile(null)} className="chip-remove">×</button>
                    </span>
                  </div>
                ) : files.length > 0 ? (
                  <div className="test-selection-list">
                    {files.map(f => {
                      const isChecked = selectedTestFileIds.includes(f.id);
                      return (
                        <label key={f.id} className={`test-selection-item ${isChecked ? 'checked' : ''}`}>
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTestFileId(f.id)}
                            className="test-checkbox"
                          />
                          <span className="test-file-title" title={f.name}>{f.name}</span>
                          <span className="test-file-ch-tag">{f.columns.length} ch</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    No files loaded in workspace. Upload a file above to test.
                  </span>
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
                  disabled={isEvaluating || (!selectedTestFile && selectedTestFileIds.length === 0 && !selectedTestFileId)}
                  className="btn btn-accent btn-verify-test"
                >
                  {isEvaluating ? <RefreshCw className="animate-spin" size={13} /> : <Activity size={13} />}
                  <span>
                    {selectedTestFileIds.length > 1 
                      ? `Verify ${selectedTestFileIds.length} Test Runs (Batch)` 
                      : 'Verify Against Baseline'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Right Main Stage: Toolbar + ECharts Canvas + Verdict Banner / Multi Scorecard */}
      <main className="baseline-main">
        {/* Stage Header Toolbar */}
        <div className="baseline-stage-toolbar">
          <div className="stage-toolbar-left">
            {selectedEvalChannels.length > 1 ? (
              <div className="channel-active-indicator">
                <span className="channel-name">Multi-Sensor Overlay ({selectedEvalChannels.length} Sensors)</span>
                <span className="channel-grid-tag">500-pt Progress Grid (±{kSigma}σ corridor)</span>
                {evaluationResult && (
                  <span className="channel-test-tag">
                    {isBatchMode 
                      ? `Batch: ${evaluationResult.runs_summary?.length} Test Runs` 
                      : `Testing: ${evaluationResult.test_file_name}`}
                  </span>
                )}
              </div>
            ) : selectedEvalChannel ? (
              <div className="channel-active-indicator">
                <span className="channel-name">{selectedEvalChannel}</span>
                <span className="channel-grid-tag">500-pt Progress Grid (±{kSigma}σ corridor)</span>
                {evaluationResult && (
                  evaluationResult.channel_evaluations?.[selectedEvalChannel] ? (
                    <span className="channel-test-tag">
                      {isBatchMode ? `Batch (${evaluationResult.runs_summary?.length} runs)` : `Testing: ${evaluationResult.test_file_name}`}
                    </span>
                  ) : (
                    <span className="channel-test-tag missing-tag">Not recorded in test run</span>
                  )
                )}
              </div>
            ) : (
              <span className="stage-idle-title">Multi-Reference Baseline Engine</span>
            )}
          </div>

          <div className="stage-toolbar-right">
            {/* Batch Run Switcher Tabs */}
            {isBatchMode && evaluationResult?.runs_summary && (
              <div className="batch-run-switcher">
                <button
                  onClick={() => setActiveBatchRunId('all')}
                  className={`batch-tab ${activeBatchRunId === 'all' ? 'active' : ''}`}
                >
                  <Layers size={12} />
                  <span>All Runs ({evaluationResult.runs_summary.length})</span>
                </button>
                {evaluationResult.runs_summary.map(r => (
                  <button
                    key={r.file_id}
                    onClick={() => setActiveBatchRunId(r.file_id)}
                    className={`batch-tab ${activeBatchRunId === r.file_id ? 'active' : ''} ${r.verdict.toLowerCase()}`}
                    title={`${r.file_name}: ${r.verdict}`}
                  >
                    <span>{r.file_name.slice(0, 14)}</span>
                    <span className={`batch-verdict-pill ${r.verdict.toLowerCase()}`}>{r.verdict}</span>
                  </button>
                ))}
              </div>
            )}

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

        {/* Stage Footer: Diagnostic Verdict Banner OR Multi-Sensor Scorecard Table */}
        {(isMultiSensor || isBatchMode) && evaluationResult ? (
          <div className="baseline-stage-footer multi-scorecard-footer">
            <div className="multi-scorecard-header">
              <div className="scorecard-title-box">
                <ListFilter size={15} className="text-accent-cyan" />
                <span className="scorecard-title">Multi-Channel & Batch Diagnostic Scorecard</span>
              </div>
              <span className="scorecard-subtitle">
                Comprehensive tolerance evaluation across selected sensors and test runs
              </span>
            </div>

            <div className="scorecard-table-scroll">
              <table className="scorecard-table">
                <thead>
                  <tr>
                    <th>Sensor Name</th>
                    <th>Test Run</th>
                    <th>Evaluation Verdict</th>
                    <th>Corridor Violations</th>
                    <th>CAD Severity</th>
                    <th>Timing Sync</th>
                    <th>Matched Test Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {isBatchMode && evaluationResult.evaluations_by_run ? (
                    Object.entries(evaluationResult.evaluations_by_run).flatMap(([runId, runEval]) => {
                      if (activeBatchRunId !== 'all' && activeBatchRunId !== runId) return [];
                      const targetChannels = selectedEvalChannels.length > 0 ? selectedEvalChannels : [selectedEvalChannel];
                      return targetChannels.map(chName => {
                        const m = runEval.channel_evaluations?.[chName];
                        const verdict = !m ? 'MISSING' : m.violation_pct === 0 ? 'PASS' : m.violation_pct < 5 ? 'ACCEPTABLE' : m.violation_pct < 15 ? 'WARNING' : 'DEFECT';
                        return (
                          <tr key={`${runId}-${chName}`}>
                            <td className="sensor-name-cell">
                              <span className="sensor-dot" />
                              <b>{chName}</b>
                            </td>
                            <td>{runEval.test_file_name}</td>
                            <td>
                              <span className={`scorecard-verdict-badge ${verdict.toLowerCase()}`}>
                                {verdict}
                              </span>
                            </td>
                            <td>{m ? `${m.violation_pct}%` : 'N/A'}</td>
                            <td>{m ? m.cumulative_deviation.toFixed(1) : 'N/A'}</td>
                            <td>{m ? `${(m.slope_correlation * 100).toFixed(0)}%` : 'N/A'}</td>
                            <td className="text-muted">{m?.matched_test_col || '—'}</td>
                          </tr>
                        );
                      });
                    })
                  ) : evaluationResult.channel_evaluations ? (
                    (selectedEvalChannels.length > 0 ? selectedEvalChannels : [selectedEvalChannel]).map(chName => {
                      const m = evaluationResult.channel_evaluations[chName];
                      const verdict = !m ? 'MISSING' : m.violation_pct === 0 ? 'PASS' : m.violation_pct < 5 ? 'ACCEPTABLE' : m.violation_pct < 15 ? 'WARNING' : 'DEFECT';
                      return (
                        <tr key={chName}>
                          <td className="sensor-name-cell">
                            <span className="sensor-dot" />
                            <b>{chName}</b>
                          </td>
                          <td>{evaluationResult.test_file_name}</td>
                          <td>
                            <span className={`scorecard-verdict-badge ${verdict.toLowerCase()}`}>
                              {verdict}
                            </span>
                          </td>
                          <td>{m ? `${m.violation_pct}%` : 'N/A'}</td>
                          <td>{m ? m.cumulative_deviation.toFixed(1) : 'N/A'}</td>
                          <td>{m ? `${(m.slope_correlation * 100).toFixed(0)}%` : 'N/A'}</td>
                          <td className="text-muted">{m?.matched_test_col || '—'}</td>
                        </tr>
                      );
                    })
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : currentEvalMetrics ? (
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
