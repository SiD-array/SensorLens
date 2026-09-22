import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Network, Cpu, Play, AlertTriangle, 
  HelpCircle, RefreshCw, Award, Sparkles,
  ChevronDown, Filter, X, Star, Layers,
  Combine, ArrowUpDown, Check, Target,
  BarChart3, Grid3X3, Wrench, Activity,
  TrendingUp, Gauge, Clock, Sliders,
  EyeOff, Search, RotateCcw, CheckCircle2, Eye
} from 'lucide-react';
import type { TestFile } from '../../types/baseline';

interface AnalyticsViewProps {
  files: TestFile[];
  activeFileId?: string;
  isActive?: boolean;
  onFilesUpdate?: (updatedFiles: TestFile[]) => void;
}

export interface FeatureRanking {
  column: string;
  score: number;
  signed_score?: number;
  direction?: 'positive' | 'negative';
  rank: number;
}

export interface GlobalDiagnosis {
  recommended_algorithm: string;
  explanation: string;
  suitability_scores: {
    pearson: number;
    spearman: number;
    kendall: number;
    fastdtw: number;
    mutual_info: number;
  };
  breakdown: {
    linear_pct: number;
    monotonic_pct: number;
    complex_nonlinear_pct: number;
    phase_lagged_pct: number;
    weak_pct: number;
  };
  total_sensors_analyzed: number;
  target_col?: string | null;
}

interface CorrelationData {
  columns: string[];
  all_common_columns?: string[];
  target_col?: string | null;
  all_sensors_rankings?: Record<string, FeatureRanking[]>;
  global_diagnosis?: GlobalDiagnosis;
  available_algorithms: string[];
  matrices: Record<string, number[][]>;
  feature_rankings?: Record<string, FeatureRanking[]>;
  total_runs?: number;
  total_samples?: number;
}

interface PairDiagnostic {
  col_a: string;
  col_b: string;
  scores: {
    pearson: number;
    spearman: number;
    kendall: number;
    fastdtw: number;
    mutual_info: number;
  };
  recommended_algorithm: string;
  explanation: string;
  characteristics: string[];
  scatter_points: [number, number][];
  total_runs?: number;
  total_samples?: number;
}

interface LeaderboardItem {
  key: string;
  name: string;
  r2: number;
  rmse: number;
  mae: number;
  train_time_ms: number;
  is_champion: boolean;
}

interface FeatureImportance {
  feature: string;
  importance: number;
  rf: number;
  xgb: number;
  lgb: number;
}

export interface RULResult {
  success: boolean;
  target_col: string;
  threshold: number;
  direction: 'increasing' | 'decreasing';
  current_val: number;
  initial_val: number;
  health_index_pct: number;
  operating_state: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  rul_samples: number | null;
  rul_str: string;
  degradation_rate_100: number;
  model_used: string;
  historical: { step: number; value: number; fitted?: number | null }[];
  forecast: { step: number; projected: number; upper: number; lower: number }[];
  total_runs?: number;
  total_samples?: number;
}

