import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Upload, Activity, Trash2, 
  ThumbsUp, ThumbsDown, Play, Info, 
  RefreshCw, X, Check, Lightbulb, Search, 
  ArrowUpDown, CheckSquare, Square, Download,
  AlertCircle, ChevronDown, Sliders, Cloud
} from 'lucide-react';
import { useToast } from './components/ui/Toast';
import { Button, Modal, Skeleton, KpiCard, HelpPopover } from './components/ui';
import { AppSidebar, AppHeader, CommandPalette } from './components/shell';
import type { ViewType } from './components/shell';
import { exportToCsv, SENSORLENS_CHART_THEME } from './utils/chartTheme';

// Code-split sub-views to clear bundle warnings and optimize runtime footprint
const VisualReportView = React.lazy(() => import('./components/VisualReport/VisualReportView').then(m => ({ default: m.VisualReportView })));
const ColumnAlignmentView = React.lazy(() => import('./components/ColumnAlignment/ColumnAlignmentView').then(m => ({ default: m.ColumnAlignmentView })));
const BaselineEngineView = React.lazy(() => import('./components/Baseline/BaselineEngineView').then(m => ({ default: m.BaselineEngineView })));
const AnalyticsView = React.lazy(() => import('./components/Analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })));

const ViewLoadingFallback: React.FC = () => (
  <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} role="status" aria-label="Loading view">
    <Skeleton height={42} width="40%" />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <Skeleton height={110} />
      <Skeleton height={110} />
      <Skeleton height={110} />
      <Skeleton height={110} />
    </div>
    <Skeleton height={420} />
  </div>
);



const VALID_VIEWS: ViewType[] = ['dashboard', 'visualizer', 'alignment', 'baseline', 'compare', 'analytics'];

const getViewFromHash = (): ViewType => {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as ViewType;
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard';
};

interface SensorColumn {
  name: string;
  type: string;
  total_rows: number;
  missing_count: number;
  min: number;
  max: number;
  mean: number;
  std: number;
  sparkline: number[];
}

interface TestFile {
  id: string;
  name: string;
  rowCount: number;
  columns: SensorColumn[];
  tag: 'useful' | 'reviewable' | 'reference' | 'archive';
}

interface SimilarityResult {
  mapped_to: string;
  score: number;
  pearson: number;
  dtw: number;
  category: 'match' | 'similar' | 'no match';
  confidence: number;
  lag: number;
  peaks_ref: number;
  peaks_test: number;
  max_ref: number;
  max_test: number;
  explanation: string;
  plot_data: {
    ref: number[];
    test: number[];
  };
  error?: string;
}

export default function App() {
  const toast = useToast();

  // App States
  const [files, setFiles] = useState<TestFile[]>([]);
  const [activeTestId, setActiveTestId] = useState<string>(() => {
    try {
      return localStorage.getItem('sensorlens_active_test_id') || '';
    } catch {
      return '';
    }
  });
  const [activeRefId, setActiveRefId] = useState<string>(() => {
    try {
      return localStorage.getItem('sensorlens_active_ref_id') || '';
    } catch {
      return '';
    }
  });

  // Library Search, Sort, Filters, and Bulk Actions
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySort, setLibrarySort] = useState<'name' | 'rows' | 'channels' | 'tag'>(() => {
    try {
      return (localStorage.getItem('sensorlens_library_sort') as any) || 'name';
    } catch {
      return 'name';
    }
  });
  const [libraryTagFilter, setLibraryTagFilter] = useState<'all' | 'reference' | 'useful' | 'reviewable' | 'archive'>(() => {
    try {
      return (localStorage.getItem('sensorlens_library_filter') as any) || 'all';
    } catch {
      return 'all';
    }
  });
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [isDragOverLibrary, setIsDragOverLibrary] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, {
    name: string;
    progress: number;
    status: 'uploading' | 'parsing' | 'done' | 'error';
    errorMsg?: string;
    suggestion?: string;
  }>>({});
  
  // Library Mapping Drag and Drop
  const [mappings, setMappings] = useState<Record<string, string>>({}); // ref_col -> test_col
  const [unmappedPool, setUnmappedPool] = useState<string[]>([]);
  
  // Similarity Results
  const [similarityResults, setSimilarityResults] = useState<Record<string, SimilarityResult>>({});
  const [selectedResultCol, setSelectedResultCol] = useState<string>('');
  
  const [selectedPlotCols, setSelectedPlotCols] = useState<Array<{ fileId: string; colName: string; fileName?: string }>>([]);
  
  // UI Panels / Views synchronized to URL hash
  const [activeView, setActiveView] = useState<ViewType>(getViewFromHash);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sensorlens_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  
  // Settings Config
  const [settings, setSettings] = useState({
    matchThreshold: 0.85,
    similarThreshold: 0.60,
    wPearson: 0.5,
    wDtw: 0.5,
    oneDrivePath: 'C:\\Users\\sidb9\\OneDrive - BSH\\SensorLensReports',
    apiKey: ''
  });

  // Sync active view to window hash
  useEffect(() => {
    const handleHashChange = () => {
      const v = getViewFromHash();
      setActiveView(v);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Save selection states across page refresh
  useEffect(() => {
    try {
      if (activeRefId) localStorage.setItem('sensorlens_active_ref_id', activeRefId);
      else localStorage.removeItem('sensorlens_active_ref_id');
    } catch {}
  }, [activeRefId]);

  useEffect(() => {
    try {
      if (activeTestId) localStorage.setItem('sensorlens_active_test_id', activeTestId);
      else localStorage.removeItem('sensorlens_active_test_id');
    } catch {}
  }, [activeTestId]);

  useEffect(() => {
    try {
      localStorage.setItem('sensorlens_library_filter', libraryTagFilter);
    } catch {}
  }, [libraryTagFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('sensorlens_library_sort', librarySort);
    } catch {}
  }, [librarySort]);

  const navigateToView = (view: ViewType) => {
    setActiveView(view);
    window.location.hash = view;
    if (view === 'visualizer' && selectedPlotCols.length === 0 && files.length > 0) {
      const firstF = files[0];
      if (firstF && firstF.columns[0]) {
        setSelectedPlotCols([{ fileId: firstF.id, colName: firstF.columns[0].name, fileName: firstF.name }]);
      }
    }
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sensorlens_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  
  // User feedback on AI reports
  const [feedbacks, setFeedbacks] = useState<Record<string, { verdict: string; comment: string }>>({});
  const [feedbackComment, setFeedbackComment] = useState('');
  
  // File Upload input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceInputRef = useRef<HTMLInputElement>(null);

  // Suggested mappings trigger when Ref or Test files change
  useEffect(() => {
    if (activeRefId && activeTestId) {
      fetchSuggestedMappings();

    } else {
      setMappings({});
      setUnmappedPool([]);
    }
  }, [activeRefId, activeTestId]);

  const fetchSuggestedMappings = async () => {
    const refFile = files.find(f => f.id === activeRefId);
    const testFile = files.find(f => f.id === activeTestId);
    if (!refFile || !testFile) return;

    try {
      const response = await fetch('http://localhost:8000/api/suggest-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_cols: refFile.columns.map(c => c.name),
          test_cols: testFile.columns.map(c => c.name),
        }),
      });
      const data = await response.json();
      
      const suggested = data.suggestions || {};
      setMappings(suggested);
      
      // Calculate unmapped pool
      const mappedTestCols = Object.values(suggested).filter(v => v !== '') as string[];
      const pool = testFile.columns
        .map(c => c.name)
        .filter(name => !mappedTestCols.includes(name));
      setUnmappedPool(pool);
    } catch (e) {
      console.error('Failed to fetch mapping suggestions:', e);
      // Fallback: empty maps
      const initMaps: Record<string, string> = {};
      refFile.columns.forEach(c => { initMaps[c.name] = ''; });
      setMappings(initMaps);
      setUnmappedPool(testFile.columns.map(c => c.name));
    }
  };

  // Reusable multi-file upload with per-file progress and error guidance
  const handleUploadFilesList = async (filesList: FileList | File[]) => {
    if (!filesList || filesList.length === 0) return;
    setIsUploading(true);
    const updatedFiles = [...files];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const uploadId = `${file.name}-${Date.now()}-${i}`;

      setUploadProgress(prev => ({
        ...prev,
        [uploadId]: { name: file.name, progress: 25, status: 'uploading' }
      }));

      const formData = new FormData();
      formData.append('file', file);

      try {
        setUploadProgress(prev => ({
          ...prev,
          [uploadId]: { ...prev[uploadId], progress: 60, status: 'parsing' }
        }));

        const response = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: 'Server error parsing file' }));
          const detail = err.detail || 'Upload or parse failed';
          let suggestion = 'Verify worksheet contains numeric time-series values with headers in row 1.';
          const lower = detail.toLowerCase();
          if (lower.includes('column') || lower.includes('header')) {
            suggestion = 'Check row 1 headers: ensure names are unique and non-empty.';
          } else if (lower.includes('empty') || lower.includes('row')) {
            suggestion = 'Workbook has no sensor data rows under headers.';
          } else if (lower.includes('format') || lower.includes('type')) {
            suggestion = 'Ensure file is a valid .xlsx or .xls workbook (not password protected).';
          }

          setUploadProgress(prev => ({
            ...prev,
            [uploadId]: {
              name: file.name,
              progress: 100,
              status: 'error',
              errorMsg: detail,
              suggestion
            }
          }));
          toast.error(`Error uploading ${file.name}: ${detail}`, 'Upload Error');
          continue;
        }

        const data = await response.json();
        let defaultTag: 'useful' | 'reviewable' | 'reference' | 'archive' = 'useful';
        if (updatedFiles.length === 0) {
          defaultTag = 'reference';
        }

        const newFile: TestFile = {
          id: data.id,
          name: data.name,
          rowCount: data.rowCount,
          columns: data.columns,
          tag: defaultTag
        };
        updatedFiles.push(newFile);

        if (defaultTag === 'reference') {
          setActiveRefId(data.id);
        } else if (!activeTestId) {
          setActiveTestId(data.id);
        }

        setUploadProgress(prev => ({
          ...prev,
          [uploadId]: { name: file.name, progress: 100, status: 'done' }
        }));
        toast.success(`Loaded ${file.name} (${data.columns.length} channels, ${data.rowCount.toLocaleString()} rows)`, 'Run Ingested');
      } catch (err: any) {
        setUploadProgress(prev => ({
          ...prev,
          [uploadId]: {
            name: file.name,
            progress: 100,
            status: 'error',
            errorMsg: 'Network or backend connection error',
            suggestion: 'Make sure the backend API server is running on port 8000.'
          }
        }));
        toast.error(`Failed to upload ${file.name}. Ensure backend is running.`, 'Upload Error');
      }
    }

    setFiles(updatedFiles);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Auto clear completed progress cards after 4 seconds
    setTimeout(() => {
      setUploadProgress(prev => {
        const next: typeof prev = {};
        Object.entries(prev).forEach(([k, v]) => {
          if (v.status !== 'done') next[k] = v;
        });
        return next;
      });
    }, 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleUploadFilesList(e.target.files);
  };

  // Drag and drop onto library panel
  const handleLibraryDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverLibrary(true);
  };

  const handleLibraryDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverLibrary(false);
  };

  const handleLibraryDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverLibrary(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFilesList(e.dataTransfer.files);
    }
  };

  // Delete with Undo
  const deleteFile = (id: string) => {
    const deletedFile = files.find(f => f.id === id);
    if (!deletedFile) return;

    const wasRef = activeRefId === id;
    const wasTest = activeTestId === id;

    setFiles(prev => prev.filter(f => f.id !== id));
    if (wasRef) setActiveRefId('');
    if (wasTest) setActiveTestId('');
    setBulkSelectedIds(prev => prev.filter(item => item !== id));

    toast.info(`Deleted "${deletedFile.name}"`, 'Run Removed', {
      label: 'Undo',
      onClick: () => {
        setFiles(prev => [...prev, deletedFile]);
        if (wasRef) setActiveRefId(deletedFile.id);
        if (wasTest) setActiveTestId(deletedFile.id);
        toast.success(`Restored "${deletedFile.name}"`, 'Run Restored');
      }
    });
  };

  // Bulk actions
  const bulkDeleteSelected = () => {
    if (bulkSelectedIds.length === 0) return;
    const deletedFiles = files.filter(f => bulkSelectedIds.includes(f.id));
    const count = deletedFiles.length;

    setFiles(prev => prev.filter(f => !bulkSelectedIds.includes(f.id)));
    if (bulkSelectedIds.includes(activeRefId)) setActiveRefId('');
    if (bulkSelectedIds.includes(activeTestId)) setActiveTestId('');
    setBulkSelectedIds([]);

    toast.info(`Deleted ${count} run${count > 1 ? 's' : ''}`, 'Bulk Action', {
      label: 'Undo',
      onClick: () => {
        setFiles(prev => [...prev, ...deletedFiles]);
        toast.success(`Restored ${count} run${count > 1 ? 's' : ''}`, 'Runs Restored');
      }
    });
  };

  const bulkTagSelected = (tag: 'useful' | 'reviewable' | 'reference' | 'archive') => {
    if (bulkSelectedIds.length === 0) return;
    setFiles(prev => prev.map(f => bulkSelectedIds.includes(f.id) ? { ...f, tag } : f));
    toast.success(`Tagged ${bulkSelectedIds.length} runs as ${tag}`, 'Bulk Tagged');
    setBulkSelectedIds([]);
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setBulkSelectedIds(filteredFiles.map(f => f.id));
  };

  const clearBulkSelection = () => {
    setBulkSelectedIds([]);
  };

  const updateTag = (id: string, tag: 'useful' | 'reviewable' | 'reference' | 'archive') => {
    setFiles(files.map(f => {
      if (f.id === id) {
        if (tag === 'reference') {
          return { ...f, tag };
        }
        return { ...f, tag };
      }
      if (tag === 'reference' && f.tag === 'reference') {
        return { ...f, tag: 'useful' };
      }
      return f;
    }));

    if (tag === 'reference') {
      setActiveRefId(id);
    }
  };

  // Filtered and sorted files list
  const filteredFiles = useMemo(() => {
    let result = [...files];
    if (libraryTagFilter !== 'all') {
      result = result.filter(f => f.tag === libraryTagFilter);
    }
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.columns.some(c => c.name.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      if (librarySort === 'name') return a.name.localeCompare(b.name);
      if (librarySort === 'rows') return b.rowCount - a.rowCount;
      if (librarySort === 'channels') return b.columns.length - a.columns.length;
      if (librarySort === 'tag') return (a.tag || '').localeCompare(b.tag || '');
      return 0;
    });
    return result;
  }, [files, libraryTagFilter, librarySearch, librarySort]);

  // Drag and Drop Logics
  const handleDragStart = (e: React.DragEvent, colName: string) => {
    e.dataTransfer.setData('text/plain', colName);
  };

  const handleDropToSlot = (e: React.DragEvent, refColName: string) => {
    e.preventDefault();
    const testColName = e.dataTransfer.getData('text/plain');
    if (!testColName) return;

    // Is it currently mapped to a different slot?
    let previousRefCol: string | null = null;
    Object.entries(mappings).forEach(([r, t]) => {
      if (t === testColName) previousRefCol = r;
    });

    const currentOccupant = mappings[refColName];
    const newMappings = { ...mappings };

    if (previousRefCol) {
      newMappings[previousRefCol] = '';
    }

    newMappings[refColName] = testColName;
    setMappings(newMappings);

    // Update unmapped pool
    let newPool = unmappedPool.filter(c => c !== testColName);
    if (currentOccupant) {
      newPool.push(currentOccupant);
    }
    setUnmappedPool(newPool);
  };

  const handleDropToPool = (e: React.DragEvent) => {
    e.preventDefault();
    const testColName = e.dataTransfer.getData('text/plain');
    if (!testColName) return;

    // Find and remove mapping
    let sourceRefCol: string | null = null;
    Object.entries(mappings).forEach(([r, t]) => {
      if (t === testColName) sourceRefCol = r;
    });

    if (sourceRefCol) {
      const newMappings = { ...mappings };
      newMappings[sourceRefCol] = '';
      setMappings(newMappings);
      
      if (!unmappedPool.includes(testColName)) {
        setUnmappedPool([...unmappedPool, testColName]);
      }
    }
  };

  const runAnalysis = async () => {
    if (!activeRefId || !activeTestId) return;
    setIsAnalyzing(true);
    setSimilarityResults({});
    setSelectedResultCol('');

    try {
      const response = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_file_id: activeRefId,
          test_file_id: activeTestId,
          mappings: mappings,
          thresholds: {
            match: settings.matchThreshold,
            similar: settings.similarThreshold
          },
          weights: {
            pearson: settings.wPearson,
            dtw: settings.wDtw
          },
          api_key: settings.apiKey || null
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        toast.error(`Analysis failed: ${err.detail || 'Server error'}`, 'Similarity Engine');
        setIsAnalyzing(false);
        return;
      }

      const data = await response.json();
      setSimilarityResults(data.results);
      toast.success(`Completed similarity comparison across ${Object.keys(data.results || {}).length} sensor channels`, 'Pattern Analysis');
      
      // Auto select first mapped result column
      const firstCol = Object.keys(data.results)[0];
      if (firstCol) setSelectedResultCol(firstCol);
    } catch (e) {
      console.error(e);
      toast.error('Network error analyzing similarity. Backend may be offline.', 'Connection Error');
    }
    setIsAnalyzing(false);
  };

  const logFeedback = async (colName: string, verdict: 'correct' | 'incorrect') => {
    const key = `${activeRefId}_${activeTestId}`;
    setFeedbacks(prev => ({
      ...prev,
      [`${key}_${colName}`]: { verdict, comment: feedbackComment }
    }));

    try {
      await fetch('http://localhost:8000/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: key,
          col_name: colName,
          verdict,
          comment: feedbackComment
        })
      });
      toast.success('Feedback logged successfully!', 'Feedback Saved');
      setFeedbackComment('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit feedback to backend.', 'Feedback Error');
    }
  };

  const exportWorkspaceToOneDrive = async () => {
    try {
      // Fetch full telemetry data from backend
      let backendFilesData: any[] = [];
      try {
        const res = await fetch('http://localhost:8000/api/workspace/export-session');
        if (res.ok) {
          const exportJson = await res.json();
          backendFilesData = exportJson.files || [];
        }
      } catch (err) {
        console.warn('Could not fetch backend telemetry for OneDrive export:', err);
      }

      const filesWithData = files.map(f => {
        const backendMatch = backendFilesData.find(bf => bf.id === f.id);
        return {
          id: f.id,
          name: f.name,
          tag: f.tag,
          rowCount: f.rowCount,
          columns: f.columns,
          data: backendMatch?.data || undefined
        };
      });

      const sessionPayload = {
        files: filesWithData,
        tags: files.reduce((acc, f) => ({ ...acc, [f.id]: f.tag }), {}),
        activeRefId,
        activeTestId,
        mappings,
        selectedPlotCols,
        saved_reports: [
          {
            ref_file_id: activeRefId,
            test_file_id: activeTestId,
            ref_file_name: files.find(f => f.id === activeRefId)?.name || 'Reference',
            test_file_name: files.find(f => f.id === activeTestId)?.name || 'Test',
            verdict: Object.values(similarityResults).every(r => r.category === 'match') ? 'Match' : 'Requires Review',
            results: similarityResults
          }
        ]
      };

      const response = await fetch('http://localhost:8000/api/workspace/export-one-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: settings.oneDrivePath,
          session: sessionPayload
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Workspace exported to target folder: ${data.saved_json}`, 'Export Successful');
      } else {
        const err = await response.json();
        toast.error(`Failed to save to OneDrive: ${err.detail || 'Unknown error'}`, 'OneDrive Export Error');
      }
    } catch {
      toast.error('Export failed due to network error.', 'Export Error');
    }

  };

  const triggerLocalJsonDownload = async () => {
    try {
      // Fetch full telemetry data from backend
      let backendFilesData: any[] = [];
      try {
        const res = await fetch('http://localhost:8000/api/workspace/export-session');
        if (res.ok) {
          const exportJson = await res.json();
          backendFilesData = exportJson.files || [];
        }
      } catch (err) {
        console.warn('Could not fetch backend telemetry for export:', err);
      }

      const filesWithData = files.map(f => {
        const backendMatch = backendFilesData.find(bf => bf.id === f.id);
        return {
          id: f.id,
          name: f.name,
          tag: f.tag,
          rowCount: f.rowCount,
          columns: f.columns,
          data: backendMatch?.data || undefined
        };
      });

      const sessionPayload = {
        files: filesWithData,
        tags: files.reduce((acc, f) => ({ ...acc, [f.id]: f.tag }), {}),
        activeRefId,
        activeTestId,
        mappings,
        selectedPlotCols,
        saved_reports: [
          {
            ref_file_id: activeRefId,
            test_file_id: activeTestId,
            ref_file_name: files.find(f => f.id === activeRefId)?.name || 'Reference',
            test_file_name: files.find(f => f.id === activeTestId)?.name || 'Test',
            results: similarityResults
          }
        ]
      };

      const blob = new Blob([JSON.stringify(sessionPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sensorlens_session_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Workspace session exported to file download', 'Session Saved');
    } catch {
      toast.error('Failed to export workspace session.', 'Export Error');
    }

  };

  const handleImportWorkspace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const state = JSON.parse(event.target?.result as string);
        
        // Push raw metadata and telemetry into backend cache
        const response = await fetch('http://localhost:8000/api/workspace/import-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });

        if (response.ok) {
          const importData = await response.json();
          // Use validated reconstructed files from backend if available, or state.files
          const sourceFiles = importData.files && importData.files.length > 0 
            ? importData.files 
            : (state.files || []);

          const importedFiles = sourceFiles.map((f: any) => ({
            id: f.id,
            name: f.name,
            rowCount: f.rowCount || 100,
            columns: f.columns || [],
            tag: state.tags?.[f.id] || f.tag || 'useful'
          }));

          setFiles(importedFiles);
          
          // Reconstruct selections
          let foundRef = importedFiles.find((f: any) => f.tag === 'reference');
          if (!foundRef && state.activeRefId) {
            foundRef = importedFiles.find((f: any) => f.id === state.activeRefId);
          }
          if (foundRef) {
            setActiveRefId(foundRef.id);
          } else if (importedFiles.length > 0) {
            setActiveRefId(importedFiles[0].id);
          }
          
          let foundTest = importedFiles.find((f: any) => f.id !== foundRef?.id && (f.tag === 'useful' || f.tag !== 'reference'));
          if (!foundTest && state.activeTestId) {
            foundTest = importedFiles.find((f: any) => f.id === state.activeTestId);
          }
          if (foundTest) {
            setActiveTestId(foundTest.id);
          } else if (importedFiles.length > 1) {
            setActiveTestId(importedFiles[1].id);
          }

          if (state.mappings) {
            setMappings(state.mappings);
          }
          
          if (state.saved_reports && state.saved_reports[0]) {
            setSimilarityResults(state.saved_reports[0].results || {});
            const firstCol = Object.keys(state.saved_reports[0].results || {})[0];
            if (firstCol) setSelectedResultCol(firstCol);
          }

          // Auto-select plot channels for Visual Report tab so it renders immediately
          if (state.selectedPlotCols && state.selectedPlotCols.length > 0) {
            setSelectedPlotCols(state.selectedPlotCols);
          } else if (importedFiles.length > 0) {
            const firstF = importedFiles[0];
            const numCols = firstF.columns.filter((c: any) => c.type === 'numeric').slice(0, 3);
            if (numCols.length > 0) {
              setSelectedPlotCols(numCols.map((c: any) => ({
                fileId: firstF.id,
                colName: c.name,
                fileName: firstF.name
              })));
            }
          }
          
          toast.success(`Workspace restored! Loaded ${importedFiles.length} runs across all analysis engines.`, 'Session Restored');
        } else {
          toast.error('Import failed: Backend could not ingest cache.', 'Import Error');
        }
      } catch {
        toast.error('Invalid workspace session JSON file.', 'Import Error');
      }

    };
    reader.readAsText(file);
    if (workspaceInputRef.current) workspaceInputRef.current.value = '';
  };




  const getComparisonChartOption = (colName: string) => {
    const result = similarityResults[colName];
    if (!result || !result.plot_data) return {};

    const refSeries = result.plot_data.ref.map((val, idx) => [idx, val]);
    const testSeries = result.plot_data.test.map((val, idx) => [idx, val]);

    return {
      ...SENSORLENS_CHART_THEME,
      legend: {
        ...SENSORLENS_CHART_THEME.legend,
        data: ['Expected Reference', 'Test Run'],
        top: 6,
      },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '16%', containLabel: true },
      xAxis: {
        ...SENSORLENS_CHART_THEME.xAxis,
        type: 'value',
        name: 'Step Index (Normalized)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      },
      yAxis: {
        ...SENSORLENS_CHART_THEME.yAxis,
        type: 'value',
        name: 'Amplitude',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      },
      series: [
        {
          name: 'Expected Reference',
          type: 'line',
          data: refSeries,
          smooth: true,
          lineStyle: { width: 2.5, color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
          emphasis: { focus: 'series' }
        },
        {
          name: 'Test Run',
          type: 'line',
          data: testSeries,
          smooth: true,
          lineStyle: { width: 2.5, color: '#00f2fe' },
          itemStyle: { color: '#00f2fe' },
          emphasis: { focus: 'series' }
        }
      ]
    };
  };

  const exportComparisonCsv = () => {
    const result = similarityResults[selectedResultCol];
    if (!result || !result.plot_data) return;
    const len = Math.max(result.plot_data.ref.length, result.plot_data.test.length);
    const rows: (string | number)[][] = [];
    for (let i = 0; i < len; i++) {
      rows.push([
        i,
        result.plot_data.ref[i] !== undefined ? result.plot_data.ref[i] : '',
        result.plot_data.test[i] !== undefined ? result.plot_data.test[i] : '',
      ]);
    }
    exportToCsv(
      `${selectedResultCol}_similarity_comparison`,
      ['Step_Index', 'Expected_Reference_Norm', 'Test_Run_Norm'],
      rows
    );
    toast.success(`Exported CSV for ${selectedResultCol}`, 'CSV Exported');
  };

  const togglePlotColumn = (fileId: string, colName: string) => {
    const exists = selectedPlotCols.find(p => p.fileId === fileId && p.colName === colName);
    if (exists) {
      setSelectedPlotCols(selectedPlotCols.filter(p => !(p.fileId === fileId && p.colName === colName)));
    } else {
      setSelectedPlotCols([...selectedPlotCols, { fileId, colName }]);
    }
  };

  return (
    <div className="app-shell">
      {/* Collapsible Left Navigation Sidebar */}
      <AppSidebar
        activeView={activeView}
        onSelectView={navigateToView}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        isDrawerOpen={isDrawerOpen}
        onCloseDrawer={() => setIsDrawerOpen(false)}
        fileCount={files.length}
        sensorCount={selectedPlotCols.length}
        similarityCount={Object.keys(similarityResults).length}
        onOpenGuide={() => setShowGuide(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onExportSession={triggerLocalJsonDownload}
        onImportClick={() => workspaceInputRef.current?.click()}
      />

      {/* Main App Content Area */}
      <div className="app-main-wrapper">
        {/* Sticky Page Header */}
        <AppHeader
          activeView={activeView}
          onSelectView={navigateToView}
          onOpenMobileDrawer={() => setIsDrawerOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          activeRefName={files.find(f => f.id === activeRefId)?.name}
          activeTestName={files.find(f => f.id === activeTestId)?.name}
          fileCount={files.length}
          hasAlignment={Object.keys(mappings).length > 0}
          hasBaseline={!!activeRefId}
          hasAnalysis={Object.keys(similarityResults).length > 0}
          primaryAction={
            activeView === 'dashboard' ? (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => fileInputRef.current?.click()}
                isLoading={isUploading}
                id="btn-header-upload"
              >
                <Upload size={14} /> Upload Run
              </Button>
            ) : activeView === 'compare' ? (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={runAnalysis} 
                isLoading={isAnalyzing}
                disabled={!activeRefId || !activeTestId}
                id="btn-header-run-similarity"
              >
                <Play size={14} /> Run Analysis
              </Button>

            ) : activeView === 'alignment' ? (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={fetchSuggestedMappings}
                disabled={!activeRefId || !activeTestId}
                id="btn-header-suggest-align"
              >
                <RefreshCw size={14} /> Suggest Mappings
              </Button>
            ) : undefined
          }
        />

        {/* Hidden File Inputs for Workspace Import */}
        <input 
          type="file" 
          ref={workspaceInputRef} 
          onChange={handleImportWorkspace} 
          accept=".json" 
          className="hidden" 
        />

        {/* Main Content Area */}
        <main className="flex-1" style={{ position: 'relative', overflow: 'hidden' }}>

        
        {/* VIEW 1: DASHBOARD */}
        <div style={{ display: activeView === 'dashboard' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', width: '100%', flexDirection: 'column' }}>
          <div className="dashboard-layout">
            
            {/* Left Library Column */}
            <div 
              className="glass-panel library-dropzone-container"
              onDragOver={handleLibraryDragOver}
              onDragLeave={handleLibraryDragLeave}
              onDrop={handleLibraryDrop}
            >
              {isDragOverLibrary && (
                <div className="library-drag-overlay">
                  <Upload size={36} className="text-accent-cyan animate-bounce" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                    Drop Excel Runs Here
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Auto-ingests columns, channels, and sensor telemetry
                  </span>
                </div>
              )}

              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <div className="library-header-row">
                  <div className="library-title-group">
                    <span className="library-title-text">Runs & Datasets</span>
                    <span className="library-count-pill">{files.length}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="library-upload-btn"
                    id="btn-library-upload"
                    title="Upload telemetry file (.xlsx, .xls)"
                  >
                    <Upload size={12} />
                    <span>Upload</span>
                  </button>
                </div>

                {/* Search & Sort Controls */}
                <div className="library-toolbar">
                  <div className="library-search-bar">
                    <Search size={12} className="search-icon" />
                    <input 
                      type="text" 
                      className="library-search-input"
                      placeholder="Search runs or channels..." 
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      aria-label="Search test runs"
                    />
                    {librarySearch && (
                      <button 
                        type="button"
                        onClick={() => setLibrarySearch('')} 
                        className="library-search-clear"
                        aria-label="Clear search"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  <div className="library-sort-picker" title="Sort runs by">
                    <ArrowUpDown size={11} className="sort-icon" />
                    <select 
                      value={librarySort} 
                      onChange={(e) => setLibrarySort(e.target.value as any)}
                      aria-label="Sort library files"
                      className="library-sort-native-select"
                    >
                      <option value="name">Name</option>
                      <option value="rows">Rows</option>
                      <option value="channels">Channels</option>
                      <option value="tag">Tag</option>
                    </select>
                  </div>
                </div>

                {/* Tag Filter Segmented Buttons */}
                <div className="library-filter-segments" role="radiogroup" aria-label="Filter runs by tag">
                  {(['all', 'reference', 'useful', 'reviewable', 'archive'] as const).map(tag => {
                    const count = tag === 'all' ? files.length : files.filter(f => f.tag === tag).length;
                    const label = tag === 'all' ? 'All' : tag === 'reference' ? 'Ref' : tag.charAt(0).toUpperCase() + tag.slice(1);
                    return (
                      <button 
                        key={tag}
                        type="button"
                        onClick={() => setLibraryTagFilter(tag)}
                        className={`library-segment-btn ${libraryTagFilter === tag ? 'active' : ''}`}
                        role="radio"
                        aria-checked={libraryTagFilter === tag}
                      >
                        <span>{label}</span>
                        <span className="segment-count">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Bulk Action Bar */}
                {bulkSelectedIds.length > 0 && (
                  <div className="library-bulk-bar">
                    <span className="library-bulk-label">{bulkSelectedIds.length} selected</span>
                    <div className="library-bulk-actions">
                      <button onClick={selectAllFiltered} className="btn-text-sm" title="Select All Visible">
                        All
                      </button>
                      <button onClick={clearBulkSelection} className="btn-text-sm" title="Deselect All">
                        Clear
                      </button>
                      <select 
                        onChange={(e) => {
                          if (e.target.value) {
                            bulkTagSelected(e.target.value as any);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="tag-select"
                        style={{ height: 22, fontSize: '11px' }}
                      >
                        <option value="" disabled>Tag as...</option>
                        <option value="useful">Useful</option>
                        <option value="reviewable">Reviewable</option>
                        <option value="reference">Reference</option>
                        <option value="archive">Archive</option>
                      </select>
                      <button 
                        onClick={bulkDeleteSelected}
                        className="btn-icon text-muted hover-red"
                        title="Delete selected runs"
                        style={{ padding: 2 }}
                      >
                        <Trash2 size={13} className="text-rose-400" />
                      </button>
                    </div>
                  </div>
                )}

                <input 
                  type="file" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                />
              </div>

              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Per-File Upload Progress Cards */}
                {Object.keys(uploadProgress).length > 0 && (
                  <div className="upload-progress-list">
                    {Object.entries(uploadProgress).map(([upId, item]) => (
                      <div key={upId} className="upload-progress-card">
                        <div className="upload-progress-header">
                          <span style={{ fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                            {item.name}
                          </span>
                          <span style={{ 
                            fontSize: '10px', 
                            color: item.status === 'error' ? 'var(--color-danger-text)' : item.status === 'done' ? 'var(--color-success-text)' : 'var(--accent-cyan)' 
                          }}>
                            {item.status === 'uploading' ? 'Uploading...' : item.status === 'parsing' ? 'Parsing telemetry...' : item.status === 'done' ? 'Ready' : 'Failed'}
                          </span>
                        </div>
                        <div className="upload-progress-bar-bg">
                          <div 
                            className="upload-progress-bar-fill" 
                            style={{ 
                              width: `${item.progress}%`,
                              background: item.status === 'error' ? 'var(--color-danger-border)' : undefined
                            }} 
                          />
                        </div>
                        {item.status === 'error' && item.suggestion && (
                          <div className="upload-error-suggestion">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                              <AlertCircle size={11} />
                              <span>{item.errorMsg || 'Parse Error'}</span>
                            </div>
                            <div style={{ marginTop: 2 }}>{item.suggestion}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State when no files uploaded */}
                {files.length === 0 && (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed var(--border-color)',
                      borderRadius: '8px',
                      padding: '24px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.01)',
                      minHeight: 180
                    }}
                  >
                    <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>No files ingested yet</p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Drag & drop or click to ingest Excel sensor logs (.xlsx, .xls)
                    </p>
                  </div>
                )}

                {/* Filter Empty State */}
                {files.length > 0 && filteredFiles.length === 0 && (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    <p>No runs match "{librarySearch || libraryTagFilter}"</p>
                    <button 
                      onClick={() => { setLibrarySearch(''); setLibraryTagFilter('all'); }}
                      className="btn-text-sm"
                      style={{ marginTop: 8 }}
                    >
                      Clear search & filters
                    </button>
                  </div>
                )}

                {/* Files List */}
                {filteredFiles.length > 0 && (
                  <div className="file-list" style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredFiles.map(f => {
                      const isBulkSelected = bulkSelectedIds.includes(f.id);
                      return (
                        <div 
                          key={f.id} 
                          className={`file-card ${
                            activeTestId === f.id ? 'active-test' : activeRefId === f.id ? 'active-ref' : ''
                          }`}
                        >
                          <div className="file-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBulkSelect(f.id);
                                }}
                                style={{ background: 'transparent', border: 'none', color: isBulkSelected ? 'var(--accent-cyan)' : 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                title={isBulkSelected ? 'Deselect run' : 'Select run for bulk actions'}
                              >
                                {isBulkSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                              </button>
                              <div style={{ overflow: 'hidden' }}>
                                <p className="file-title" title={f.name}>{f.name}</p>
                                <p className="file-meta">{f.rowCount.toLocaleString()} rows • {f.columns.length} channels</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => deleteFile(f.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              title="Delete run (with Undo)"
                            >
                              <Trash2 size={12} className="hover:text-red-400" />
                            </button>
                          </div>

                          {/* Tag & Selection Controls */}
                          <div className="file-actions">
                            <select 
                              value={f.tag}
                              onChange={(e) => updateTag(f.id, e.target.value as any)}
                              className="tag-select"
                              aria-label={`Tag for ${f.name}`}
                            >
                              <option value="useful">Useful Run</option>
                              <option value="reviewable">Needs Review</option>
                              <option value="reference">Reference</option>
                              <option value="archive">Archive</option>
                            </select>

                            <div className="selection-toggle-group">
                              <button 
                                onClick={() => setActiveTestId(f.id)}
                                className={`selection-btn ${activeTestId === f.id ? 'active-test-btn' : ''}`}
                                title="Set as Test comparison run"
                              >
                                Test
                              </button>
                              <button 
                                onClick={() => {
                                  setActiveRefId(f.id);
                                  updateTag(f.id, 'reference');
                                }}
                                className={`selection-btn ${activeRefId === f.id ? 'active-ref-btn' : ''}`}
                                title="Set as Reference golden run"
                              >
                                Ref
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Live Dashboard Summary Grid */}
            <div className="glass-panel">
              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <h2 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Live Channel Overview</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Inspect sensor profiles below. Click a card to toggle its presence in the Visual Report graph.
                </p>
              </div>

              <div className="panel-body">
                {/* Visual Roadmap & Baseline Engine Explainer Banner */}
                <div className="dashboard-roadmap-banner">
                   <div className="roadmap-title-row">
                     <div className="roadmap-title-left">
                       <Lightbulb size={16} className="text-accent-cyan" />
                       <span className="roadmap-title">System Architecture: How the 4 Engines Connect</span>
                     </div>
                     <span className="roadmap-badge">BSH Engineering Guide</span>
                   </div>

                   <div className="roadmap-steps-grid">
                     <div className="roadmap-step">
                       <span className="step-tag">Step 1: Dashboard</span>
                       <h4 className="step-heading">Tag Ref vs Test</h4>
                       <p className="step-desc">
                         Mark your known-good cycle as <b>Ref</b> (Golden Reference) and the run you want to diagnose as <b>Test</b>.
                       </p>
                     </div>

                     <div className="roadmap-step">
                       <span className="step-tag">Step 2: Visual & Alignment</span>
                       <h4 className="step-heading">Plot & Align Channels</h4>
                       <p className="step-desc">
                         Inspect curves side-by-side. Use <b>Column Alignment</b> to auto-pair mismatched sensor names.
                       </p>
                     </div>

                     <div className="roadmap-step highlight">
                       <span className="step-tag highlight">Step 3: Baseline Engine</span>
                       <h4 className="step-heading">Multi-Run Guardrails</h4>
                       <p className="step-desc">
                         Merge <i>multiple</i> reference runs into an averaged <b>Golden Standard</b> with dynamic tolerance corridors.
                       </p>
                     </div>

                     <div className="roadmap-step" style={{ borderColor: 'rgba(0, 242, 254, 0.4)', background: 'rgba(0, 242, 254, 0.08)' }}>
                       <span className="step-tag" style={{ color: '#00f2fe' }}>Step 4: Analytics & Prognostics</span>
                       <h4 className="step-heading">RUL & ML Studio</h4>
                       <p className="step-desc">
                         Discover driver correlations, benchmark 6 ML models, and extrapolate <b>Remaining Useful Life (RUL)</b>.
                       </p>
                     </div>
                   </div>
                 </div>

                {/* Active Selection Info */}
                <div className="overview-top-bar">
                  <div className="overview-selected-info">
                    <span className="label">Active Test Run</span>
                    <span className="value" style={{ color: 'var(--accent-cyan)' }}>
                      {files.find(f => f.id === activeTestId)?.name || 'None selected'}
                    </span>
                  </div>
                  <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }} />
                  <div className="overview-selected-info">
                    <span className="label">Active Reference</span>
                    <span className="value" style={{ color: 'var(--tag-ref-text)' }}>
                      {files.find(f => f.id === activeRefId)?.name || 'None selected'}
                    </span>
                  </div>
                </div>

                {/* Sensor Cards Grid */}
                {activeTestId ? (
                  <div className="card-grid">
                    {files.find(f => f.id === activeTestId)?.columns.map(col => {
                      const isSelected = selectedPlotCols.some(p => p.fileId === activeTestId && p.colName === col.name);
                      return (
                        <div 
                          key={col.name}
                          onClick={() => togglePlotColumn(activeTestId, col.name)}
                          className={`sensor-card ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="sensor-card-header">
                            <span className="sensor-title" title={col.name}>{col.name}</span>
                            <span className={`sensor-type-badge ${col.type === 'numeric' ? 'numeric' : 'categorical'}`}>
                              {col.type}
                            </span>
                          </div>

                          {/* Sparkline & Values */}
                          {col.type === 'numeric' && col.sparkline.length > 0 ? (
                            <div className="sensor-card-body">
                              <div className="sensor-stats">
                                <span>Min: <b>{col.min.toFixed(1)}</b></span>
                                <span>Max: <b>{col.max.toFixed(1)}</b></span>
                                <span>Mean: <b>{col.mean.toFixed(1)}</b></span>
                              </div>

                              {/* Mini SVG Sparkline */}
                              <svg className="sparkline-svg">
                                <polyline
                                  fill="none"
                                  stroke={isSelected ? '#00f2fe' : '#64748b'}
                                  strokeWidth="1.5"
                                  points={col.sparkline.map((val, idx) => {
                                    const x = (idx / (col.sparkline.length - 1)) * 80;
                                    const maxS = Math.max(...col.sparkline);
                                    const minS = Math.min(...col.sparkline);
                                    const denom = maxS - minS || 1;
                                    const norm = (val - minS) / denom;
                                    const y = 26 - norm * 24;
                                    return `${x},${y}`;
                                  }).join(' ')}
                                />
                              </svg>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '10px 0' }}>
                              {col.type === 'categorical' ? 'Categorical Data' : 'Empty Profile'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ height: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                    <Info size={28} />
                    <span style={{ fontSize: '0.8rem' }}>Please select or upload a Test Run to view sensor channels.</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* VIEW 2: VISUAL REPORT (FEATURE 1 UPGRADE) */}
        {activeView === 'visualizer' && (
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <VisualReportView
              files={files}
              selectedPlotCols={selectedPlotCols}
              onChangeSelectedPlotCols={setSelectedPlotCols}
            />
          </React.Suspense>
        )}

        {/* VIEW 3: COLUMN ALIGNMENT (FEATURE 2 UPGRADE - PRESERVED STATE) */}
        <div style={{ display: activeView === 'alignment' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', width: '100%', flexDirection: 'column' }}>
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <ColumnAlignmentView
              files={files}
              activeRefId={activeRefId}
              activeTestId={activeTestId}
              onSelectRefId={(id) => {
                setActiveRefId(id);
                updateTag(id, 'reference');
              }}
              onSelectTestId={setActiveTestId}
              mappings={mappings}
              setMappings={setMappings}
              onRunSimilarityEngine={() => {
                setActiveView('compare');
                runAnalysis();
              }}
            />
          </React.Suspense>
        </div>

        {/* VIEW 4: BASELINE ENGINE (FEATURE 3 UPGRADE - PRESERVED STATE) */}
        <div style={{ display: activeView === 'baseline' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', width: '100%', flexDirection: 'column' }}>
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <BaselineEngineView
              files={files}
              mappings={mappings}
              isActive={activeView === 'baseline'}
            />
          </React.Suspense>
        </div>

        {/* VIEW 5: SIMILARITY COMPARISON */}
        {activeView === 'compare' && (
          <div className="compare-layout">
            
            {/* Left Column Mapping Card Board */}
            <div className="glass-panel">
              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <h2>Interactive Column Alignment</h2>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Drag Test Cards from the bottom pool and drop them into Reference Slots.
                </p>
              </div>

              <div className="panel-body-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
                {activeRefId && activeTestId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    
                    {/* Mapping Rows Board */}
                    <div className="mapping-board">
                      {files.find(f => f.id === activeRefId)?.columns.map(refCol => {
                        const mappedTestCol = mappings[refCol.name];
                        return (
                          <div key={refCol.name} className="mapping-row">
                            <div className="mapping-source">
                              Reference: <span>{refCol.name}</span>
                            </div>
                            
                            <div className="mapping-connector">
                              <div className="mapping-arrow-symbol">➔</div>
                              
                              {/* Drop Slot */}
                              <div 
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add('drag-over');
                                }}
                                onDragLeave={(e) => {
                                  e.currentTarget.classList.remove('drag-over');
                                }}
                                onDrop={(e) => {
                                  e.currentTarget.classList.remove('drag-over');
                                  handleDropToSlot(e, refCol.name);
                                }}
                                className="mapping-target-slot"
                              >
                                {mappedTestCol ? (
                                  <div 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, mappedTestCol)}
                                    className="draggable-card"
                                  >
                                    <span className="draggable-card-text">{mappedTestCol}</span>
                                    <button 
                                      onClick={() => {
                                        const newMappings = { ...mappings, [refCol.name]: '' };
                                        setMappings(newMappings);
                                        setUnmappedPool([...unmappedPool, mappedTestCol]);
                                      }}
                                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Drop Test Card Here
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Available Draggable Pool */}
                    <div className="draggable-pool-container">
                      <div className="draggable-pool-title">Draggable Test Sensors</div>
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDropToPool}
                        className="draggable-pool"
                      >
                        {unmappedPool.map(testCol => (
                          <div 
                            key={testCol}
                            draggable
                            onDragStart={(e) => handleDragStart(e, testCol)}
                            className="pool-card"
                            title={testCol}
                          >
                            {testCol}
                          </div>
                        ))}
                        {unmappedPool.length === 0 && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 'auto', fontStyle: 'italic' }}>
                            All sensors aligned
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Analyze Button */}
                    <button 
                      onClick={runAnalysis}
                      disabled={isAnalyzing}
                      className="btn btn-primary"
                      style={{ marginTop: '16px', padding: '10px 0', fontSize: '0.8rem', width: '100%' }}
                    >
                      {isAnalyzing ? (
                        <RefreshCw className="animate-spin" size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      <span>Run Similarity Engine</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ height: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                    <Info size={28} />
                    <span style={{ fontSize: '0.8rem' }}>Select Reference and Test runs on Dashboard to align.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Comparison & Report Columns */}
            <div className="glass-panel">
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
                {Object.keys(similarityResults).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    
                    {/* Similarity Status Grid */}
                    <div className="results-header-scroll">
                      {Object.entries(similarityResults).map(([colName, res]) => (
                        <div 
                          key={colName}
                          onClick={() => setSelectedResultCol(colName)}
                          className={`result-tab-btn ${selectedResultCol === colName ? 'active' : ''}`}
                        >
                          <span className="result-tab-title" title={colName}>{colName}</span>
                          {res.error ? (
                            <span style={{ fontSize: '0.65rem', color: '#f87171', marginTop: '6px' }}>Error</span>
                          ) : (
                            <div className="result-tab-footer">
                              <span className="result-tab-score">{(res.score * 100).toFixed(0)}%</span>
                              <span className={`similarity-badge ${
                                res.category === 'match' ? 'match' : res.category === 'similar' ? 'similar' : 'nomatch'
                              }`}>
                                {res.category}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Report Detail View */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {selectedResultCol && similarityResults[selectedResultCol] && !similarityResults[selectedResultCol].error ? (
                        (() => {
                          const res = similarityResults[selectedResultCol];
                          const feedbackLogged = feedbacks[`${activeRefId}_${activeTestId}_${selectedResultCol}`];
                          
                          return (
                            <div className="results-detail-grid">
                              {/* Visuals & Curves */}
                              <div>
                                {/* KPI Metric Cards Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                                  <KpiCard
                                    title="Similarity Index"
                                    value={`${(res.score * 100).toFixed(0)}%`}
                                    status={res.category === 'match' ? 'success' : res.category === 'similar' ? 'warning' : 'danger'}
                                    delta={{
                                      value: `${(res.score * 100 - 85).toFixed(0)}%`,
                                      isPositiveGood: true,
                                      label: 'vs 85% threshold'
                                    }}
                                    subtitle={res.category.toUpperCase()}
                                  />
                                  <KpiCard
                                    title="Shape (Pearson r)"
                                    value={`${(res.pearson * 100).toFixed(0)}%`}
                                    status={res.pearson >= 0.8 ? 'success' : 'warning'}
                                    icon={<HelpPopover topic="pearson" />}
                                    subtitle="Dynamic sync"
                                  />
                                  <KpiCard
                                    title="Time Alignment (DTW)"
                                    value={`${(res.dtw * 100).toFixed(0)}%`}
                                    status={res.dtw >= 0.8 ? 'success' : 'warning'}
                                    icon={<HelpPopover topic="fastdtw" />}
                                    subtitle="Warping score"
                                  />
                                  <KpiCard
                                    title="Signal Offset (Lag)"
                                    value={`${res.lag}`}
                                    unit="steps"
                                    status={Math.abs(res.lag) > 10 ? 'warning' : 'normal'}
                                    subtitle={`Max ${res.max_ref.toFixed(1)} / ${res.max_test.toFixed(1)}`}
                                  />
                                </div>

                                {/* Comparison ECharts with Header & CSV Export */}
                                <div className="chart-wrapper-compare" style={{ position: 'relative' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <Activity size={14} className="text-accent-cyan" />
                                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
                                        Normalized Waveform Overlay: {selectedResultCol}
                                      </span>
                                    </div>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={exportComparisonCsv}
                                      title="Export waveform comparison data to CSV"
                                    >
                                      <Download size={12} />
                                      <span>Export CSV</span>
                                    </Button>
                                  </div>

                                  {isAnalyzing ? (
                                    <div style={{ padding: 20 }}>
                                      <Skeleton height={260} />
                                    </div>
                                  ) : (
                                    <ReactECharts
                                      option={getComparisonChartOption(selectedResultCol)}
                                      style={{ height: '300px', width: '100%' }}
                                      theme="dark"
                                    />
                                  )}
                                </div>

                                {/* Gauges Grid */}
                                <div className="gauges-grid" style={{ marginTop: '12px' }}>
                                  <div className="gauge-card">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span className="label">Shape Correlation</span>
                                      <HelpPopover topic="pearson" />
                                    </div>
                                    <p className="value">{(res.pearson * 100).toFixed(0)}%</p>
                                    <div className="gauge-bar-track">
                                      <div className="gauge-bar-fill" style={{ width: `${Math.max(0, Math.min(100, res.pearson * 100))}%`, backgroundColor: '#3b82f6' }} />
                                    </div>
                                  </div>

                                  <div className="gauge-card">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span className="label">Time Alignment (DTW)</span>
                                      <HelpPopover topic="fastdtw" />
                                    </div>
                                    <p className="value">{(res.dtw * 100).toFixed(0)}%</p>
                                    <div className="gauge-bar-track">
                                      <div className="gauge-bar-fill" style={{ width: `${Math.max(0, Math.min(100, res.dtw * 100))}%`, backgroundColor: '#00f2fe' }} />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Reports & AI explanation panel */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="ai-report-box">
                                  <h4>AI Engineering Assessment</h4>
                                  <p 
                                    className="ai-report-text"
                                    dangerouslySetInnerHTML={{ __html: res.explanation.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }}
                                  />
                                </div>

                                {/* Physical Offsets Card */}
                                <div className="metric-summary-card">
                                  <div className="metric-summary-title">Physical Signal Offsets</div>
                                  <div className="metric-row">
                                    <span className="metric-label">Time Shift (Lag):</span>
                                    <span className="metric-value">{res.lag} steps</span>
                                  </div>
                                  <div className="metric-row">
                                    <span className="metric-label">Reference Max Value:</span>
                                    <span className="metric-value">{res.max_ref.toFixed(2)}</span>
                                  </div>
                                  <div className="metric-row">
                                    <span className="metric-label">Test Max Value:</span>
                                    <span className="metric-value">{res.max_test.toFixed(2)}</span>
                                  </div>
                                </div>

                                {/* Feedback Module */}
                                <div className="feedback-card">
                                  <span className="feedback-title">Verify AI Judgment</span>
                                  
                                  {feedbackLogged ? (
                                    <div className="feedback-saved-indicator">
                                      <Check size={14} />
                                      <span>Verdict logged: Marked as {feedbackLogged.verdict}</span>
                                    </div>
                                  ) : (
                                    <>
                                      <textarea
                                        value={feedbackComment}
                                        onChange={(e) => setFeedbackComment(e.target.value)}
                                        placeholder="Add engineering notes/comments..."
                                        className="feedback-textarea"
                                      />
                                      <div className="feedback-btn-row">
                                        <button 
                                          onClick={() => logFeedback(selectedResultCol, 'correct')}
                                          className="feedback-action-btn correct"
                                        >
                                          <ThumbsUp size={12} />
                                          <span>Correct</span>
                                        </button>
                                        <button 
                                          onClick={() => logFeedback(selectedResultCol, 'incorrect')}
                                          className="feedback-action-btn incorrect"
                                        >
                                          <ThumbsDown size={12} />
                                          <span>Incorrect</span>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                            </div>
                          );
                        })()
                      ) : (
                        <div style={{ height: '70%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {selectedResultCol && similarityResults[selectedResultCol]?.error 
                            ? similarityResults[selectedResultCol].error 
                            : 'Select a channel above to read its report details.'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ height: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                    <Activity size={32} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
                    <span style={{ fontSize: '0.8rem' }}>Perform mapping and run the similarity engine to see results.</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* VIEW 6: ANALYTICS & ML STUDIO (FEATURE 4) */}
        <div style={{ display: activeView === 'analytics' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', width: '100%', flexDirection: 'column' }}>
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <AnalyticsView
              files={files}
              isActive={activeView === 'analytics'}
              onFilesUpdate={(updatedFiles) => setFiles(updatedFiles)}
            />
          </React.Suspense>
        </div>

      </main>
      </div>

      {/* Settings Modal Dialog */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings & Similarity Configuration"
        maxWidth={580}
        footer={
          <Button variant="primary" size="sm" onClick={() => setShowSettings(false)}>
            Close Settings
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
            Configure similarity engine parameters, metric weights, and external integrations below:
          </p>

          {/* Accordion 1: Similarity Decision Thresholds */}
          <details className="settings-accordion" id="settings-accordion-thresholds">
            <summary>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={15} style={{ color: 'var(--accent-cyan)' }} />
                <span>Similarity Decision Thresholds</span>
              </div>
              <ChevronDown size={14} className="accordion-chevron" />
            </summary>
            <div className="settings-accordion-content">
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
                Choose strictness of pattern matching. Lower numbers match more leniently; higher numbers require near-identical curves.
              </p>
              <div className="settings-field">
                <span className="settings-label">Match Threshold: <b>&gt;= {(settings.matchThreshold * 100).toFixed(0)}%</b></span>
                <input 
                  type="range" min="0.5" max="1.0" step="0.05"
                  value={settings.matchThreshold}
                  onChange={(e) => setSettings({ ...settings, matchThreshold: parseFloat(e.target.value) })}
                  className="range-input"
                  aria-label="Match Threshold"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                  Scores &gt;= this get a green <b>MATCH</b> badge.
                </span>
              </div>
              <div className="settings-field" style={{ marginTop: '8px' }}>
                <span className="settings-label">Similar Threshold: <b>&gt;= {(settings.similarThreshold * 100).toFixed(0)}%</b></span>
                <input 
                  type="range" min="0.3" max="0.8" step="0.05"
                  value={settings.similarThreshold}
                  onChange={(e) => setSettings({ ...settings, similarThreshold: parseFloat(e.target.value) })}
                  className="range-input"
                  aria-label="Similar Threshold"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                  Scores between Match and Similar get a yellow <b>SIMILAR</b> badge. Below this is flagged as <b>NO MATCH</b>.
                </span>
              </div>
            </div>
          </details>

          {/* Accordion 2: Metric Weight Distribution */}
          <details className="settings-accordion" id="settings-accordion-weights">
            <summary>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={15} style={{ color: 'var(--accent-blue)' }} />
                <span>Metric Weight Distribution</span>
              </div>
              <ChevronDown size={14} className="accordion-chevron" />
            </summary>
            <div className="settings-accordion-content">
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
                Balance shape correlation (Pearson) with dynamic time warping flexibility (FastDTW).
              </p>
              <div className="settings-field">
                <span className="settings-label">Pearson (Shape Sync): <b>{(settings.wPearson * 100).toFixed(0)}%</b></span>
                <input 
                  type="range" min="0" max="1.0" step="0.1"
                  value={settings.wPearson}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSettings({ ...settings, wPearson: val, wDtw: 1.0 - val });
                  }}
                  className="range-input"
                  aria-label="Pearson Shape Sync Weight"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                  Emphasizes exact second-by-second synchronized rise and fall.
                </span>
              </div>
              <div className="settings-field" style={{ marginTop: '8px' }}>
                <span className="settings-label">DTW (Time Warp Alignment): <b>{(settings.wDtw * 100).toFixed(0)}%</b></span>
                <input 
                  type="range" min="0" max="1.0" step="0.1"
                  value={settings.wDtw}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSettings({ ...settings, wDtw: val, wPearson: 1.0 - val });
                  }}
                  className="range-input"
                  aria-label="DTW Alignment Weight"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                  Accommodates latency offsets and speed variations.
                </span>
              </div>
            </div>
          </details>

          {/* Accordion 3: Enterprise Integrations */}
          <details className="settings-accordion" id="settings-accordion-integrations">
            <summary>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cloud size={15} style={{ color: 'var(--color-info)' }} />
                <span>Enterprise Integrations</span>
              </div>
              <ChevronDown size={14} className="accordion-chevron" />
            </summary>
            <div className="settings-accordion-content">
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
                Automated report exports and generative AI summaries.
              </p>
              <div className="settings-field">
                <span className="settings-label">OneDrive Local Sync Folder</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text"
                    value={settings.oneDrivePath}
                    onChange={(e) => setSettings({ ...settings, oneDrivePath: e.target.value })}
                    className="settings-input-text"
                    aria-label="OneDrive Local Sync Folder"
                  />
                  <button 
                    onClick={exportWorkspaceToOneDrive}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Sync
                  </button>
                </div>
              </div>
              <div className="settings-field" style={{ marginTop: '8px' }}>
                <span className="settings-label">Gemini API Key (Optional)</span>
                <input 
                  type="password"
                  placeholder="Enter API Key..."
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  className="settings-input-text"
                  aria-label="Gemini API Key"
                />
              </div>
            </div>
          </details>
        </div>
      </Modal>

      {/* Guide Modal Dialog */}
      <Modal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={20} style={{ color: 'var(--accent-cyan)' }} />
            <span>SensorLens Step-by-Step Diagnostic Guide</span>
          </div>
        }
        maxWidth={640}
        footer={
          <Button variant="primary" size="md" onClick={() => setShowGuide(false)} style={{ width: '100%' }}>
            Got it, let's get started!
          </Button>
        }
      >
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-3)' }}>
          SensorLens compares sensor data runs to see if a test matches an expected baseline pattern. Learn how to use it in 6 quick steps:
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div className="guide-step">
            <div className="guide-step-num">1</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Upload Excel Logs</div>
              <div className="guide-step-desc">
                Click <b>Upload Run</b> to load telemetry CSV or DAT logs from your computer.
              </div>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">2</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Set Reference and Test Files</div>
              <div className="guide-step-desc">
                Choose one run as <b>Ref</b> (the baseline pattern) and another as <b>Test</b> (the run to verify).
              </div>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">3</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Align Sensors</div>
              <div className="guide-step-desc">
                Go to the <b>Column Alignment</b> tab to auto-match or resolve mismatched header names across files.
              </div>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">4</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Build Baseline Envelope</div>
              <div className="guide-step-desc">
                Use <b>Baseline Engine</b> to compute Mean ± 3σ corridors across normal reference batches.
              </div>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">5</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Run Similarity Engine</div>
              <div className="guide-step-desc">
                Check <b>Similarity Matcher</b> for Pearson correlation shape sync and DTW warping patterns.
              </div>
            </div>
          </div>

          <div className="guide-step highlight" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
            <div className="guide-step-num" style={{ background: 'var(--accent-cyan)', color: '#031024' }}>6</div>
            <div className="guide-step-content">
              <div className="guide-step-title">Analytics & ML Studio</div>
              <div className="guide-step-desc">
                Compute correlation heatmaps, PCA dimensionality reduction, target driver rankings, and Remaining Useful Life (RUL) projections.
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Global Command Palette (Ctrl/Cmd + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectView={navigateToView}
        files={files}
        onSelectSensor={(sensorName) => {
          if (files.length > 0) {
            const firstWithCol = files.find(f => f.columns.some(c => c.name === sensorName));
            if (firstWithCol) {
              setSelectedPlotCols(prev => {
                const exists = prev.some(p => p.fileId === firstWithCol.id && p.colName === sensorName);
                if (exists) return prev;
                return [...prev, { fileId: firstWithCol.id, colName: sensorName, fileName: firstWithCol.name }];
              });
            }
          }
          navigateToView('visualizer');
        }}
        onSelectFile={(fileId) => {
          setActiveTestId(fileId);
          navigateToView('dashboard');
        }}
        onOpenUpload={() => fileInputRef.current?.click()}
        onExportSession={triggerLocalJsonDownload}
        onOpenGuide={() => setShowGuide(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
    </div>
  );
}

