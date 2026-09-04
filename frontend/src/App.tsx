import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Upload, Settings, Activity, Trash2, Download, 
  UploadCloud, ThumbsUp, ThumbsDown, Play, Info, 
  RefreshCw, X, Check, Lightbulb
} from 'lucide-react';
import { VisualReportView } from './components/VisualReport/VisualReportView';
import { ColumnAlignmentView } from './components/ColumnAlignment/ColumnAlignmentView';
import { BaselineEngineView } from './components/Baseline/BaselineEngineView';


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
  // App States
  const [files, setFiles] = useState<TestFile[]>([]);
  const [activeTestId, setActiveTestId] = useState<string>('');
  const [activeRefId, setActiveRefId] = useState<string>('');
  
  // Library Mapping Drag and Drop
  const [mappings, setMappings] = useState<Record<string, string>>({}); // ref_col -> test_col
  const [unmappedPool, setUnmappedPool] = useState<string[]>([]);
  
  // Similarity Results
  const [similarityResults, setSimilarityResults] = useState<Record<string, SimilarityResult>>({});
  const [selectedResultCol, setSelectedResultCol] = useState<string>('');
  
  const [selectedPlotCols, setSelectedPlotCols] = useState<Array<{ fileId: string; colName: string; fileName?: string }>>([]);
  
  // UI Panels / Views
  const [activeView, setActiveView] = useState<'dashboard' | 'visualizer' | 'alignment' | 'baseline' | 'compare'>('dashboard');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  
  // Settings Config
  const [settings, setSettings] = useState({
    matchThreshold: 0.85,
    similarThreshold: 0.60,
    wPearson: 0.5,
    wDtw: 0.5,
    oneDrivePath: 'C:\\Users\\sidb9\\OneDrive - BSH\\SensorLensReports',
    apiKey: ''
  });
  
  // Settings Config
  
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

  // Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesUploaded = e.target.files;
    if (!filesUploaded || filesUploaded.length === 0) return;
    
    setIsUploading(true);
    const updatedFiles = [...files];
    
    for (let i = 0; i < filesUploaded.length; i++) {
      const file = filesUploaded[i];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const err = await response.json();
          alert(`Error uploading ${file.name}: ${err.detail}`);
          continue;
        }
        const data = await response.json();
        
        // Auto-assign tags based on count
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
      } catch (err) {
        console.error(err);
        alert(`Failed to upload ${file.name}`);
      }
    }
    
    setFiles(updatedFiles);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
    if (activeTestId === id) setActiveTestId('');
    if (activeRefId === id) setActiveRefId('');
  };

  const updateTag = (id: string, tag: 'useful' | 'reviewable' | 'reference' | 'archive') => {
    setFiles(files.map(f => {
      if (f.id === id) {
        if (tag === 'reference') {
          // If setting a new reference, demote the old reference to useful
          return { ...f, tag };
        }
        return { ...f, tag };
      }
      // If we made something else reference, remove old reference tag
      if (tag === 'reference' && f.tag === 'reference') {
        return { ...f, tag: 'useful' };
      }
      return f;
    }));

    if (tag === 'reference') {
      setActiveRefId(id);
    }
  };

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
        alert(`Analysis failed: ${err.detail}`);
        setIsAnalyzing(false);
        return;
      }

      const data = await response.json();
      setSimilarityResults(data.results);
      
      // Auto select first mapped result column
      const firstCol = Object.keys(data.results)[0];
      if (firstCol) setSelectedResultCol(firstCol);
    } catch (e) {
      console.error(e);
      alert('Network error analyzing similarity');
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
      alert('Feedback logged successfully!');
      setFeedbackComment('');
    } catch (e) {
      console.error(e);
    }
  };

  const exportWorkspaceToOneDrive = async () => {
    const sessionPayload = {
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        tag: f.tag,
        columns: f.columns
      })),
      tags: files.reduce((acc, f) => ({ ...acc, [f.id]: f.tag }), {}),
      mappings,
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

    try {
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
        alert(`Workspace successfully exported to target folder!\n\nJSON: ${data.saved_json}\nMarkdown: ${data.saved_markdown}`);
      } else {
        const err = await response.json();
        alert(`Failed to save to OneDrive: ${err.detail}`);
      }
    } catch (e) {
      alert('Export failed due to network error.');
    }
  };

  const triggerLocalJsonDownload = () => {
    const sessionPayload = {
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        tag: f.tag,
        columns: f.columns
      })),
      tags: files.reduce((acc, f) => ({ ...acc, [f.id]: f.tag }), {}),
      mappings,
      saved_reports: [
        {
          ref_file_id: activeRefId,
          test_file_id: activeTestId,
          results: similarityResults
        }
      ]
    };

    const blob = new Blob([JSON.stringify(sessionPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensorlens_session_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportWorkspace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const state = JSON.parse(event.target?.result as string);
        
        // Push raw metadata into backend cache
        const response = await fetch('http://localhost:8000/api/workspace/import-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });

        if (response.ok) {
          // Reconstruct frontend states
          const importedFiles = (state.files || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            rowCount: f.rowCount || 100,
            columns: f.columns || [],
            tag: state.tags?.[f.id] || 'useful'
          }));

          setFiles(importedFiles);
          
          // Reconstruct selections
          const ref = importedFiles.find((f: any) => f.tag === 'reference');
          if (ref) setActiveRefId(ref.id);
          
          const test = importedFiles.find((f: any) => f.tag === 'useful');
          if (test) setActiveTestId(test.id);

          setMappings(state.mappings || {});
          
          if (state.saved_reports && state.saved_reports[0]) {
            setSimilarityResults(state.saved_reports[0].results || {});
            const firstCol = Object.keys(state.saved_reports[0].results || {})[0];
            if (firstCol) setSelectedResultCol(firstCol);
          }
          
          alert('Workspace imported successfully!');
        } else {
          alert('Import failed: Backend could not ingest cache.');
        }
      } catch (err) {
        alert('Invalid workspace session JSON file.');
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
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['Expected Reference', 'Test Run'],
        textStyle: { color: '#ccc' }
      },
      grid: { left: '3%', right: '4%', bottom: '5%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#aaa' },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      series: [
        {
          name: 'Expected Reference',
          type: 'line',
          data: refSeries,
          smooth: true,
          lineStyle: { width: 3, color: '#818cf8' },
          itemStyle: { color: '#818cf8' },
          emphasis: { focus: 'series' }
        },
        {
          name: 'Test Run',
          type: 'line',
          data: testSeries,
          smooth: true,
          lineStyle: { width: 3, color: '#00f2fe' },
          itemStyle: { color: '#00f2fe' },
          emphasis: { focus: 'series' }
        }
      ]
    };
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
    <div className="app-container">
      {/* Top Navbar */}
      <header className="header">
        <div className="brand">
          <Activity className="brand-icon" size={28} />
          <div className="brand-text">
            <h1 className="brand-title">SensorLens</h1>
            <p className="brand-subtitle">Generic BSH Diagnostic Analyzer</p>
          </div>
        </div>

        {/* View Toggles */}
        <div className="view-toggles">
          <button 
            onClick={() => setActiveView('dashboard')}
            className={`toggle-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => {
              setActiveView('visualizer');
              // Auto populate chart selection if empty
              if (selectedPlotCols.length === 0 && files.length > 0) {
                const firstF = files[0];
                if (firstF && firstF.columns[0]) {
                  setSelectedPlotCols([{ fileId: firstF.id, colName: firstF.columns[0].name, fileName: firstF.name }]);
                }
              }
            }}
            className={`toggle-btn ${activeView === 'visualizer' ? 'active' : ''}`}
          >
            Visual Report
          </button>
          <button 
            onClick={() => setActiveView('alignment')}
            className={`toggle-btn ${activeView === 'alignment' ? 'active' : ''}`}
          >
            Column Alignment
          </button>
          <button 
            onClick={() => setActiveView('baseline')}
            className={`toggle-btn ${activeView === 'baseline' ? 'active' : ''}`}
          >
            Baseline Engine
          </button>
          <button 
            onClick={() => setActiveView('compare')}
            className={`toggle-btn ${activeView === 'compare' ? 'active' : ''}`}
          >
            Similarity Matcher
          </button>
        </div>

        {/* Configuration Actions */}
        <div className="header-actions">
          <button 
            onClick={() => setShowGuide(true)}
            className="btn"
            title="How to Use Guide"
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <Info size={14} />
            <span>Guide</span>
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-icon"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          
          <button 
            onClick={triggerLocalJsonDownload}
            className="btn"
            title="Download Workspace JSON"
          >
            <Download size={14} />
            <span>Export Session</span>
          </button>

          <button 
            onClick={() => workspaceInputRef.current?.click()}
            className="btn"
            title="Upload Workspace JSON"
          >
            <UploadCloud size={14} />
            <span>Import</span>
          </button>
          
          <input 
            type="file" 
            ref={workspaceInputRef} 
            onChange={handleImportWorkspace} 
            accept=".json" 
            className="hidden" 
          />
        </div>
      </header>

      {/* Main Settings Modal Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-group">
            <h3>Similarity Decision Thresholds</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
              Choose how strict the matching is. Lower numbers are easier to match; higher numbers require lines to look almost identical.
            </p>
            <div className="settings-field">
              <span className="settings-label">Match Threshold: <b>&gt;= {(settings.matchThreshold * 100).toFixed(0)}%</b></span>
              <input 
                type="range" min="0.5" max="1.0" step="0.05"
                value={settings.matchThreshold}
                onChange={(e) => setSettings({ ...settings, matchThreshold: parseFloat(e.target.value) })}
                className="range-input"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                If a score is higher than this, it gets a green <b>MATCH</b> badge (like puzzle pieces that fit perfectly!).
              </span>
            </div>
            <div className="settings-field" style={{ marginTop: '8px' }}>
              <span className="settings-label">Similar Threshold: <b>&gt;= {(settings.similarThreshold * 100).toFixed(0)}%</b></span>
              <input 
                type="range" min="0.3" max="0.8" step="0.05"
                value={settings.similarThreshold}
                onChange={(e) => setSettings({ ...settings, similarThreshold: parseFloat(e.target.value) })}
                className="range-input"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                Scores between Match and this get a yellow <b>SIMILAR</b> badge (requires verification). Scores below this get a red <b>NO MATCH</b> warning.
              </span>
            </div>
          </div>

          <div className="settings-group">
            <h3>Metric Weight Distribution</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
              Tell the app whether wave shape timing is more important than pattern speed flexibility.
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
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                Focuses on timing. Moving this slider up means the curves must go up/down at the exact same second, like synchronized dancers.
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
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                Focuses on pattern. Moving this up allows starting delays or speed changes, as long as the overall wave looks the same (like a song played slower).
              </span>
            </div>
          </div>

          <div className="settings-group">
            <h3>Enterprise Integrations</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.3' }}>
              Where to save your reports and how to connect smart features.
            </p>
            <div className="settings-field">
              <span className="settings-label">OneDrive Local Sync Folder</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text"
                  value={settings.oneDrivePath}
                  onChange={(e) => setSettings({ ...settings, oneDrivePath: e.target.value })}
                  className="settings-input-text"
                />
                <button 
                  onClick={exportWorkspaceToOneDrive}
                  className="btn btn-primary"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Sync
                </button>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                Saves report summaries to this folder so your team's Copilot AI can automatically read and index them.
              </span>
            </div>
            <div className="settings-field" style={{ marginTop: '8px' }}>
              <span className="settings-label">Gemini API Key (Optional)</span>
              <input 
                type="password"
                placeholder="Enter API Key..."
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                className="settings-input-text"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                Enter an API key to turn on generative AI summaries. If blank, we generate detailed assessments using local math.
              </span>
            </div>
          </div>
          <button 
            onClick={() => setShowSettings(false)}
            className="settings-close-btn"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1" style={{ position: 'relative', overflow: 'hidden' }}>
        
        {/* VIEW 1: DASHBOARD */}
        {activeView === 'dashboard' && (
          <div className="dashboard-layout">
            
            {/* Left Library Column */}
            <div className="glass-panel">
              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <h2>Test Run Library</h2>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Upload Excel logs. Select one run as <b>Ref</b> (Reference) and another as <b>Test</b> to compare.
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="btn btn-primary"
                >
                  {isUploading ? <RefreshCw className="animate-spin" size={12} /> : <Upload size={12} />}
                  <span>Upload Excel</span>
                </button>
                <input 
                  type="file" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".xlsx,.xls" 
                  className="hidden" 
                />
              </div>

              <div className="panel-body">
                {/* Upload Drop Zone fallback */}
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
                      background: 'rgba(255, 255, 255, 0.01)'
                    }}
                  >
                    <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>No files ingested yet</p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>Upload sensor Excel sheets</p>
                  </div>
                )}

                {/* Files List */}
                {files.length > 0 && (
                  <div className="file-list">
                    {files.map(f => (
                      <div 
                        key={f.id} 
                        className={`file-card ${
                          activeTestId === f.id ? 'active-test' : activeRefId === f.id ? 'active-ref' : ''
                        }`}
                      >
                        <div className="file-card-header">
                          <div style={{ overflow: 'hidden' }}>
                            <p className="file-title" title={f.name}>{f.name}</p>
                            <p className="file-meta">{f.rowCount} rows • {f.columns.length} channels</p>
                          </div>
                          <button 
                            onClick={() => deleteFile(f.id)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
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
                            >
                              Test
                            </button>
                            <button 
                              onClick={() => {
                                setActiveRefId(f.id);
                                updateTag(f.id, 'reference');
                              }}
                              className={`selection-btn ${activeRefId === f.id ? 'active-ref-btn' : ''}`}
                            >
                              Ref
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Live Dashboard Summary Grid */}
            <div className="glass-panel">
              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <h2 style={{ fontSize: '1rem', color: '#fff' }}>Live Channel Overview</h2>
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
                      <span className="roadmap-title">System Architecture: How the 3 Engines Connect</span>
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
                        Merge <i>multiple</i> reference runs into an averaged <b>Golden Standard</b>. Shaded tolerance corridors flag defects in <b>bright red</b>!
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
        )}

        {/* VIEW 2: VISUAL REPORT (FEATURE 1 UPGRADE) */}
        {activeView === 'visualizer' && (
          <VisualReportView
            files={files}
            selectedPlotCols={selectedPlotCols}
            onChangeSelectedPlotCols={setSelectedPlotCols}
          />
        )}

        {/* VIEW 3: COLUMN ALIGNMENT (FEATURE 2 UPGRADE) */}
        {activeView === 'alignment' && (
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
        )}

        {/* VIEW 4: BASELINE ENGINE (FEATURE 3 UPGRADE) */}
        {activeView === 'baseline' && (
          <BaselineEngineView
            files={files}
          />
        )}

        {/* VIEW 3: SIMILARITY COMPARISON */}
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
                                {/* Comparison ECharts */}
                                <div className="chart-wrapper-compare">
                                  <ReactECharts
                                    option={getComparisonChartOption(selectedResultCol)}
                                    style={{ height: '100%', width: '100%' }}
                                    theme="dark"
                                  />
                                </div>

                                {/* Gauges Grid */}
                                <div className="gauges-grid">
                                  <div className="gauge-card">
                                    <span className="label">Similarity Index</span>
                                    <p className="value">{(res.score * 100).toFixed(0)}%</p>
                                    <span className={`similarity-badge ${
                                      res.category === 'match' ? 'match' : res.category === 'similar' ? 'similar' : 'nomatch'
                                    }`}>
                                      {res.category}
                                    </span>
                                  </div>
                                  
                                  <div className="gauge-card">
                                    <span className="label">Shape Correlation</span>
                                    <p className="value">{(res.pearson * 100).toFixed(0)}%</p>
                                    <div className="gauge-bar-track">
                                      <div className="gauge-bar-fill" style={{ width: `${res.pearson * 100}%`, backgroundColor: '#818cf8' }} />
                                    </div>
                                  </div>

                                  <div className="gauge-card">
                                    <span className="label">Time Alignment</span>
                                    <p className="value">{(res.dtw * 100).toFixed(0)}%</p>
                                    <div className="gauge-bar-track">
                                      <div className="gauge-bar-fill" style={{ width: `${res.dtw * 100}%`, backgroundColor: '#00f2fe' }} />
                                    </div>
                                  </div>
                                </div>
                                <div className="info-card" style={{ marginTop: '16px' }}>
                                  💡 <b>What do these gauges mean?</b>
                                  <br />• <b>Similarity Index:</b> Combined score of shape timing and overall likeness.
                                  <br />• <b>Shape Correlation (Pearson):</b> Measures if the curves rise and fall at the exact same times (like synchronized dancers).
                                  <br />• <b>Time Alignment (DTW):</b> Measures overall shape likeness, ignoring starting delays or speed changes (like a song played slower).
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

      </main>

      {showGuide && (
        <div className="guide-modal-overlay">
          <div className="guide-modal">
            <h2 style={{ fontSize: '1.2rem', color: '#fff', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={22} style={{ color: 'var(--accent-cyan)' }} />
              <span>SensorLens Easy Step-by-Step Guide</span>
            </h2>
            
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              SensorLens compares sensor data runs to see if a test matches an expected baseline pattern. Learn how to use it in 5 quick steps:
            </p>
            
            <div className="guide-step">
              <div className="guide-step-num">1</div>
              <div className="guide-step-content">
                <div className="guide-step-title">Upload Excel Logs</div>
                <div className="guide-step-desc">
                  Click <b>Upload Excel</b> to load your test runs from your computer.
                </div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-num">2</div>
              <div className="guide-step-content">
                <div className="guide-step-title">Set Reference and Test Files</div>
                <div className="guide-step-desc">
                  Choose one run as <b>Ref</b> (the perfect baseline pattern you want to match) and another as <b>Test</b> (the run you want to verify).
                </div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-num">3</div>
              <div className="guide-step-content">
                <div className="guide-step-title">Align Sensors (Drag & Drop)</div>
                <div className="guide-step-desc">
                  Go to the <b>Similarity Matcher</b> tab. Drag the Test cards from the bottom pool and drop them next to the Reference slots. The app automatically suggests pairings!
                </div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-num">4</div>
              <div className="guide-step-content">
                <div className="guide-step-title">Run Similarity Engine</div>
                <div className="guide-step-desc">
                  Click <b>Run Similarity Engine</b>. Shape Correlation checks if peaks rise/fall together. Time Alignment stretches/compresses lines to look for pattern matches regardless of starting delays.
                </div>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-num">5</div>
              <div className="guide-step-content">
                <div className="guide-step-title">Verify AI Report & Verdict</div>
                <div className="guide-step-desc">
                  Click any channel header to inspect graphs, see starting delays or peak height differences, read the engineering assessment, and thumbs-up the verdict.
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowGuide(false)}
              className="btn btn-primary"
              style={{ marginTop: '8px', padding: '12px 0', fontSize: '0.85rem', width: '100%' }}
            >
              Let's Start Matching!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