interface MLTrainingResult {
  success: boolean;
  target_col: string;
  feature_cols: string[];
  total_rows: number;
  train_rows: number;
  test_rows: number;
  split_index: number;
  champion: string;
  leaderboard: LeaderboardItem[];
  feature_importance_ranking: FeatureImportance[];
  total_runs?: number;
  total_samples?: number;
  plot_data: {
    indices: number[];
    actual: number[];
    random_forest: number[];
    xgboost: number[];
    lightgbm: number[];
    svr?: number[];
    elastic_net?: number[];
    mlp?: number[];
    test_split_x: number;
  };
  residuals: {
    random_forest: number[];
    xgboost: number[];
    lightgbm: number[];
    svr?: number[];
    elastic_net?: number[];
    mlp?: number[];
  };
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ files, activeFileId, onFilesUpdate }) => {
  const [activeTab, setActiveTab] = useState<'correlation' | 'ml' | 'rul'>('correlation');

  // Multi-run active dataset selection
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(() => {
    if (activeFileId) return [activeFileId];
    // Default to runs with useful tag if available, else first file
    const useful = files.filter(f => f.tag === 'useful').map(f => f.id);
    if (useful.length > 0) return useful;
    return files[0]?.id ? [files[0].id] : [];
  });

  // Dropdown popover state
  const [isRunSelectorOpen, setIsRunSelectorOpen] = useState(false);
  const [runSearchQuery, setRunSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsRunSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedFileIds.length === 0 && files.length > 0) {
      setSelectedFileIds([files[0].id]);
    }
  }, [files]);

  const selectedFiles = useMemo(() => {
    return files.filter(f => selectedFileIds.includes(f.id));
  }, [files, selectedFileIds]);

  // Common numeric columns across all selected files
  const numericColumns = useMemo(() => {
    if (selectedFiles.length === 0) return [];
    let common: string[] | null = null;
    for (const file of selectedFiles) {
      const fileNumeric = file.columns.filter(c => c.type === 'numeric').map(c => c.name);
      if (common === null) {
        common = fileNumeric;
      } else {
        const set = new Set(fileNumeric);
        common = common.filter(c => set.has(c));
      }
    }
    return common || [];
  }, [selectedFiles]);

  const filteredFiles = useMemo(() => {
    if (!runSearchQuery.trim()) return files;
    const q = runSearchQuery.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(q));
  }, [files, runSearchQuery]);

  const toggleFileSelection = (id: string) => {
    if (selectedFileIds.includes(id)) {
      setSelectedFileIds(selectedFileIds.filter(fid => fid !== id));
    } else {
      setSelectedFileIds([...selectedFileIds, id]);
    }
  };

  const handleSelectUsefulOnly = () => {
    const usefulIds = files
      .filter(f => f.tag === 'useful' || f.name.toLowerCase().includes('useful'))
      .map(f => f.id);
    if (usefulIds.length > 0) {
      setSelectedFileIds(usefulIds);
    } else {
      setSelectedFileIds(files.map(f => f.id));
    }
  };

  // -------------------------------------------------------------
  // 1. CORRELATION EXPLORER STATE
  // -------------------------------------------------------------
  const [targetVariable, setTargetVariable] = useState<string>('');
  const [stageViewMode, setStageViewMode] = useState<'tornado' | 'heatmap'>('tornado');
  const [sensorScope, setSensorScope] = useState<'top20' | 'all'>('top20');
  const [diagTab, setDiagTab] = useState<'global' | 'pair'>('global');
  const [selectedCorrAlgo, setSelectedCorrAlgo] = useState<'pearson' | 'spearman' | 'kendall' | 'fastdtw' | 'mutual_info'>('pearson');
  const [selectedCorrChannels, setSelectedCorrChannels] = useState<string[]>([]);
  const [corrData, setCorrData] = useState<CorrelationData | null>(null);
  const [isLoadingCorr, setIsLoadingCorr] = useState(false);
  const [corrError, setCorrError] = useState<string | null>(null);

  // Sorting mode for channels
  const [channelSortMode, setChannelSortMode] = useState<'rank' | 'alpha'>('rank');

  // Selected cell for pairwise deep-dive
  const [selectedPair, setSelectedPair] = useState<{ col_a: string; col_b: string } | null>(null);
  const [pairDiag, setPairDiag] = useState<PairDiagnostic | null>(null);
  const [isLoadingPair, setIsLoadingPair] = useState(false);

  const numColsKey = useMemo(() => numericColumns.join(','), [numericColumns]);
  const fileIdsKey = useMemo(() => selectedFileIds.join(','), [selectedFileIds]);

  // Initialize target variable when numeric columns load
  useEffect(() => {
    if (numericColumns.length >= 1) {
      if (!targetVariable || !numericColumns.includes(targetVariable)) {
        setTargetVariable(numericColumns[0]);
      }
    } else {
      setTargetVariable('');
    }
  }, [numColsKey]);

  // Active rankings for the selected correlation algorithm (all common sensors or matrix)
  const activeRankings = useMemo(() => {
    if (!corrData) return {};
    const list = corrData.all_sensors_rankings?.[selectedCorrAlgo]
      || corrData.feature_rankings?.[selectedCorrAlgo]
      || [];
    const map: Record<string, FeatureRanking> = {};
    list.forEach(item => { map[item.column] = item; });
    return map;
  }, [corrData, selectedCorrAlgo]);

  // Tooltip DOM cleanup to guarantee no lingering tooltips on mode or tab switches
  useEffect(() => {
    document.querySelectorAll('.echarts-tooltip, div[class*="echarts-tooltip"]').forEach(el => el.remove());
  }, [stageViewMode, activeTab]);

  // -------------------------------------------------------------
  // SENSOR EXCLUSION & RULE-OUT STATE
  // -------------------------------------------------------------
  const [excludedSensors, setExcludedSensors] = useState<string[]>([]);
  const [autoExcludePCA, setAutoExcludePCA] = useState(true);
  const [isExcludedModalOpen, setIsExcludedModalOpen] = useState(false);
  const [excludedSearchQuery, setExcludedSearchQuery] = useState('');
  const [excludedFilterTab, setExcludedFilterTab] = useState<'all' | 'excluded' | 'active'>('all');

  const handleRuleOutSensor = (col: string) => {
    setExcludedSensors(prev => Array.from(new Set([...prev, col])));
    setSelectedCorrChannels(prev => prev.filter(c => c !== col));
  };

  const handleRestoreSensor = (col: string) => {
    setExcludedSensors(prev => prev.filter(c => c !== col));
  };

  const handleClearAllExclusions = () => {
    setExcludedSensors([]);
  };

  // Filtered numeric channels respecting user exclusions
  const availableNumericColumns = useMemo(() => {
    return numericColumns.filter(c => !excludedSensors.includes(c));
  }, [numericColumns, excludedSensors]);

  // Filtered channels for the floating interactive window
  const filteredModalSensors = useMemo(() => {
    let list = numericColumns;
    if (excludedFilterTab === 'excluded') {
      list = list.filter(c => excludedSensors.includes(c));
    } else if (excludedFilterTab === 'active') {
      list = list.filter(c => !excludedSensors.includes(c));
    }
    if (excludedSearchQuery.trim()) {
      const q = excludedSearchQuery.toLowerCase();
      list = list.filter(c => c.toLowerCase().includes(q));
    }
    return list;
  }, [numericColumns, excludedSensors, excludedFilterTab, excludedSearchQuery]);

  // -------------------------------------------------------------
  // FEATURE CONSTRUCTION & EXTRACTION STUDIO STATE
  // -------------------------------------------------------------
  const [isFeatureStudioOpen, setIsFeatureStudioOpen] = useState(false);
  const [featCategory, setFeatCategory] = useState<'rolling' | 'derivatives' | 'arithmetic' | 'transforms'>('rolling');
  const [featOperation, setFeatOperation] = useState<string>('rolling_rms');
  const [featSource1, setFeatSource1] = useState<string>('');
  const [featSource2, setFeatSource2] = useState<string>('');
  const [featWindow, setFeatWindow] = useState<number>(10);
  const [featCustomName, setFeatCustomName] = useState<string>('');
  const [isConstructingFeat, setIsConstructingFeat] = useState(false);
  const [featStudioError, setFeatStudioError] = useState<string | null>(null);
  const [featStudioSuccess, setFeatStudioSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (availableNumericColumns.length > 0) {
      if (!featSource1 || !availableNumericColumns.includes(featSource1)) {
        setFeatSource1(availableNumericColumns[0]);
      }
      if (!featSource2 || !availableNumericColumns.includes(featSource2)) {
        setFeatSource2(availableNumericColumns.length > 1 ? availableNumericColumns[1] : availableNumericColumns[0]);
      }
    }
  }, [availableNumericColumns]);

  useEffect(() => {
    if (!featSource1) return;
    const clean1 = featSource1.replace(/[^a-zA-Z0-9]/g, '_');
    const clean2 = featSource2 ? featSource2.replace(/[^a-zA-Z0-9]/g, '_') : '';
    let name = '';
    if (featOperation === 'rolling_rms') name = `RMS_${clean1}_w${featWindow}`;
    else if (featOperation === 'rolling_mean') name = `MA_${clean1}_w${featWindow}`;
    else if (featOperation === 'rolling_std') name = `Std_${clean1}_w${featWindow}`;
    else if (featOperation === 'rolling_peak_to_peak') name = `P2P_${clean1}_w${featWindow}`;
    else if (featOperation === 'derivative') name = `d_${clean1}_dt`;
    else if (featOperation === 'acceleration') name = `d2_${clean1}_dt2`;
    else if (featOperation === 'rate_of_change') name = `RoC_${clean1}`;
    else if (featOperation === 'differential') name = `Diff_${clean1}_${clean2 || 'B'}`;
    else if (featOperation === 'ratio') name = `Ratio_${clean1}_${clean2 || 'B'}`;
    else if (featOperation === 'product') name = `Prod_${clean1}_${clean2 || 'B'}`;
    else if (featOperation === 'sum') name = `Sum_${clean1}_${clean2 || 'B'}`;
    else if (featOperation === 'log') name = `Log_${clean1}`;
    else if (featOperation === 'square') name = `Sq_${clean1}`;
    else if (featOperation === 'sqrt') name = `Sqrt_${clean1}`;
    else if (featOperation === 'zscore') name = `Z_${clean1}`;
    else if (featOperation === 'cusum') name = `CUSUM_${clean1}`;
    setFeatCustomName(name);
  }, [featOperation, featSource1, featSource2, featWindow]);

  const handleConstructFeature = async () => {
    if (!featSource1 || !featCustomName.trim() || selectedFileIds.length === 0) return;
    setIsConstructingFeat(true);
    setFeatStudioError(null);
    setFeatStudioSuccess(null);

    const sources = [featSource1];
    if (['differential', 'ratio', 'product', 'sum'].includes(featOperation) && featSource2) {
      sources.push(featSource2);
    }

    try {
      const res = await fetch('http://localhost:8000/api/analytics/construct-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFileIds,
          operation: featOperation,
          source_cols: sources,
          new_sensor_name: featCustomName.trim(),
          window_size: featWindow
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Feature construction failed');
      }

      const data = await res.json();
      const newCol = data.sensor_column;
      const newColName = data.new_sensor_name;

      const updatedFiles = files.map(f => {
        if (selectedFileIds.includes(f.id)) {
          const existingCols = f.columns.map(c => c.name);
          if (!existingCols.includes(newColName)) {
            return {
              ...f,
              columns: [...f.columns, newCol]
            };
          }
        }
        return f;
      });

      if (onFilesUpdate) {
        onFilesUpdate(updatedFiles);
      }

      setSelectedCorrChannels(prev => Array.from(new Set([newColName, ...prev])));
      setFeatStudioSuccess(`Feature "${newColName}" created successfully!`);
      setTimeout(() => {
        setIsFeatureStudioOpen(false);
        setFeatStudioSuccess(null);
      }, 1500);
    } catch (err: any) {
      setFeatStudioError(err.message || 'Error creating feature');
    } finally {
      setIsConstructingFeat(false);
    }
  };

  // -------------------------------------------------------------
  // 3. REMAINING USEFUL LIFE (RUL) PROGNOSTICS STATE
  // -------------------------------------------------------------
  const [rulTarget, setRulTarget] = useState<string>('');
  const [rulThreshold, setRulThreshold] = useState<number>(5.0);
  const [rulDirection, setRulDirection] = useState<'increasing' | 'decreasing'>('increasing');
  const [rulModelType, setRulModelType] = useState<'exponential' | 'polynomial' | 'linear'>('exponential');
  const [rulResult, setRulResult] = useState<RULResult | null>(null);
  const [isLoadingRUL, setIsLoadingRUL] = useState(false);
  const [rulError, setRulError] = useState<string | null>(null);

  useEffect(() => {
    if (availableNumericColumns.length > 0) {
      if (!rulTarget || !availableNumericColumns.includes(rulTarget)) {
        setRulTarget(targetVariable || availableNumericColumns[0]);
      }
    }
  }, [availableNumericColumns, targetVariable]);

  const handleRunRULPrognosis = async () => {
    if (!rulTarget || selectedFileIds.length === 0) return;
    setIsLoadingRUL(true);
    setRulError(null);

    try {
      const res = await fetch('http://localhost:8000/api/analytics/rul-prognosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFileIds,
          target_col: rulTarget,
          threshold: Number(rulThreshold),
          direction: rulDirection,
          model_type: rulModelType
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'RUL Prognosis calculation failed');
      }

      const data: RULResult = await res.json();
      setRulResult(data);
    } catch (e: any) {
      setRulError(e.message || 'Failed to compute RUL prognosis');
    } finally {
      setIsLoadingRUL(false);
    }
  };

  // Active target predictive drivers list, sorted according to active algorithm and filtered by exclusions
  const activeDrivers = useMemo(() => {
    if (!corrData) return [];
    const rankings = corrData.all_sensors_rankings?.[selectedCorrAlgo]
      || corrData.feature_rankings?.[selectedCorrAlgo]
      || [];
    const list = (corrData.target_col
      ? rankings.filter(r => r.column !== corrData.target_col)
      : rankings).filter(r => !excludedSensors.includes(r.column));

    if (sensorScope === 'top20') {
      return list.slice(0, 20);
    }
    return list;
  }, [corrData, selectedCorrAlgo, sensorScope, excludedSensors]);

  // Displayed channels sorted by rank or alpha, respecting exclusions
  const displayChannels = useMemo(() => {
    const cols = [...availableNumericColumns];
    if (channelSortMode === 'rank' && Object.keys(activeRankings).length > 0) {
      cols.sort((a, b) => {
        const rankA = activeRankings[a]?.rank ?? 9999;
        const rankB = activeRankings[b]?.rank ?? 9999;
        return rankA - rankB;
      });
    } else {
      cols.sort((a, b) => a.localeCompare(b));
    }
    return cols;
  }, [availableNumericColumns, channelSortMode, activeRankings]);

  // Algorithm-aware Top 20 selection
  const handleSelectTop20 = () => {
    if (Object.keys(activeRankings).length > 0) {
      const ranked = [...numericColumns].sort((a, b) => {
        const rA = activeRankings[a]?.rank ?? 9999;
        const rB = activeRankings[b]?.rank ?? 9999;
        return rA - rB;
      });
      if (targetVariable && numericColumns.includes(targetVariable)) {
        const others = ranked.filter(c => c !== targetVariable);
        setSelectedCorrChannels([targetVariable, ...others.slice(0, 19)]);
      } else {
        setSelectedCorrChannels(ranked.slice(0, 20));
      }
    } else {
      if (targetVariable && numericColumns.includes(targetVariable)) {
        const others = numericColumns.filter(c => c !== targetVariable);
        setSelectedCorrChannels([targetVariable, ...others.slice(0, 19)]);
      } else {
        setSelectedCorrChannels(numericColumns.slice(0, 20));
      }
    }
  };

  // -------------------------------------------------------------
  // MANUAL PCA / COMPOSITE SENSOR BUILDER STATE
  // -------------------------------------------------------------
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [compositeSources, setCompositeSources] = useState<string[]>([]);
  const [compositeMethod, setCompositeMethod] = useState<'pca' | 'average'>('pca');
  const [compositeName, setCompositeName] = useState('');
  const [isGeneratingComposite, setIsGeneratingComposite] = useState(false);
  const [compositeError, setCompositeError] = useState<string | null>(null);
  const [compositeSuccessMsg, setCompositeSuccessMsg] = useState<string | null>(null);

  // Auto-suggest name
  useEffect(() => {
    if (compositeSources.length >= 2) {
      const clean = compositeSources.slice(0, 2).map(s => s.replace(/[^a-zA-Z0-9]/g, '_'));
      const prefix = compositeMethod === 'pca' ? 'PCA' : 'Avg';
      setCompositeName(`${prefix}_${clean.join('_')}`);
    }
  }, [compositeSources, compositeMethod]);

  const handleCreateComposite = async () => {
    if (compositeSources.length < 2 || !compositeName.trim() || selectedFileIds.length === 0) return;
    setIsGeneratingComposite(true);
    setCompositeError(null);
    setCompositeSuccessMsg(null);

    try {
      const res = await fetch('http://localhost:8000/api/analytics/composite-sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFileIds,
          source_cols: compositeSources,
          method: compositeMethod,
          new_sensor_name: compositeName.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to generate composite sensor');
      }

      const data = await res.json();
      const newCol = data.sensor_column;
      const newColName = data.new_sensor_name;

      // Update frontend files state across all selected files
      const updatedFiles = files.map(f => {
        if (selectedFileIds.includes(f.id)) {
          const existingCols = f.columns.map(c => c.name);
          if (!existingCols.includes(newColName)) {
            return {
              ...f,
              columns: [...f.columns, newCol]
            };
          }
        }
        return f;
      });

      if (onFilesUpdate) {
        onFilesUpdate(updatedFiles);
      }

      // Automatically include the new composite sensor in the correlation channels
      setSelectedCorrChannels(prev => Array.from(new Set([newColName, ...prev])));

      if (autoExcludePCA) {
        setExcludedSensors(prev => Array.from(new Set([...prev, ...compositeSources])));
      }

      const successNote = data.method === 'pca' && data.variance_explained_pct
        ? `Generated ${newColName} via PCA (${data.variance_explained_pct}% variance explained)!`
        : `Generated ${newColName} via Normalized Average!`;

      setCompositeSuccessMsg(successNote);
      setTimeout(() => {
        setIsCombineModalOpen(false);
        setCompositeSuccessMsg(null);
        setCompositeSources([]);
      }, 1600);
    } catch (err: any) {
      console.error(err);
      setCompositeError(err.message || 'Error generating composite sensor');
    } finally {
      setIsGeneratingComposite(false);
    }
  };

  // Sync selected channels when common columns change
  useEffect(() => {
    if (numericColumns.length >= 2) {
      setSelectedCorrChannels(prev => {
        const valid = prev.filter(c => numericColumns.includes(c));
        if (valid.length >= 2) return valid;
        return numericColumns.slice(0, Math.min(numericColumns.length, 12));
      });
      setSelectedPair(null);
      setPairDiag(null);
    } else {
      setSelectedCorrChannels([]);
      setSelectedPair(null);
      setPairDiag(null);
      setCorrData(null);
    }
  }, [fileIdsKey, numColsKey]);

  // Auto-fetch correlations on initial mount when files ready
  const hasAutoFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoFetchedRef.current && selectedFileIds.length > 0 && numericColumns.length >= 2) {
      hasAutoFetchedRef.current = true;
      const initial = numericColumns.slice(0, Math.min(numericColumns.length, 12));
      handleFetchCorrelations(initial);
    }
  }, [selectedFileIds, numericColumns]);


  const handleFetchCorrelations = async (channelsOverride?: string[], targetOverride?: string) => {
    const channelsToUse = channelsOverride || selectedCorrChannels;
    if (selectedFileIds.length === 0 || channelsToUse.length < 2) return;
    setIsLoadingCorr(true);
    setCorrError(null);

    try {
      const formData = new FormData();
      formData.append('file_ids_json', JSON.stringify(selectedFileIds));
      if (selectedFileIds.length === 1) {
        formData.append('file_id', selectedFileIds[0]);
      }
      formData.append('columns_json', JSON.stringify(channelsToUse));
      if (excludedSensors.length > 0) {
        formData.append('excluded_columns_json', JSON.stringify(excludedSensors));
      }
      formData.append('algorithm', 'all');

      const effectiveTarget = targetOverride !== undefined ? targetOverride : targetVariable;
      if (effectiveTarget && effectiveTarget.trim()) {
        formData.append('target_col', effectiveTarget.trim());
      }

      const res = await fetch('http://localhost:8000/api/analytics/correlations', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Correlation benchmark calculation failed');
      }

      const data: CorrelationData = await res.json();
      setCorrData(data);

      // Auto-select stage view and inspect pair
      if (data.target_col) {
        setStageViewMode('tornado');
        // Find top driver of this target
        const rankings = data.feature_rankings?.[selectedCorrAlgo] || [];
        const topDriver = rankings.find(r => r.column !== data.target_col)?.column;
        if (topDriver) {
          handleInspectPair(data.target_col, topDriver);
        } else if (data.columns.length >= 2) {
          handleInspectPair(data.columns[0], data.columns[1]);
        }
      } else {
        if (data.columns.length >= 2) {
          handleInspectPair(data.columns[0], data.columns[1]);
        }
      }
    } catch (e: any) {
      console.error(e);
      setCorrError(e.message || 'Failed to calculate correlations');
    } finally {
      setIsLoadingCorr(false);
    }
  };

  const handleInspectPair = async (colA: string, colB: string) => {
    setSelectedPair({ col_a: colA, col_b: colB });
    if (selectedFileIds.length === 0) return;

    setIsLoadingPair(true);
    try {
      const res = await fetch('http://localhost:8000/api/analytics/diagnose-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFileIds,
          file_id: selectedFileIds[0],
          col_a: colA,
          col_b: colB
        })
      });

      if (res.ok) {
        const data: PairDiagnostic = await res.json();
        setPairDiag(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPair(false);
    }
  };

  // Bridge from Correlation Explorer to ML Model Studio
  const handleExportToML = () => {
    if (!corrData?.target_col) return;
    setTargetVariable(corrData.target_col);
    const rankings = corrData.feature_rankings?.[selectedCorrAlgo] || [];
    const topDrivers = rankings
      .filter(r => r.column !== corrData.target_col)
      .slice(0, 8)
      .map(r => r.column);
    if (topDrivers.length > 0) {
      setFeatureSensors(topDrivers);
    }
    setActiveTab('ml');
  };

  // -------------------------------------------------------------
  // 2. ML PREDICTION STUDIO STATE
  // -------------------------------------------------------------
  const [featureSensors, setFeatureSensors] = useState<string[]>([]);
  const [splitRatio, setSplitRatio] = useState<number>(0.2); // 80% train / 20% test
  const [isTrainingML, setIsTrainingML] = useState(false);
  const [mlResult, setMlResult] = useState<MLTrainingResult | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);

  // Initialize features when target or columns change
  useEffect(() => {
    if (numericColumns.length >= 2) {
      setFeatureSensors(prev => {
        const valid = prev.filter(c => numericColumns.includes(c) && c !== targetVariable);
        if (valid.length > 0) return valid;
        return numericColumns.filter(c => c !== targetVariable).slice(0, Math.min(numericColumns.length - 1, 8));
      });
    } else {
      setFeatureSensors([]);
    }
  }, [numColsKey, targetVariable]);

  const handleTrainMLModels = async () => {
    if (selectedFileIds.length === 0 || !targetVariable || featureSensors.length === 0) return;
    setIsTrainingML(true);
    setMlError(null);

    try {
      const formData = new FormData();
      formData.append('file_ids_json', JSON.stringify(selectedFileIds));
      if (selectedFileIds.length === 1) {
        formData.append('file_id', selectedFileIds[0]);
      }
      formData.append('target_col', targetVariable);
      formData.append('feature_cols_json', JSON.stringify(featureSensors));
      formData.append('test_size', splitRatio.toString());

      const res = await fetch('http://localhost:8000/api/analytics/ml-train', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'ML model training failed');
      }

      const data: MLTrainingResult = await res.json();
      setMlResult(data);
    } catch (e: any) {
      console.error(e);
      setMlError(e.message || 'Model prediction training failed');
    } finally {
      setIsTrainingML(false);
    }
  };

  // -------------------------------------------------------------
  // CHART BUILDERS
  // -------------------------------------------------------------
  const getTargetTornadoOption = () => {
    if (!corrData || activeDrivers.length === 0) {
      return {
        backgroundColor: 'transparent',
        title: {
          text: 'No predictive drivers available. Check channel selections or exclusions.',
          left: 'center',
          top: 'center',
          textStyle: { color: '#94a3b8', fontSize: 13, fontWeight: 'normal' }
        }
      };
    }

    const reversed = [...activeDrivers].reverse();
    const categories = reversed.map(d => d.column);
    const values = reversed.map(d => d.signed_score !== undefined ? d.signed_score : d.score);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        appendToBody: false,
        hideDelay: 50,
        formatter: (params: any) => {
          const d = reversed[params[0].dataIndex];
          const val = params[0].value;
          const sign = val > 0 ? '+' : '';
          return `<b>${d.column}</b> ↔ <b>${corrData.target_col || 'Target'}</b><br/>` +
                 `Coupling (${selectedCorrAlgo.toUpperCase()}): <b>${sign}${typeof val === 'number' ? val.toFixed(4) : val}</b><br/>` +
                 `Rank: <b>#${d.rank}</b> of ${corrData.all_common_columns?.length || activeDrivers.length}<br/>` +
                 `Direction: <b style="color:${val >= 0 ? '#34d399' : '#f43f5e'}">${val >= 0 ? 'Positive Coupling' : 'Inverse / Negative Coupling'}</b><br/>` +
                 `<span style="font-size:0.72rem;color:#94a3b8">Click bar to view full non-linear & lag diagnostic</span>`;
        }
      },
      grid: { left: '22%', right: '12%', bottom: '10%', top: '6%', containLabel: true },
      dataZoom: activeDrivers.length > 25 ? [
        { type: 'inside', yAxisIndex: 0, start: Math.max(0, 100 - Math.round((25 / activeDrivers.length) * 100)), end: 100 },
        { type: 'slider', yAxisIndex: 0, right: 8, width: 14, borderColor: 'rgba(255,255,255,0.1)' }
      ] : undefined,
      xAxis: {
        type: 'value',
        name: `${selectedCorrAlgo.toUpperCase()} Coupling Score`,
        nameLocation: 'middle',
        nameGap: 24,
        min: -1,
        max: 1,
        axisLabel: { 
          color: '#aaa', 
          fontSize: 11,
          formatter: (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))
        },
        splitLine: { 
          lineStyle: { 
            color: 'rgba(255, 255, 255, 0.08)',
            width: 1
          } 
        },
        axisLine: {
          show: true,
          onZero: true,
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.4)',
            width: 1.5
          }
        }
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: '#e2e8f0', fontSize: 11, fontWeight: 500 }
      },
      series: [{
        name: 'Target Coupling',
        type: 'bar',
        data: values.map(val => ({
          value: val,
          itemStyle: {
            color: val >= 0
              ? {
                  type: 'linear',
                  x: 0, y: 0, x2: 1, y2: 0,
                  colorStops: [
                    { offset: 0, color: '#059669' },
                    { offset: 1, color: '#10b981' }
                  ]
                }
              : {
                  type: 'linear',
                  x: 0, y: 0, x2: 1, y2: 0,
                  colorStops: [
                    { offset: 0, color: '#e11d48' },
                    { offset: 1, color: '#f43f5e' }
                  ]
                },
            borderRadius: val >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4]
          }
        })),
        label: {
          show: true,
          position: (params: any) => params.value >= 0 ? 'right' : 'left',
          formatter: (params: any) => {
            const v = params.value;
            return (v > 0 ? '+' : '') + Number(v).toFixed(3);
          },
          color: '#e2e8f0',
          fontSize: 10,
          fontWeight: 600
        }
      }]
    };
  };

  const getCorrelationHeatmapOption = () => {
    if (!corrData || !corrData.matrices[selectedCorrAlgo]) return {};
    const cols = corrData.columns;
    const matrix = corrData.matrices[selectedCorrAlgo];

    const dataPoints: [number, number, number][] = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        dataPoints.push([i, j, matrix[i][j]]);
      }
    }

    const minVal = selectedCorrAlgo === 'pearson' || selectedCorrAlgo === 'spearman' || selectedCorrAlgo === 'kendall' ? -1 : 0;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        confine: true,
        appendToBody: false,
        hideDelay: 50,
        formatter: (params: any) => {
          const colX = cols[params.data[0]];
          const colY = cols[params.data[1]];
          const score = params.data[2];
          return `<b>${colX}</b> ↔ <b>${colY}</b><br/>Score (${selectedCorrAlgo.toUpperCase()}): <b>${score.toFixed(3)}</b><br/><span style="font-size:0.7rem;color:#94a3b8">Click to run pairwise deep-dive</span>`;
        }
      },
      grid: { left: '15%', right: '5%', bottom: '15%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        data: cols,
        splitArea: { show: true },
        axisLabel: { color: '#aaa', rotate: 35, fontSize: 10 }
      },
      yAxis: {
        type: 'category',
        data: cols,
        splitArea: { show: true },
        axisLabel: { color: '#aaa', fontSize: 10 }
      },
      visualMap: {
        min: minVal,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        textStyle: { color: '#aaa', fontSize: 10 },
        inRange: {
          color: minVal < 0 
            ? ['#312e81', '#1e3a8a', '#0f172a', '#0284c7', '#00f2fe', '#34d399'] 
            : ['#0f172a', '#1e1b4b', '#4338ca', '#00f2fe', '#34d399']
        }
      },
      series: [{
        name: selectedCorrAlgo.toUpperCase(),
        type: 'heatmap',
        data: dataPoints,
        label: {
          show: cols.length <= 10,
          formatter: (p: any) => p.data[2].toFixed(2),
          color: '#fff',
          fontSize: 9
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 242, 254, 0.5)',
            borderColor: '#00f2fe',
            borderWidth: 1
          }
        }
      }]
    };
  };

  const getPairScatterOption = () => {
    if (!pairDiag || !pairDiag.scatter_points) return {};
    return {
      backgroundColor: 'transparent',
      tooltip: {
        confine: true,
        appendToBody: false,
        formatter: (params: any) => `${pairDiag.col_a}: ${params.value[0].toFixed(2)}<br/>${pairDiag.col_b}: ${params.value[1].toFixed(2)}`
      },
      grid: { left: '8%', right: '6%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value',
        name: pairDiag.col_a,
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      yAxis: {
        type: 'value',
        name: pairDiag.col_b,
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      series: [{
        name: 'Sensor Correlation Points',
        type: 'scatter',
        symbolSize: 6,
        data: pairDiag.scatter_points,
        itemStyle: { color: '#00f2fe' }
      }]
    };
  };

  const getRulChartOption = () => {
    if (!rulResult) return {};

    const actualPoints = rulResult.historical.map(h => [h.step, h.value]);
    const fittedPoints = rulResult.historical.filter(h => h.fitted !== null && h.fitted !== undefined).map(h => [h.step, h.fitted]);
    
    const lastHist = actualPoints[actualPoints.length - 1] || [0, 0];
    const forecastPoints = [[lastHist[0], lastHist[1]], ...rulResult.forecast.map(f => [f.step, f.projected])];

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        confine: true,
        appendToBody: false
      },
      legend: {
        data: ['Historical Sensor Data', 'Fitted Degradation Baseline', 'Prognostic Forecast Horizon'],
        textStyle: { color: '#ccc', fontSize: 11 },
        top: 2
      },
      grid: { left: '4%', right: '5%', bottom: '12%', top: '12%', containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Time Steps / Operating Cycles',
        nameLocation: 'middle',
        nameGap: 26,
        axisLabel: { color: '#aaa', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } }
      },
      yAxis: {
        type: 'value',
        name: `${rulResult.target_col} Value`,
        axisLabel: { color: '#aaa', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.08)' } }
      },
      series: [
        {
          name: 'Historical Sensor Data',
          type: 'line',
          data: actualPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#00f2fe', width: 2 },
          markLine: {
            symbol: 'none',
            data: [
              {
                yAxis: rulResult.threshold,
                lineStyle: { color: '#f43f5e', type: 'dashed', width: 2 },
                label: {
                  formatter: `CRITICAL THRESHOLD: ${rulResult.threshold}`,
                  position: 'insideEndTop',
                  color: '#f43f5e',
                  fontWeight: 700
                }
              }
            ]
          }
        },
        {
          name: 'Fitted Degradation Baseline',
          type: 'line',
          data: fittedPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#818cf8', type: 'dotted', width: 1.5 }
        },
        {
          name: 'Prognostic Forecast Horizon',
          type: 'line',
          data: forecastPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#fbbf24', type: 'dashed', width: 2.5 }
        }
      ]
    };
  };

  const getMLPredictionsChartOption = () => {
    if (!mlResult) return {};
    const { indices, actual, random_forest, xgboost, lightgbm, svr, elastic_net, mlp, test_split_x } = mlResult.plot_data;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        confine: true,
        appendToBody: false
      },
      legend: {
        data: [
          'Actual Sensor Trajectory',
          'Random Forest Prediction',
          'XGBoost Prediction',
          'LightGBM Prediction',
          ...(svr ? ['SVR Prediction'] : []),
          ...(elastic_net ? ['ElasticNet Prediction'] : []),
          ...(mlp ? ['MLP Neural Net Prediction'] : [])
        ],
        textStyle: { color: '#ccc', fontSize: 11 },
        top: 2
      },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'all', xAxisIndex: 'all', title: { zoom: 'Area Zoom (X+Y)', back: 'Restore Zoom' } },
          restore: { title: 'Reset View' }
        },
        iconStyle: { borderColor: '#00f2fe' },
        right: '4%',
        top: 2
      },
      grid: { left: '4%', right: '5%', bottom: '15%', top: '14%', containLabel: true },
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
        type: 'category',
        data: indices,
        name: 'Time Index',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      yAxis: {
        type: 'value',
        name: `Predicted (${mlResult.target_col})`,
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      series: [
        {
          name: 'Actual Sensor Trajectory',
          type: 'line',
          data: actual,
          lineStyle: { width: 3, color: '#f8fafc' },
          itemStyle: { color: '#f8fafc' },
          smooth: true,
          symbol: 'none',
          markLine: test_split_x > 0 ? {
            symbol: 'none',
            data: [{ xAxis: test_split_x, label: { formatter: 'Test Split Start', color: '#fbbf24' } }],
            lineStyle: { color: '#fbbf24', type: 'dashed', width: 2 }
          } : undefined
        },
        {
          name: 'Random Forest Prediction',
          type: 'line',
          data: random_forest,
          lineStyle: { width: 2, color: '#38bdf8', type: 'solid' },
          itemStyle: { color: '#38bdf8' },
          smooth: true,
          symbol: 'none'
        },
        {
          name: 'XGBoost Prediction',
          type: 'line',
          data: xgboost,
          lineStyle: { width: 2, color: '#a855f7', type: 'solid' },
          itemStyle: { color: '#a855f7' },
          smooth: true,
          symbol: 'none'
        },
        {
          name: 'LightGBM Prediction',
          type: 'line',
          data: lightgbm,
          lineStyle: { width: 2, color: '#34d399', type: 'solid' },
          itemStyle: { color: '#34d399' },
          smooth: true,
          symbol: 'none'
        },
        ...(svr ? [{
          name: 'SVR Prediction',
          type: 'line',
          data: svr,
          lineStyle: { width: 2, color: '#f59e0b', type: 'dashed' },
          itemStyle: { color: '#f59e0b' },
          smooth: true,
          symbol: 'none'
        }] : []),
        ...(elastic_net ? [{
          name: 'ElasticNet Prediction',
          type: 'line',
          data: elastic_net,
          lineStyle: { width: 2, color: '#ec4899', type: 'dashed' },
          itemStyle: { color: '#ec4899' },
          smooth: true,
          symbol: 'none'
        }] : []),
        ...(mlp ? [{
          name: 'MLP Neural Net Prediction',
          type: 'line',
          data: mlp,
          lineStyle: { width: 2, color: '#8b5cf6', type: 'dashed' },
          itemStyle: { color: '#8b5cf6' },
          smooth: true,
          symbol: 'none'
        }] : [])
      ]
    };
  };

  const getFeatureImportanceOption = () => {
    if (!mlResult || !mlResult.feature_importance_ranking) return {};
    const items = [...mlResult.feature_importance_ranking].reverse();
    const categories = items.map(i => i.feature);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const item = items[params[0].dataIndex];
          return `<b>${item.feature}</b><br/>Overall Avg: <b>${item.importance}%</b><br/>RF: ${item.rf}% | XGB: ${item.xgb}% | LGBM: ${item.lgb}%`;
        }
      },
      grid: { left: '20%', right: '8%', bottom: '8%', top: '8%', containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Importance %',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: '#e2e8f0', fontSize: 11 }
      },
      series: [{
        name: 'Feature Importance',
        type: 'bar',
        data: items.map(i => i.importance),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#6366f1' },
              { offset: 1, color: '#00f2fe' }
            ]
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          color: '#aaa',
          fontSize: 10
        }
      }]
    };
  };

  return (
    <div className="analytics-layout">
      {/* Top Header Controls */}
      <header className="analytics-header">
        <div className="analytics-header-left">
          <div className="analytics-title-row">
            <Cpu size={22} className="text-accent-cyan" />
            <h2>Analytics & ML Studio</h2>
          </div>
          <p className="analytics-subtitle">
            Explore 5 correlation algorithms to align with your data behavior, or train XGBoost, LightGBM, and Random Forest models on sensor features.
          </p>
        </div>

        <div className="analytics-header-right">
          <div className="multi-run-selector-container" ref={dropdownRef}>
            <div 
              className={`multi-run-trigger ${isRunSelectorOpen ? 'open' : ''}`}
              onClick={() => setIsRunSelectorOpen(!isRunSelectorOpen)}
              title="Click to select single or multiple test runs to pool"
            >
              <div className="trigger-icon-pill">
                <Layers size={14} className="text-accent-cyan" />
              </div>
              <div className="trigger-text-group">
                <span className="run-select-label">Active Runs:</span>
                <span className="trigger-value">
                  {selectedFileIds.length === 0 ? (
                    <span className="text-red-400">None selected</span>
                  ) : selectedFileIds.length === 1 ? (
                    files.find(f => f.id === selectedFileIds[0])?.name || '1 Run'
                  ) : (
                    `${selectedFileIds.length} Runs Pooled`
                  )}
                </span>
              </div>
              {selectedFileIds.length > 0 && (
                <span className="run-count-badge">{selectedFileIds.length}</span>
              )}
              <ChevronDown size={14} className={`trigger-chevron ${isRunSelectorOpen ? 'rotated' : ''}`} />
            </div>

            {isRunSelectorOpen && (
              <div className="multi-run-popover">
                <div className="popover-search-row">
                  <Filter size={13} className="text-muted" />
                  <input
                    type="text"
                    placeholder="Search test runs..."
                    value={runSearchQuery}
                    onChange={(e) => setRunSearchQuery(e.target.value)}
                    className="popover-search-input"
                    autoFocus
                  />
                  {runSearchQuery && (
                    <button onClick={() => setRunSearchQuery('')} className="btn-icon-ghost">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="popover-quick-actions">
                  <button 
                    onClick={handleSelectUsefulOnly}
                    className="popover-action-btn useful-btn"
                    title="Select all test runs tagged as useful"
                  >
                    <Star size={11} className="text-amber-400" />
                    <span>Useful Only</span>
                  </button>
                  <button 
                    onClick={() => setSelectedFileIds(files.map(f => f.id))}
                    className="popover-action-btn"
                  >
                    Select All ({files.length})
                  </button>
                  <button 
                    onClick={() => setSelectedFileIds([])}
                    className="popover-action-btn"
                  >
                    Clear
                  </button>
                </div>

                <div className="popover-runs-list">
                  {filteredFiles.length === 0 ? (
                    <div className="popover-empty-notice">No test runs match query</div>
                  ) : (
                    filteredFiles.map(file => {
                      const isSelected = selectedFileIds.includes(file.id);
                      const isUseful = file.tag === 'useful' || file.name.toLowerCase().includes('useful');
                      return (
                        <label 
                          key={file.id} 
                          className={`run-select-item ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFileSelection(file.id)}
                            className="checkbox-custom"
                          />
                          <div className="run-item-info">
                            <div className="run-item-name-row">
                              <span className="run-item-name" title={file.name}>{file.name}</span>
                              {isUseful && (
                                <span className="tag-chip useful-chip" title="Tagged as useful run">
                                  <Star size={9} /> Useful
                                </span>
                              )}
                            </div>
                            <div className="run-item-meta">
                              <span>{file.columns.length} channels</span>
                              {file.rowCount && <span> · {file.rowCount.toLocaleString()} rows</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="popover-footer">
                  <div className="popover-summary">
                    <span className="summary-count"><b>{selectedFileIds.length}</b> of {files.length} selected</span>
                    <span className="summary-channels"><b>{numericColumns.length}</b> common channels</span>
                  </div>
                  <button
                    onClick={() => setIsRunSelectorOpen(false)}
                    className="btn-tiny btn-popover-done"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="analytics-tab-buttons">
            <button
              onClick={() => setActiveTab('correlation')}
              className={`analytics-tab-btn ${activeTab === 'correlation' ? 'active' : ''}`}
            >
              <Network size={14} />
              <span>Correlation Explorer</span>
            </button>
            <button
              onClick={() => setActiveTab('ml')}
              className={`analytics-tab-btn ${activeTab === 'ml' ? 'active' : ''}`}
            >
              <Cpu size={14} />
              <span>ML Model Studio</span>
            </button>
            <button
              onClick={() => setActiveTab('rul')}
              className={`analytics-tab-btn ${activeTab === 'rul' ? 'active' : ''}`}
            >
              <Activity size={14} />
              <span>RUL Prognostics Studio</span>
            </button>
          </div>
        </div>
      </header>

      {/* SUB-VIEW 1: CORRELATION ALGORITHMS EXPLORER */}
      {activeTab === 'correlation' && (
        <div className="analytics-body-grid">
          {/* Left Controls & Channel Selector */}
          <aside className="analytics-sidebar">
            {/* 1. Target Objective Card */}
            <div className="target-objective-card">
              <div className="target-header-row">
                <div className="target-label-group">
                  <Target size={15} className="text-accent-cyan" />
                  <span className="target-label-text">1. Target Variable</span>
                </div>
                {targetVariable && (
                  <span className="target-badge-pill">Objective</span>
                )}
              </div>
              <div className="target-select-wrapper">
                <select
                  value={targetVariable}
                  onChange={(e) => {
                    const newTarget = e.target.value;
                    setTargetVariable(newTarget);
                    if (corrData && newTarget) {
                      handleFetchCorrelations(undefined, newTarget);
                    }
                  }}
                  className="target-channel-select"
                >
                  <option value="">-- No Target (General Discovery) --</option>
                  {availableNumericColumns.map(col => (
                    <option key={col} value={col}>🎯 {col}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="target-select-chevron" />
              </div>
              <p className="target-card-caption">
                {targetVariable ? (
                  <>Ranks which sensors are the strongest predictive drivers of <b>{targetVariable}</b>.</>
                ) : (
                  'Select a target metric/sensor to evaluate driver impacts and bridge to ML Studio.'
                )}
              </p>
            </div>

            <div className="sidebar-divider" />

            <div className="sidebar-section-header">
              <span className="section-title">2. Algorithm Selector</span>
              <span className="section-hint">Compare mathematical behaviors</span>
            </div>

            <div className="corr-algo-pills">
              {[
                { id: 'pearson', label: 'Pearson (r)', desc: 'Linear standard' },
                { id: 'spearman', label: 'Spearman (ρ)', desc: 'Monotonic curves' },
                { id: 'kendall', label: 'Kendall (τ)', desc: 'Concordant pairs' },
                { id: 'fastdtw', label: 'FastDTW', desc: 'Phase/lag robust' },
                { id: 'mutual_info', label: 'Mutual Info', desc: 'Non-linear dependencies' }
              ].map(algo => (
                <button
                  key={algo.id}
                  onClick={() => setSelectedCorrAlgo(algo.id as any)}
                  className={`algo-pill-btn ${selectedCorrAlgo === algo.id ? 'active' : ''}`}
                >
                  <div className="algo-pill-top">
                    <span className="algo-label">{algo.label}</span>
                    {selectedCorrAlgo === algo.id && <span className="algo-active-dot" />}
                  </div>
                  <span className="algo-desc">{algo.desc}</span>
                </button>
              ))}
            </div>

            <div className="sidebar-divider" />

            <div className="sidebar-section-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}>
                <span className="section-title">3. Select Sensors ({selectedCorrChannels.length}/{availableNumericColumns.length} active)</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsExcludedModalOpen(true);
                    setExcludedSearchQuery('');
                  }}
                  className={`btn-excluded-channels-trigger ${excludedSensors.length > 0 ? 'has-excluded' : ''}`}
                  title="Open interactive window to add or remove excluded channels"
                >
                  <EyeOff size={11} />
                  <span>Excluded Channels</span>
                  {excludedSensors.length > 0 && (
                    <span className="excluded-count-badge">{excludedSensors.length}</span>
                  )}
                </button>
              </div>
              <div className="sidebar-quick-btns">
                <button 
                  onClick={handleSelectTop20}
                  className="btn-tiny"
                  disabled={availableNumericColumns.length === 0}
                  title={targetVariable ? `Select target and Top 19 drivers of ${targetVariable}` : "Select Top 20 sensors with highest correlation coupling"}
                >
                  Top 20 {targetVariable ? 'Drivers ★' : (corrData?.all_sensors_rankings?.[selectedCorrAlgo] || corrData?.feature_rankings?.[selectedCorrAlgo] ? '★' : '')}
                </button>
                <button 
                  onClick={() => setSelectedCorrChannels([])}
                  className="btn-tiny"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Sorting Toggles & Combine Sensors Action Bar */}
            <div className="channel-filter-toolbar">
              <div className="channel-sort-toggles">
                <button 
                  type="button"
                  onClick={() => setChannelSortMode('rank')}
                  className={`sort-pill-btn ${channelSortMode === 'rank' ? 'active' : ''}`}
                  title="Sort channels by algorithm coupling strength rank"
                >
                  <ArrowUpDown size={11} />
                  <span>By Rank</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setChannelSortMode('alpha')}
                  className={`sort-pill-btn ${channelSortMode === 'alpha' ? 'active' : ''}`}
                  title="Sort channels alphabetically"
                >
                  <span>A-Z</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsFeatureStudioOpen(true);
                    setFeatStudioError(null);
                    setFeatStudioSuccess(null);
                  }}
                  className="btn-combine-sensors"
                  style={{ borderColor: 'rgba(0, 242, 254, 0.35)', color: '#00f2fe' }}
                  title="Construct engineered features (RMS, derivatives, differentials, ratios, non-linear transforms)"
                  disabled={availableNumericColumns.length < 1}
                >
                  <Wrench size={11} />
                  <span>Feature Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCompositeSources([]);
                    setCompositeError(null);
                    setCompositeSuccessMsg(null);
                    setIsCombineModalOpen(true);
                  }}
                  className="btn-combine-sensors"
                  title="Combine redundant sensors into a single synthetic channel via PCA or Normalized Average"
                  disabled={availableNumericColumns.length < 2}
                >
                  <Combine size={11} />
                  <span>PCA / Merge</span>
                </button>
              </div>
            </div>

            {selectedFileIds.length === 0 ? (
              <div className="analytics-error-card" style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}>
                <AlertTriangle size={14} />
                <span>No test runs selected. Please select at least 1 test run from the dropdown above.</span>
              </div>
            ) : availableNumericColumns.length === 0 ? (
              <div className="analytics-error-card" style={{ background: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
                <AlertTriangle size={14} />
                <span>No available numeric channels found across selected test runs.</span>
              </div>
            ) : (
              <div className="corr-channels-scroll">
                {displayChannels.map(colName => {
                  const isChecked = selectedCorrChannels.includes(colName);
                  const rankInfo = activeRankings[colName];
                  return (
                    <div key={colName} className="channel-item-row channel-selection-item">
                      <label className="corr-channel-item" style={{ flex: 1, margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCorrChannels(selectedCorrChannels.filter(c => c !== colName));
                            } else {
                              setSelectedCorrChannels([...selectedCorrChannels, colName]);
                            }
                          }}
                          className="checkbox-custom"
                        />
                        <span className="channel-item-label" title={colName}>{colName}</span>
                        {rankInfo && (
                          <span className="sensor-rank-pill" title={`Coupling score: ${rankInfo.score} under ${selectedCorrAlgo.toUpperCase()}`}>
                            #{rankInfo.rank}
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRuleOutSensor(colName)}
                        className="btn-rule-out-sensor"
                        title={`Rule out '${colName}' from correlation analysis`}
                      >
                        <EyeOff size={11} />
                        <span>Rule Out</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {corrError && (
              <div className="analytics-error-card">
                <AlertTriangle size={14} className="text-red-400" />
                <span>{corrError}</span>
              </div>
            )}

            <button
              onClick={() => handleFetchCorrelations()}
              disabled={isLoadingCorr || selectedCorrChannels.length < 2 || selectedFileIds.length === 0}
              className="btn btn-primary btn-run-benchmark"
            >
              {isLoadingCorr ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />}
              <span>Compute Correlation Matrix</span>
            </button>
          </aside>

          {/* Right Heatmap & Pair Deep-Dive Canvas */}
          <main className="analytics-main-stage">
            {corrData ? (
              <div className="corr-stage-container">
                {stageViewMode === 'tornado' ? (
                  corrData.target_col ? (
                    /* Target Drivers Tornado Impact Section */
                    <div className="tornado-chart-wrapper">
                      <div className="tornado-toolbar">
                        <div className="tornado-title-group">
                          <div className="tornado-title-row">
                            <Target size={18} className="text-accent-cyan" />
                            <span className="tornado-title">Predictive Drivers Impact</span>
                            <span className="tornado-target-chip">
                              <Target size={11} /> {corrData.target_col}
                            </span>
                          </div>
                          <span className="tornado-subtitle">
                            Features ranked by coupling magnitude under {selectedCorrAlgo.toUpperCase()}. Click any bar to diagnose pair.
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {/* Top 20 vs All Common Sensors Scope Toggle */}
                          <div className="sensor-scope-toggles">
                            <button
                              type="button"
                              className={`sensor-scope-btn ${sensorScope === 'top20' ? 'active' : ''}`}
                              onClick={() => setSensorScope('top20')}
                              title="Display top 20 predictive drivers sorted by active algorithm"
                            >
                              <Star size={11} />
                              <span>Top 20 Drivers</span>
                            </button>
                            <button
                              type="button"
                              className={`sensor-scope-btn ${sensorScope === 'all' ? 'active' : ''}`}
                              onClick={() => setSensorScope('all')}
                              title={`Display all common sensors (${corrData.all_common_columns?.length || activeDrivers.length}) sorted by active algorithm`}
                            >
                              <Layers size={11} />
                              <span>All Sensors ({corrData.all_common_columns?.length || activeDrivers.length})</span>
                            </button>
                          </div>

                          {/* Stage View Toggles */}
                          <div className="stage-view-toggles">
                            <button
                              type="button"
                              className="stage-view-btn active"
                              onClick={() => setStageViewMode('tornado')}
                              title="View horizontal tornado impact chart of drivers"
                            >
                              <BarChart3 size={12} />
                              <span>Target Drivers</span>
                            </button>
                            <button
                              type="button"
                              className="stage-view-btn"
                              onClick={() => setStageViewMode('heatmap')}
                              title="View full NxN correlation heatmap"
                            >
                              <Grid3X3 size={12} />
                              <span>Matrix</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleExportToML}
                            className="btn-send-to-ml"
                            title="Transfer target variable and top predictive drivers directly to ML Model Studio"
                          >
                            <Sparkles size={13} />
                            <span>Train ML Models 🚀</span>
                          </button>
                        </div>
                      </div>

                      <div className="tornado-canvas-container">
                        <ReactECharts
                          key="tornado-chart"
                          notMerge={true}
                          lazyUpdate={false}
                          option={getTargetTornadoOption()}
                          onEvents={{
                            click: (params: any) => {
                              if (params.name && corrData.target_col) {
                                handleInspectPair(params.name, corrData.target_col);
                                setDiagTab('pair');
                              }
                            }
                          }}
                          style={{ height: '100%', width: '100%' }}
                          theme="dark"
                        />
                      </div>

                      <div className="tornado-legend-bar">
                        <div className="legend-item">
                          <span className="legend-dot-pos" />
                          <span>Positive Coupling (Feature increases as Target increases)</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-dot-neg" />
                          <span>Inverse Coupling (Feature decreases as Target increases)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Target Empty Prompt */
                    <div className="target-empty-prompt">
                      <Target size={40} className="text-accent-cyan" style={{ opacity: 0.8 }} />
                      <h3>No Target Variable Selected</h3>
                      <p>
                        Select a target sensor/metric in Section 1 on the left to analyze and rank which common sensors are the strongest predictive drivers.
                      </p>
                      {numericColumns.length > 0 && (
                        <button
                          type="button"
                          className="btn-select-target-action"
                          onClick={() => {
                            const first = numericColumns[0];
                            setTargetVariable(first);
                            handleFetchCorrelations(undefined, first);
                          }}
                        >
                          <Target size={14} />
                          <span>Set '{numericColumns[0]}' as Target Variable</span>
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  /* Full Heatmap Section */
                  <div className="corr-heatmap-wrapper">
                    <div className="corr-stage-toolbar">
                      <div className="corr-toolbar-title-group">
                        <span className="corr-toolbar-title">
                          {selectedCorrAlgo.toUpperCase()} Matrix Benchmark ({corrData.columns.length} × {corrData.columns.length})
                        </span>
                        {corrData.total_runs && corrData.total_runs > 1 && (
                          <span className="pooled-runs-badge" title={`Cross-run correlation pooled from ${corrData.total_runs} test files`}>
                            <Layers size={11} />
                            <span>{corrData.total_runs} Runs Pooled ({corrData.total_samples?.toLocaleString()} samples)</span>
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="stage-view-toggles">
                          <button
                            type="button"
                            className="stage-view-btn"
                            onClick={() => setStageViewMode('tornado')}
                            title="View horizontal tornado impact chart of drivers"
                          >
                            <BarChart3 size={12} />
                            <span>Target Drivers</span>
                          </button>
                          <button
                            type="button"
                            className="stage-view-btn active"
                            onClick={() => setStageViewMode('heatmap')}
                            title="View full NxN correlation heatmap"
                          >
                            <Grid3X3 size={12} />
                            <span>Matrix</span>
                          </button>
                        </div>
                        <span className="corr-toolbar-hint">
                          Click any cell for pair diagnostic
                        </span>
                      </div>
                    </div>
                    <div className="corr-heatmap-chart">
                      <ReactECharts
                        key="heatmap-chart"
                        notMerge={true}
                        lazyUpdate={false}
                        option={getCorrelationHeatmapOption()}
                        onEvents={{
                          click: (params: any) => {
                            if (params.data && params.data.length >= 2) {
                              const cA = corrData.columns[params.data[0]];
                              const cB = corrData.columns[params.data[1]];
                              handleInspectPair(cA, cB);
                              setDiagTab('pair');
                            }
                          }
                        }}
                        style={{ height: '100%', width: '100%' }}
                        theme="dark"
                      />
                    </div>
                  </div>
                )}

                {/* Pairwise & Dataset-Wide Diagnostic Card */}
                <div className="corr-pair-deepdive-card">
                  <div className="deepdive-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} className="text-accent-cyan" />
                        <h4 style={{ margin: 0, fontSize: '0.96rem' }}>Correlation Diagnosis</h4>
                      </div>
                    </div>

                    {/* Mode Tabs: Global Dataset vs Single Pair */}
                    <div className="diag-mode-tabs">
                      <button
                        type="button"
                        className={`diag-tab-btn ${diagTab === 'global' ? 'active' : ''}`}
                        onClick={() => setDiagTab('global')}
                        title="Evaluate recommended algorithm across all common sensors"
                      >
                        <Award size={12} />
                        <span>🌐 Global (All Sensors)</span>
                      </button>
                      <button
                        type="button"
                        className={`diag-tab-btn ${diagTab === 'pair' ? 'active' : ''}`}
                        onClick={() => setDiagTab('pair')}
                        title="Inspect single sensor pair with scatter plot"
                      >
                        <Sparkles size={12} />
                        <span>🔍 Single Pair</span>
                      </button>
                    </div>
                  </div>

                  {diagTab === 'global' && corrData.global_diagnosis ? (
                    /* Global Dataset-Wide Recommendation */
                    <div className="global-diag-card">
                      <div className="global-champ-banner">
                        <div className="global-champ-badge-row">
                          <Award size={18} className="text-emerald-400" />
                          <span className="global-champ-title">{corrData.global_diagnosis.recommended_algorithm}</span>
                          <span className="global-champ-scope-badge">All Sensors</span>
                        </div>
                        <p className="global-champ-desc">{corrData.global_diagnosis.explanation}</p>
                      </div>

                      <div className="global-breakdown-card">
                        <span className="global-breakdown-title">Sensor Dynamics ({corrData.global_diagnosis.total_sensors_analyzed} Channels Evaluated)</span>
                        <div className="global-breakdown-grid">
                          <div className="breakdown-stat-item">
                            <span className="stat-item-label">Linear Proportional</span>
                            <span className="stat-item-val" style={{ color: '#38bdf8' }}>{corrData.global_diagnosis.breakdown.linear_pct}%</span>
                          </div>
                          <div className="breakdown-stat-item">
                            <span className="stat-item-label">Monotonic Curves</span>
                            <span className="stat-item-val" style={{ color: '#a78bfa' }}>{corrData.global_diagnosis.breakdown.monotonic_pct}%</span>
                          </div>
                          <div className="breakdown-stat-item">
                            <span className="stat-item-label">Complex Non-Linear</span>
                            <span className="stat-item-val" style={{ color: '#f43f5e' }}>{corrData.global_diagnosis.breakdown.complex_nonlinear_pct}%</span>
                          </div>
                          <div className="breakdown-stat-item">
                            <span className="stat-item-label">Phase / Time Shifted</span>
                            <span className="stat-item-val" style={{ color: '#fbbf24' }}>{corrData.global_diagnosis.breakdown.phase_lagged_pct}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="suitability-list-card">
                        <span className="global-breakdown-title">Algorithm Suitability Across Dataset</span>
                        {[
                          { key: 'pearson', label: 'Pearson (r)', val: corrData.global_diagnosis.suitability_scores.pearson, color: '#38bdf8' },
                          { key: 'spearman', label: 'Spearman (ρ)', val: corrData.global_diagnosis.suitability_scores.spearman, color: '#a78bfa' },
                          { key: 'kendall', label: 'Kendall (τ)', val: corrData.global_diagnosis.suitability_scores.kendall, color: '#818cf8' },
                          { key: 'fastdtw', label: 'FastDTW', val: corrData.global_diagnosis.suitability_scores.fastdtw, color: '#fbbf24' },
                          { key: 'mutual_info', label: 'Mutual Info', val: corrData.global_diagnosis.suitability_scores.mutual_info, color: '#f43f5e' }
                        ].map(item => (
                          <div key={item.key} className="suitability-item">
                            <div className="suitability-item-header">
                              <span>{item.label}</span>
                              <b>{item.val}%</b>
                            </div>
                            <div className="suitability-bar-track">
                              <div
                                className="suitability-bar-fill"
                                style={{ width: `${item.val}%`, background: item.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Single Pair Deep-Dive */
                    isLoadingPair ? (
                      <div className="deepdive-loading">
                        <RefreshCw className="animate-spin text-accent-cyan" size={24} />
                        <span>{selectedPair ? `Diagnosing ${selectedPair.col_a} vs ${selectedPair.col_b}...` : 'Diagnosing sensor coupling...'}</span>
                      </div>
                    ) : pairDiag ? (
                      <div className="deepdive-content">
                        <div className="pair-names-badge">
                          <span className="pair-col-name">{pairDiag.col_a}</span>
                          <span className="text-muted">↔</span>
                          <span className="pair-col-name">{pairDiag.col_b}</span>
                          {pairDiag.total_runs && pairDiag.total_runs > 1 && (
                            <span className="pair-runs-chip" title={`Sample points pooled across ${pairDiag.total_runs} test runs`}>
                              <Layers size={10} /> {pairDiag.total_runs} runs
                            </span>
                          )}
                        </div>

                        {/* Recommender Alert Box */}
                        <div className="recommender-banner">
                          <div className="recommender-title-row">
                            <Award size={15} className="text-emerald-400" />
                            <span className="recommender-title">Recommended: <b>{pairDiag.recommended_algorithm}</b></span>
                          </div>
                          <p className="recommender-desc">{pairDiag.explanation}</p>
                        </div>

                        {/* Scores Comparison Table */}
                        <div className="scores-compare-grid">
                          <div className="score-item">
                            <span className="score-algo">Pearson (r)</span>
                            <span className="score-val">{pairDiag.scores.pearson.toFixed(3)}</span>
                          </div>
                          <div className="score-item">
                            <span className="score-algo">Spearman (ρ)</span>
                            <span className="score-val">{pairDiag.scores.spearman.toFixed(3)}</span>
                          </div>
                          <div className="score-item">
                            <span className="score-algo">Kendall (τ)</span>
                            <span className="score-val">{pairDiag.scores.kendall.toFixed(3)}</span>
                          </div>
                          <div className="score-item">
                            <span className="score-algo">FastDTW</span>
                            <span className="score-val">{pairDiag.scores.fastdtw.toFixed(3)}</span>
                          </div>
                          <div className="score-item">
                            <span className="score-algo">Mutual Info</span>
                            <span className="score-val">{pairDiag.scores.mutual_info.toFixed(3)}</span>
                          </div>
                        </div>

                        {/* Scatter Plot */}
                        <div className="pair-scatter-box">
                          <ReactECharts
                            option={getPairScatterOption()}
                            style={{ height: '180px', width: '100%' }}
                            theme="dark"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="deepdive-empty">
                        <HelpCircle size={32} className="text-muted" />
                        <span>Click any driver bar or matrix cell to diagnose single sensor interaction</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="analytics-empty-state">
                <Network size={54} className="text-accent-cyan" style={{ opacity: 0.7 }} />
                <h3>Correlation Matrix Not Generated</h3>
                <p>Select sensor channels on the left and click <b>Compute Correlation Matrix</b> to evaluate Pearson, Spearman, Kendall, DTW, and Mutual Information.</p>
                <button
                  onClick={() => handleFetchCorrelations()}
                  disabled={isLoadingCorr || selectedCorrChannels.length < 2 || selectedFileIds.length === 0}
                  className="btn btn-primary btn-run-benchmark"
                  style={{ marginTop: '14px', padding: '12px 28px', fontSize: '0.98rem' }}
                >
                  {isLoadingCorr ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                  <span>Compute Correlation Matrix Now</span>
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* SUB-VIEW 2: ML MODEL PREDICTION STUDIO */}
      {activeTab === 'ml' && (
        <div className="analytics-body-grid">
          {/* Left ML Config Sidebar */}
          <aside className="analytics-sidebar">
            <div className="sidebar-section-header">
              <span className="section-title">1. Target Variable (Output y)</span>
              <span className="section-hint">{numericColumns.length} common</span>
            </div>

            {selectedFileIds.length === 0 ? (
              <div className="analytics-error-card" style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}>
                <AlertTriangle size={14} />
                <span>No test runs selected. Please select runs from the dropdown above.</span>
              </div>
            ) : numericColumns.length === 0 ? (
              <div className="analytics-error-card" style={{ background: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
                <AlertTriangle size={14} />
                <span>No common numeric channels found across selected test runs.</span>
              </div>
            ) : (
              <select
                value={targetVariable}
                onChange={(e) => {
                  const newTarget = e.target.value;
                  setTargetVariable(newTarget);
                  setFeatureSensors(featureSensors.filter(f => f !== newTarget));
                }}
                className="field-select"
              >
                {numericColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            )}

            <div className="sidebar-divider" />

            <div className="sidebar-section-header">
              <span className="section-title">2. Feature Sensors (Inputs X)</span>
              <div className="sidebar-quick-btns">
                <button
                  onClick={() => setFeatureSensors(numericColumns.filter(c => c !== targetVariable))}
                  className="btn-tiny"
                  disabled={numericColumns.length === 0}
                >
                  All Features
                </button>
                <button
                  onClick={() => setFeatureSensors([])}
                  className="btn-tiny"
                >
                  Clear
                </button>
              </div>
            </div>

            {numericColumns.length > 0 && (
              <div className="corr-channels-scroll" style={{ maxHeight: '200px' }}>
                {numericColumns.filter(c => c !== targetVariable).map(colName => {
                  const isChecked = featureSensors.includes(colName);
                  return (
                    <label key={colName} className="corr-channel-item">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setFeatureSensors(featureSensors.filter(f => f !== colName));
                          } else {
                            setFeatureSensors([...featureSensors, colName]);
                          }
                        }}
                        className="checkbox-custom"
                      />
                      <span className="channel-item-label" title={colName}>{colName}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="sidebar-divider" />

            <div className="sidebar-section-header">
              <span className="section-title">3. Train/Test Split</span>
              <span className="text-accent-cyan font-bold">{Math.round((1 - splitRatio) * 100)}% Train / {Math.round(splitRatio * 100)}% Test</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.4"
              step="0.05"
              value={splitRatio}
              onChange={(e) => setSplitRatio(parseFloat(e.target.value))}
              className="range-input"
            />

            {mlError && (
              <div className="analytics-error-card">
                <AlertTriangle size={14} className="text-red-400" />
                <span>{mlError}</span>
              </div>
            )}

            <button
              onClick={handleTrainMLModels}
              disabled={isTrainingML || !targetVariable || featureSensors.length === 0 || selectedFileIds.length === 0}
              className="btn btn-primary btn-run-benchmark"
            >
              {isTrainingML ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />}
              <span>Train & Compare Models</span>
            </button>
          </aside>

          {/* Right ML Predictions Stage */}
          <main className="analytics-main-stage">
            {mlResult ? (
              <div className="ml-stage-content">
                {/* Multi-Run Pooling Banner */}
                {mlResult.total_runs && mlResult.total_runs > 1 && (
                  <div className="ml-multi-run-banner">
                    <Layers size={16} className="text-accent-cyan" />
                    <span>Cross-Run Machine Learning: Models trained and evaluated on <b>{mlResult.total_runs} pooled test runs</b> ({mlResult.total_samples?.toLocaleString()} combined rows)</span>
                  </div>
                )}

                {/* Model Comparison Leaderboard */}
                <div className="ml-leaderboard-grid">
                  {mlResult.leaderboard.map((model) => (
                    <div 
                      key={model.key} 
                      className={`ml-leaderboard-card ${model.is_champion ? 'champion' : ''}`}
                    >
                      <div className="card-top">
                        <span className="model-name">{model.name}</span>
                        {model.is_champion && (
                          <span className="champion-badge">
                            <Award size={12} />
                            <span>BEST MODEL</span>
                          </span>
                        )}
                      </div>
                      <div className="model-metrics-row">
                        <div className="metric-box">
                          <span className="metric-label">R² Score</span>
                          <span className="metric-val highlight">{(model.r2 * 100).toFixed(1)}%</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-label">RMSE</span>
                          <span className="metric-val">{model.rmse.toFixed(2)}</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-label">MAE</span>
                          <span className="metric-val">{model.mae.toFixed(2)}</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-label">Train Time</span>
                          <span className="metric-val">{model.train_time_ms} ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actual vs Predicted Time-Series Curve */}
                <div className="ml-chart-container">
                  <div className="chart-header-row">
                    <span className="chart-title">
                      Sensor Trajectory: Actual vs Predicted ({mlResult.target_col})
                    </span>
                    <span className="chart-hint">
                      Zoom in on X and Y scales using sliders or rectangular area drag
                    </span>
                  </div>
                  <div className="ml-chart-canvas">
                    <ReactECharts
                      option={getMLPredictionsChartOption()}
                      style={{ height: '100%', width: '100%' }}
                      theme="dark"
                    />
                  </div>
                </div>

                {/* Feature Importance Section */}
                <div className="ml-features-container">
                  <div className="chart-header-row">
                    <span className="chart-title">
                      Feature Importance Rankings (Top Driving Sensors)
                    </span>
                  </div>
                  <div className="features-chart-canvas">
                    <ReactECharts
                      option={getFeatureImportanceOption()}
                      style={{ height: '220px', width: '100%' }}
                      theme="dark"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="analytics-empty-state">
                <Cpu size={54} className="text-accent-cyan" style={{ opacity: 0.7 }} />
                <h3>No ML Models Trained Yet</h3>
                <p>Select your target sensor variable and input features on the left, then click <b>Train & Compare Models</b> to benchmark Random Forest, XGBoost, and LightGBM.</p>
                <button
                  onClick={handleTrainMLModels}
                  disabled={isTrainingML || !targetVariable || featureSensors.length === 0}
                  className="btn btn-primary btn-run-benchmark"
                  style={{ marginTop: '14px', padding: '12px 28px', fontSize: '0.98rem' }}
                >
                  {isTrainingML ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                  <span>Train & Compare ML Models Now</span>
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REMAINING USEFUL LIFE (RUL) PROGNOSTICS STUDIO                     */}
      {/* ========================================================================= */}
      {activeTab === 'rul' && (
        <div className="analytics-body-grid">
          {/* Left Controls & Parameters Sidebar */}
          <aside className="analytics-sidebar">
            {/* 1. Degradation Indicator Target Card */}
            <div className="target-objective-card">
              <div className="target-header-row">
                <div className="target-label-group">
                  <Target size={14} className="text-accent-cyan" />
                  <span className="target-label-text">1. Degradation Target</span>
                </div>
                <span className="target-badge-pill">INDICATOR</span>
              </div>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '2px 0 6px 0' }}>
                Select sensor indicating component wear, thermal stress, or degradation.
              </p>
              <select
                value={rulTarget}
                onChange={(e) => setRulTarget(e.target.value)}
                className="target-select-dropdown"
              >
                <option value="">Select Sensor Indicator...</option>
                {availableNumericColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* 2. Operational Failure Limit */}
            <div className="sidebar-section-card">
              <span className="section-title">2. Operational Limits</span>
              <p className="section-hint" style={{ marginBottom: '8px' }}>
                Specify if defect causes sensor to climb or decay toward limit.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setRulDirection('increasing')}
                  className={`btn-toggle ${rulDirection === 'increasing' ? 'active' : ''}`}
                  style={{ fontSize: '0.76rem', padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                >
                  <TrendingUp size={13} className="text-red-400" />
                  <span>Increasing (Wear)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRulDirection('decreasing')}
                  className={`btn-toggle ${rulDirection === 'decreasing' ? 'active' : ''}`}
                  style={{ fontSize: '0.76rem', padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                >
                  <Activity size={13} className="text-cyan-400" />
                  <span>Decreasing (Flow)</span>
                </button>
              </div>

              <label className="field-label" style={{ fontSize: '0.76rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
                Failure Boundary Threshold
              </label>
              <input
                type="number"
                step="any"
                value={rulThreshold}
                onChange={(e) => setRulThreshold(parseFloat(e.target.value) || 0)}
                className="field-input"
                placeholder="e.g. 95.0"
              />
            </div>

            {/* 3. Mathematical Extrapolation Model */}
            <div className="sidebar-section-card">
              <span className="section-title">3. Prognostic Model</span>
              <p className="section-hint" style={{ marginBottom: '8px' }}>
                Curve fitting algorithm for future horizon extrapolation.
              </p>
              <select
                value={rulModelType}
                onChange={(e) => setRulModelType(e.target.value as any)}
                className="field-select"
              >
                <option value="exponential">Exponential Degradation (Scipy curve_fit)</option>
                <option value="polynomial">Polynomial Quadratic Extrapolation</option>
                <option value="linear">Linear Trend Projection</option>
              </select>
            </div>

            {rulError && (
              <div className="analytics-error-card">
                <AlertTriangle size={14} className="text-red-400" />
                <span>{rulError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleRunRULPrognosis}
              disabled={isLoadingRUL || !rulTarget}
              className="btn btn-primary btn-run-benchmark"
            >
              {isLoadingRUL ? <RefreshCw className="animate-spin" size={15} /> : <Play size={15} />}
              <span>Estimate Remaining Useful Life</span>
            </button>

            {/* Quick Concept & Threshold Guide Card */}
            <div className="rul-concept-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00f2fe', fontWeight: 700, fontSize: '0.78rem' }}>
                <HelpCircle size={14} />
                <span>How RUL Prognostics Works</span>
              </div>
              <p style={{ fontSize: '0.73rem', color: '#94a3b8', lineHeight: 1.45, margin: 0 }}>
                Fits mathematical degradation curves to your telemetry to extrapolate the future operating cycle where the signal intersects the critical failure threshold limit.
              </p>
            </div>
          </aside>

          {/* Right Main Stage */}
          <main className="analytics-main-stage">
            {/* Top KPI Cards Row */}
            <div className="rul-kpis-wrapper">
              <div className="rul-kpi-card">
                <div className="rul-kpi-label">
                  <Clock size={14} /> Remaining Useful Life
                </div>
                <div className="rul-kpi-value" style={{ color: rulResult ? (rulResult.operating_state === 'CRITICAL' ? '#f43f5e' : rulResult.operating_state === 'WARNING' ? '#fbbf24' : '#34d399') : '#94a3b8' }}>
                  {rulResult ? (rulResult.rul_samples !== null ? `${Math.round(rulResult.rul_samples)}` : rulResult.rul_str) : '--'}
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, marginLeft: '6px', color: '#94a3b8' }}>
                    {rulResult?.rul_samples !== null ? 'cycles / pts' : ''}
                  </span>
                </div>
                {rulResult && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {rulResult.rul_samples !== null 
                      ? `Expected failure at cycle #${Math.round(rulResult.historical.length + rulResult.rul_samples)}`
                      : rulResult.rul_str}
                  </div>
                )}
              </div>

              <div className="rul-kpi-card">
                <div className="rul-kpi-label">
                  <Gauge size={14} /> Current Health Index
                </div>
                <div className="rul-kpi-value" style={{ color: rulResult ? (rulResult.health_index_pct > 60 ? '#34d399' : rulResult.health_index_pct > 30 ? '#fbbf24' : '#f43f5e') : '#94a3b8' }}>
                  {rulResult ? `${rulResult.health_index_pct.toFixed(1)}%` : '--'}
                </div>
                {rulResult && (
                  <span className={`rul-kpi-status-badge ${rulResult.operating_state === 'HEALTHY' ? 'rul-status-healthy' : rulResult.operating_state === 'WARNING' ? 'rul-status-warning' : 'rul-status-critical'}`}>
                    {rulResult.operating_state === 'HEALTHY' ? 'NORMAL OPERATION' : rulResult.operating_state === 'WARNING' ? 'DEGRADATION WARNING' : 'CRITICAL FAULT IMMINENT'}
                  </span>
                )}
              </div>

              <div className="rul-kpi-card">
                <div className="rul-kpi-label">
                  <Activity size={14} /> Current vs Limit Margin
                </div>
                <div className="rul-kpi-value">
                  {rulResult ? rulResult.current_val.toFixed(2) : '--'}
                </div>
                {rulResult && (
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Limit: {rulResult.threshold.toFixed(2)} (Margin: {Math.abs(rulResult.threshold - rulResult.current_val).toFixed(2)})
                  </div>
                )}
              </div>

              <div className="rul-kpi-card">
                <div className="rul-kpi-label">
                  <Sliders size={14} /> Model & Drift Velocity
                </div>
                <div className="rul-kpi-value" style={{ fontSize: '1.05rem', color: '#00f2fe' }}>
                  {rulResult ? rulResult.model_used.toUpperCase() : '--'}
                </div>
                {rulResult && (
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Rate: {rulResult.degradation_rate_100.toFixed(2)} units / 100 cycles
                  </div>
                )}
              </div>
            </div>

            {/* Trajectory Horizon Chart Card */}
            <div className="rul-chart-card">
              <div className="rul-chart-header">
                <div className="rul-chart-title">
                  <Activity size={16} className="text-accent-cyan" />
                  <span>Degradation Curve & Forward Prognostic Horizon</span>
                </div>
                {rulResult && (
                  <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                    <span><b style={{ color: '#00f2fe' }}>● Cyan</b>: Observed Telemetry</span>
                    <span><b style={{ color: '#818cf8' }}>┄ Purple</b>: Fitted Baseline</span>
                    <span><b style={{ color: '#fbbf24' }}>--- Gold</b>: Extrapolated Horizon</span>
                    <span><b style={{ color: '#f43f5e' }}>--- Red</b>: Failure Threshold ({rulResult.threshold})</span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: '440px', width: '100%' }}>
                {rulResult ? (
                  <ReactECharts
                    key="rul-chart"
                    notMerge={true}
                    lazyUpdate={false}
                    option={getRulChartOption()}
                    style={{ height: '100%', minHeight: '440px', width: '100%' }}
                    theme="dark"
                  />
                ) : (
                  <div className="analytics-empty-state" style={{ height: '100%', minHeight: '440px' }}>
                    <Clock size={52} className="text-accent-cyan" style={{ opacity: 0.6 }} />
                    <h3>No Prognostic Run Executed</h3>
                    <p>Select a degradation target sensor on the left, configure your operational failure limit, and click <b>Estimate Remaining Useful Life</b>.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Engineering Advisory Summary Panel */}
            {rulResult && (
              <div className="rul-advisory-card">
                <div className="advisory-title-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} className="text-accent-cyan" />
                    <span className="advisory-title">Engineering Advisory & Maintenance Plan</span>
                  </div>
                  <span className={`rul-kpi-status-badge ${rulResult.operating_state === 'HEALTHY' ? 'rul-status-healthy' : rulResult.operating_state === 'WARNING' ? 'rul-status-warning' : 'rul-status-critical'}`}>
                    {rulResult.operating_state}
                  </span>
                </div>
                <p className="advisory-desc">
                  {rulResult.operating_state === 'HEALTHY' && (
                    `Component health is at ${rulResult.health_index_pct.toFixed(1)}% with an estimated ${Math.round(rulResult.rul_samples || 0)} operating cycles remaining. Telemetry indicates stable behavior without alarming drift.`
                  )}
                  {rulResult.operating_state === 'WARNING' && (
                    `Accelerated degradation detected. Health index has dropped to ${rulResult.health_index_pct.toFixed(1)}%. It is recommended to schedule preventative component inspection within the next ${Math.round((rulResult.rul_samples || 0) * 0.6)} operating cycles.`
                  )}
                  {rulResult.operating_state === 'CRITICAL' && (
                    `CRITICAL FAULT IMMINENT: Remaining Useful Life is critically depleted (${Math.round(rulResult.rul_samples || 0)} cycles remaining, Health Index at ${rulResult.health_index_pct.toFixed(1)}%). Immediate maintenance or replacement is required to avoid system breakdown.`
                  )}
                </p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* MODAL: COMBINE SENSORS / MANUAL PCA */}
      {isCombineModalOpen && (
        <div className="composite-modal-backdrop" onClick={() => setIsCombineModalOpen(false)}>
          <div className="composite-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="composite-modal-header">
              <div className="modal-title-row">
                <Combine size={18} className="text-accent-cyan" />
                <h3>Combine Sensors (PCA & Averaging)</h3>
              </div>
              <button onClick={() => setIsCombineModalOpen(false)} className="btn-icon-ghost">
                <X size={16} />
              </button>
            </div>

            <div className="composite-modal-body">
              <p className="composite-hint-text">
                Compress redundant sensors into a single synthetic channel to eliminate collinearity in correlation analysis and stabilize ML model training.
              </p>

              {/* 1. Method Selection */}
              <div className="composite-field-group">
                <label className="field-label">1. Reduction Method</label>
                <div className="method-toggle-group">
                  <button
                    type="button"
                    onClick={() => setCompositeMethod('pca')}
                    className={`method-toggle-btn ${compositeMethod === 'pca' ? 'active' : ''}`}
                  >
                    <div className="method-top">
                      <span className="method-name">PCA (1st Principal Component)</span>
                      {compositeMethod === 'pca' && <span className="method-dot" />}
                    </div>
                    <span className="method-desc">Extracts the dominant eigenvector capturing maximum shared variance across transducers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompositeMethod('average')}
                    className={`method-toggle-btn ${compositeMethod === 'average' ? 'active' : ''}`}
                  >
                    <div className="method-top">
                      <span className="method-name">Z-Score Normalized Average</span>
                      {compositeMethod === 'average' && <span className="method-dot" />}
                    </div>
                    <span className="method-desc">Standardizes scale discrepancies then averages across channels to cancel uncorrelated noise</span>
                  </button>
                </div>
              </div>

              {/* 2. Channel Selection */}
              <div className="composite-field-group">
                <div className="source-select-header">
                  <label className="field-label">2. Select Redundant Channels ({compositeSources.length} selected)</label>
                  <div className="source-quick-actions">
                    <button
                      type="button"
                      onClick={() => setCompositeSources([])}
                      className="btn-tiny"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="composite-sources-scroll">
                  {numericColumns.map(col => {
                    const isChecked = compositeSources.includes(col);
                    return (
                      <label key={col} className="corr-channel-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setCompositeSources(compositeSources.filter(c => c !== col));
                            } else {
                              setCompositeSources([...compositeSources, col]);
                            }
                          }}
                          className="checkbox-custom"
                        />
                        <span className="channel-item-label" title={col}>{col}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 3. New Channel Name */}
              <div className="composite-field-group">
                <label className="field-label">3. Synthetic Sensor Name</label>
                <input
                  type="text"
                  value={compositeName}
                  onChange={(e) => setCompositeName(e.target.value)}
                  placeholder="e.g. PCA_Temp_Cluster"
                  className="field-input"
                />
              </div>

              {/* Auto-Exclude Merged Channels Option */}
              <div className="composite-field-group" style={{ marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={autoExcludePCA}
                    onChange={(e) => setAutoExcludePCA(e.target.checked)}
                    className="checkbox-custom"
                  />
                  <span>Auto-exclude merged source sensors from correlation & predictive driver analysis</span>
                </label>
              </div>

              {compositeError && (
                <div className="analytics-error-card">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span>{compositeError}</span>
                </div>
              )}

              {compositeSuccessMsg && (
                <div className="composite-success-card">
                  <Check size={16} className="text-emerald-400" />
                  <span>{compositeSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="composite-modal-footer">
              <button
                type="button"
                onClick={() => setIsCombineModalOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateComposite}
                disabled={isGeneratingComposite || compositeSources.length < 2 || !compositeName.trim()}
                className="btn btn-primary"
              >
                {isGeneratingComposite ? <RefreshCw className="animate-spin" size={14} /> : <Combine size={14} />}
                <span>Generate Composite Sensor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FEATURE EXTRACTION & CONSTRUCTION STUDIO */}
      {isFeatureStudioOpen && (
        <div className="feature-studio-overlay" onClick={() => setIsFeatureStudioOpen(false)}>
          <div className="feature-studio-modal" onClick={(e) => e.stopPropagation()}>
            <div className="composite-modal-header">
              <div className="modal-title-row">
                <Wrench size={18} className="text-accent-cyan" />
                <h3>Feature Extraction & Construction Studio</h3>
              </div>
              <button onClick={() => setIsFeatureStudioOpen(false)} className="btn-icon-ghost">
                <X size={16} />
              </button>
            </div>

            <div className="feature-studio-body">
              {/* Category tabs */}
              <div className="feature-category-nav">
                {[
                  { id: 'rolling', label: 'Rolling & Filtering' },
                  { id: 'derivatives', label: 'Derivatives & Dynamics' },
                  { id: 'arithmetic', label: 'Multi-Sensor Coupling' },
                  { id: 'transforms', label: 'Non-Linear & Statistical' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFeatCategory(cat.id as any)}
                    className={`category-nav-btn ${featCategory === cat.id ? 'active' : ''}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Operations selection grid */}
              <div className="op-cards-grid">
                {featCategory === 'rolling' && [
                  { id: 'rolling_rms', name: 'Rolling RMS', desc: 'Root Mean Square: captures dynamic vibrational energy & severity.' },
                  { id: 'rolling_mean', name: 'Rolling Mean', desc: 'Moving average: attenuates high-frequency noise & extracts trends.' },
                  { id: 'rolling_std', name: 'Rolling Std Dev', desc: 'Local dispersion & turbulence variance indicator.' },
                  { id: 'rolling_peak_to_peak', name: 'Peak-to-Peak Range', desc: 'Local span (max - min) capturing cycle oscillation amplitudes.' },
                ].map(op => (
                  <div
                    key={op.id}
                    className={`op-card ${featOperation === op.id ? 'selected' : ''}`}
                    onClick={() => setFeatOperation(op.id)}
                  >
                    <span className="op-card-name">{op.name}</span>
                    <span className="op-card-desc">{op.desc}</span>
                  </div>
                ))}

                {featCategory === 'derivatives' && [
                  { id: 'derivative', name: '1st Derivative (dx/dt)', desc: 'Velocity / Instantaneous rate of change of process parameter.' },
                  { id: 'acceleration', name: '2nd Derivative (d²x/dt²)', desc: 'Acceleration & shock jerk: detects mechanical instability.' },
                  { id: 'rate_of_change', name: '% Rate of Change', desc: 'Percentage delta between successive steps.' },
                ].map(op => (
                  <div
                    key={op.id}
                    className={`op-card ${featOperation === op.id ? 'selected' : ''}`}
                    onClick={() => setFeatOperation(op.id)}
                  >
                    <span className="op-card-name">{op.name}</span>
                    <span className="op-card-desc">{op.desc}</span>
                  </div>
                ))}

                {featCategory === 'arithmetic' && [
                  { id: 'differential', name: 'Differential (S1 - S2)', desc: 'Sensor subtraction: delta pressure, delta T across stages.' },
                  { id: 'ratio', name: 'Ratio (S1 / S2)', desc: 'Relative coefficient / efficiency balance between two signals.' },
                  { id: 'product', name: 'Product (S1 × S2)', desc: 'Interaction term / instantaneous power proxy (e.g. V × I).' },
                  { id: 'sum', name: 'Sum (S1 + S2)', desc: 'Composite summation of two sensor signals.' },
                ].map(op => (
                  <div
                    key={op.id}
                    className={`op-card ${featOperation === op.id ? 'selected' : ''}`}
                    onClick={() => setFeatOperation(op.id)}
                  >
                    <span className="op-card-name">{op.name}</span>
                    <span className="op-card-desc">{op.desc}</span>
                  </div>
                ))}

                {featCategory === 'transforms' && [
                  { id: 'log', name: 'Logarithm ln(|S|)', desc: 'Compresses wide dynamic ranges & stabilizes skewed sensors.' },
                  { id: 'square', name: 'Square (S²)', desc: 'Amplifies peaks & models quadratic drag / kinetic energy.' },
                  { id: 'sqrt', name: 'Square Root (√|S|)', desc: 'Compresses peak intensity.' },
                  { id: 'zscore', name: 'Z-Score Normalization', desc: 'Standard score (mean 0, std 1) for drift and outlier detection.' },
                  { id: 'cusum', name: 'CUSUM Accumulator', desc: 'Cumulative sum of deviations: detects small persistent mean shifts.' },
                ].map(op => (
                  <div
                    key={op.id}
                    className={`op-card ${featOperation === op.id ? 'selected' : ''}`}
                    onClick={() => setFeatOperation(op.id)}
                  >
                    <span className="op-card-name">{op.name}</span>
                    <span className="op-card-desc">{op.desc}</span>
                  </div>
                ))}
              </div>

              {/* Source Channel Selectors */}
              <div className="composite-field-group">
                <label className="field-label">Primary Source Sensor (S1)</label>
                <select
                  value={featSource1}
                  onChange={(e) => setFeatSource1(e.target.value)}
                  className="field-select"
                >
                  <option value="">Select Sensor...</option>
                  {numericColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {['differential', 'ratio', 'product', 'sum'].includes(featOperation) && (
                <div className="composite-field-group">
                  <label className="field-label">Secondary Source Sensor (S2)</label>
                  <select
                    value={featSource2}
                    onChange={(e) => setFeatSource2(e.target.value)}
                    className="field-select"
                  >
                    <option value="">Select Sensor 2...</option>
                    {numericColumns.filter(c => c !== featSource1).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}

              {['rolling_rms', 'rolling_mean', 'rolling_std', 'rolling_peak_to_peak'].includes(featOperation) && (
                <div className="composite-field-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field-label">Rolling Window Size</label>
                    <span style={{ fontSize: '0.76rem', color: '#00f2fe', fontFamily: 'monospace' }}>{featWindow} samples</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={100}
                    value={featWindow}
                    onChange={(e) => setFeatWindow(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#00f2fe' }}
                  />
                </div>
              )}

              <div className="composite-field-group">
                <label className="field-label">Constructed Feature Name</label>
                <input
                  type="text"
                  value={featCustomName}
                  onChange={(e) => setFeatCustomName(e.target.value)}
                  placeholder="e.g. Vibration_RMS_w15"
                  className="field-input"
                />
              </div>

              {featStudioError && (
                <div className="analytics-error-card">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span>{featStudioError}</span>
                </div>
              )}

              {featStudioSuccess && (
                <div className="composite-success-card">
                  <Check size={16} className="text-emerald-400" />
                  <span>{featStudioSuccess}</span>
                </div>
              )}
            </div>

            <div className="composite-modal-footer">
              <button
                type="button"
                onClick={() => setIsFeatureStudioOpen(false)}
                className="btn btn-ghost"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConstructFeature}
                disabled={isConstructingFeat || !featSource1 || (!featSource2 && ['differential', 'ratio', 'product', 'sum'].includes(featOperation))}
                className="btn btn-primary"
              >
                {isConstructingFeat ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                <span>Construct & Ingest Feature</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING INTERACTIVE WINDOW: EXCLUDED CHANNELS MANAGER */}
      {isExcludedModalOpen && (
        <div className="excluded-modal-backdrop" onClick={() => setIsExcludedModalOpen(false)}>
          <div className="excluded-modal-card" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="excluded-modal-header">
              <div className="excluded-modal-title-row">
                <div className="excluded-title-icon-box">
                  <EyeOff size={18} />
                </div>
                <div>
                  <h3 className="excluded-modal-title">Excluded Channels Manager</h3>
                  <p className="excluded-modal-subtitle">
                    Rule out redundant or noisy sensors from correlation heatmaps, ranking algorithms, and target drivers.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsExcludedModalOpen(false)} 
                className="btn-modal-close"
                title="Close floating window"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Toolbar & Filter */}
            <div className="excluded-modal-toolbar">
              {/* Search Bar */}
              <div className="excluded-search-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search sensors to exclude or include..."
                  value={excludedSearchQuery}
                  onChange={(e) => setExcludedSearchQuery(e.target.value)}
                  className="excluded-search-input"
                  autoFocus
                />
                {excludedSearchQuery && (
                  <button 
                    type="button" 
                    onClick={() => setExcludedSearchQuery('')}
                    className="btn-clear-search"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* View Tabs & Quick Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div className="excluded-filter-tabs">
                  <button
                    type="button"
                    onClick={() => setExcludedFilterTab('all')}
                    className={`excluded-tab-btn ${excludedFilterTab === 'all' ? 'active' : ''}`}
                  >
                    All Channels ({numericColumns.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcludedFilterTab('excluded')}
                    className={`excluded-tab-btn ${excludedFilterTab === 'excluded' ? 'active' : ''}`}
                  >
                    Excluded ({excludedSensors.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcludedFilterTab('active')}
                    className={`excluded-tab-btn ${excludedFilterTab === 'active' ? 'active' : ''}`}
                  >
                    Active ({availableNumericColumns.length})
                  </button>
                </div>

                {excludedSensors.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllExclusions}
                    className="btn-restore-all"
                    title="Restore all excluded channels"
                  >
                    <RotateCcw size={12} />
                    <span>Restore All ({excludedSensors.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Interactive List */}
            <div className="excluded-modal-list">
              {filteredModalSensors.length === 0 ? (
                <div className="excluded-modal-empty">
                  <CheckCircle2 size={26} style={{ opacity: 0.5, marginBottom: '8px', color: '#10b981' }} />
                  <span>
                    {excludedFilterTab === 'excluded' 
                      ? 'No channels are currently excluded. Click "Exclude" on any channel to rule it out.' 
                      : excludedSearchQuery 
                        ? `No channels matching "${excludedSearchQuery}"` 
                        : 'No channels available in current run selection.'}
                  </span>
                </div>
              ) : (
                filteredModalSensors.map(col => {
                  const isExcluded = excludedSensors.includes(col);
                  return (
                    <div 
                      key={col} 
                      className={`excluded-list-row ${isExcluded ? 'row-excluded' : 'row-active'}`}
                    >
                      <div className="excluded-row-info">
                        <span className="channel-name-txt" title={col}>{col}</span>
                        {isExcluded ? (
                          <span className="badge-excluded-tag">
                            <EyeOff size={10} />
                            <span>Excluded</span>
                          </span>
                        ) : (
                          <span className="badge-active-tag">
                            <Check size={10} />
                            <span>Active in Analysis</span>
                          </span>
                        )}
                      </div>

                      {/* Action Button */}
                      {isExcluded ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreSensor(col)}
                          className="btn-action-restore"
                          title={`Restore ${col} to correlation analysis`}
                        >
                          <Eye size={12} />
                          <span>Restore Channel</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRuleOutSensor(col)}
                          className="btn-action-exclude"
                          title={`Exclude ${col} from correlation analysis`}
                        >
                          <EyeOff size={12} />
                          <span>Exclude</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="excluded-modal-footer">
              <span className="excluded-footer-hint">
                💡 Tip: Add or remove sensors here anytime. Changes update correlations and drivers live.
              </span>
              <button
                type="button"
                onClick={() => setIsExcludedModalOpen(false)}
                className="btn btn-primary"
                style={{ padding: '7px 22px', fontSize: '0.82rem' }}
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

