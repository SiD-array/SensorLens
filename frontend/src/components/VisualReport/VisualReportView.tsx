import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Sparkles, SlidersHorizontal, Info, Download, RotateCcw, Clock } from 'lucide-react';
import type { TestFile } from '../../types/baseline';
import { SensorSelector } from './SensorSelector';
import type { SelectedPlotCol } from './SensorSelector';
import { PlottedChannelBadges, getChannelColor } from './PlottedChannelBadges';
import { Button, KpiCard } from '../ui';
import { exportToCsv, SENSORLENS_CHART_THEME } from '../../utils/chartTheme';

interface VisualReportViewProps {
  files: TestFile[];
  selectedPlotCols: SelectedPlotCol[];
  onChangeSelectedPlotCols: (updated: SelectedPlotCol[]) => void;
}

export const VisualReportView: React.FC<VisualReportViewProps> = ({
  files,
  selectedPlotCols,
  onChangeSelectedPlotCols
}) => {
  const [chartType, setChartType] = useState<'line' | 'scatter' | 'bar'>('line');
  const [xAxisSensor, setXAxisSensor] = useState<string>('__time__');

  // Collect all available numeric sensors across uploaded runs
  const availableSensors = useMemo(() => {
    const sensorSet = new Set<string>();
    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => {
        sensorSet.add(c.name);
      });
    });
    return Array.from(sensorSet).sort();
  }, [files]);

  // Compute summary metrics across plotted channels
  const summaryMetrics = useMemo(() => {
    if (selectedPlotCols.length === 0) return null;
    let maxMean = -Infinity;
    let maxMeanCol = '';
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let totalPoints = 0;

    selectedPlotCols.forEach(sel => {
      const file = files.find(f => f.id === sel.fileId);
      const col = file?.columns.find(c => c.name === sel.colName);
      if (col) {
        if (col.mean > maxMean) {
          maxMean = col.mean;
          maxMeanCol = col.name;
        }
        if (col.min < globalMin) globalMin = col.min;
        if (col.max > globalMax) globalMax = col.max;
        const ptCount = (col.data && col.data.length > 0) ? col.data.length : col.sparkline.length;
        totalPoints = Math.max(totalPoints, ptCount);
      }
    });

    return {
      activeCount: selectedPlotCols.length,
      maxMean: maxMean !== -Infinity ? maxMean.toFixed(1) : '—',
      maxMeanCol,
      range: globalMax !== -Infinity && globalMin !== Infinity ? `${globalMin.toFixed(0)} → ${globalMax.toFixed(0)}` : '—',
      totalPoints,
    };
  }, [selectedPlotCols, files]);

  // Export plotted data to CSV
  const handleExportCsv = () => {
    if (selectedPlotCols.length === 0) return;
    const maxPts = Math.max(
      ...selectedPlotCols.map(sel => {
        const file = files.find(f => f.id === sel.fileId);
        const col = file?.columns.find(c => c.name === sel.colName);
        return (col?.data && col.data.length > 0) ? col.data.length : (col?.sparkline.length || 0);
      })
    );

    const xHeader = xAxisSensor === '__time__' ? 'Time_Seconds' : `X_${xAxisSensor}`;
    const headers = [xHeader, ...selectedPlotCols.map(s => `${s.fileName || s.fileId}_${s.colName}`)];
    const rows: (string | number)[][] = [];

    // Fallback file for X sensor if needed
    const fallbackXFile = xAxisSensor !== '__time__' ? files.find(f => f.columns.some(c => c.name === xAxisSensor)) : null;
    const fallbackXCol = fallbackXFile?.columns.find(c => c.name === xAxisSensor);
    const fallbackXData = (fallbackXCol?.data && fallbackXCol.data.length > 0) ? fallbackXCol.data : (fallbackXCol?.sparkline || []);

    for (let i = 0; i < maxPts; i++) {
      let xVal: number | string = i;
      if (xAxisSensor !== '__time__') {
        xVal = fallbackXData[i] !== undefined ? fallbackXData[i] : i;
      }
      const row: (string | number)[] = [xVal];
      selectedPlotCols.forEach(sel => {
        const file = files.find(f => f.id === sel.fileId);
        const col = file?.columns.find(c => c.name === sel.colName);
        const colData = (col?.data && col.data.length > 0) ? col.data : (col?.sparkline || []);
        row.push(colData[i] !== undefined ? colData[i] : '');
      });
      rows.push(row);
    }

    exportToCsv('visual_report_sensor_telemetry', headers, rows);
  };

  // Remove single badge
  const handleRemoveBadge = (fileId: string, colName: string) => {
    onChangeSelectedPlotCols(selectedPlotCols.filter(p => !(p.fileId === fileId && p.colName === colName)));
  };

  // Clear all
  const handleClearAll = () => {
    onChangeSelectedPlotCols([]);
  };

  // Quick preset buttons for empty state
  const handleQuickPreset = (presetName: string) => {
    const matched: SelectedPlotCol[] = [];
    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => {
        const lower = c.name.toLowerCase();
        let match = false;
        if (presetName === 'thermal' && (lower.startsWith('temp') || lower.startsWith('t_'))) match = true;
        if (presetName === 'motor' && (lower.startsWith('speed') || lower.startsWith('motor') || lower.startsWith('rpm') || lower.startsWith('pwr') || lower.startsWith('power'))) match = true;
        if (presetName === 'pressure' && (lower.startsWith('press') || lower.startsWith('p_') || lower.startsWith('flow') || lower.startsWith('f_'))) match = true;

        if (match && !matched.some(m => m.fileId === f.id && m.colName === c.name)) {
          matched.push({ fileId: f.id, colName: c.name, fileName: f.name });
        }
      });
    });

    if (matched.length > 0) {
      onChangeSelectedPlotCols(matched);
    } else if (files.length > 0 && files[0].columns.length > 0) {
      // Fallback: select first 2 columns
      const firstF = files[0];
      const numCols = firstF.columns.filter(c => c.type === 'numeric').slice(0, 3);
      onChangeSelectedPlotCols(numCols.map(c => ({ fileId: firstF.id, colName: c.name, fileName: firstF.name })));
    }
  };

  // Build ECharts Option
  const getEChartsOption = () => {
    if (selectedPlotCols.length === 0) return {};

    const legendNames: string[] = [];
    const seriesList: any[] = [];

    // Global fallback for X-axis sensor if a specific file doesn't have it
    const globalXCol = xAxisSensor !== '__time__'
      ? files.flatMap(f => f.columns).find(c => c.name === xAxisSensor)
      : null;

    selectedPlotCols.forEach((sel, idx) => {
      const file = files.find(f => f.id === sel.fileId);
      if (!file) return;
      const col = file.columns.find(c => c.name === sel.colName);
      if (!col) return;

      const seriesName = `${file.name.replace(/\.[^/.]+$/, '')}: ${col.name}`;
      legendNames.push(seriesName);

      const color = getChannelColor(idx);
      
      const rawValues = (col.data && col.data.length > 0) ? col.data : col.sparkline;

      // Resolve X values: Time in seconds (row/data points) or sensor values from the file
      let dataPoints: [number, number][];
      if (xAxisSensor === '__time__') {
        dataPoints = rawValues.map((val, ptIdx) => [ptIdx, val]);
      } else {
        const fileXCol = file.columns.find(c => c.name === xAxisSensor) || globalXCol;
        const xValues = (fileXCol?.data && fileXCol.data.length > 0) ? fileXCol.data : (fileXCol?.sparkline || []);
        dataPoints = rawValues.map((val, ptIdx) => {
          const xVal = xValues[ptIdx] !== undefined ? xValues[ptIdx] : ptIdx;
          return [xVal, val];
        });
      }

      seriesList.push({
        name: seriesName,
        type: chartType,
        data: dataPoints,
        smooth: false, // Maintain authentic sensor precision without bezier smoothing distortion
        symbolSize: chartType === 'scatter' ? 5 : (dataPoints.length > 400 ? 0 : 2),
        showSymbol: chartType === 'scatter' || dataPoints.length <= 60,
        lineStyle: {
          width: 2.2,
          color: color
        },
        itemStyle: {
          color: color
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.5 }
        }
      });
    });

    const isTimeX = xAxisSensor === '__time__';
    const xAxisTitle = isTimeX 
      ? 'Time (Seconds) [Row / Data Points]' 
      : `${xAxisSensor} [Sensor Reading]`;

    return {
      ...SENSORLENS_CHART_THEME,
      tooltip: {
        ...SENSORLENS_CHART_THEME.tooltip,
        trigger: isTimeX ? 'axis' : 'item',
        axisPointer: { type: 'cross', lineStyle: { color: '#00f2fe', type: 'dashed' } },
        formatter: isTimeX ? (params: any) => {
          if (!params) return '';
          const items = Array.isArray(params) ? params : [params];
          if (items.length === 0) return '';
          const firstVal = items[0].value;
          const timeSec = Array.isArray(firstVal) ? firstVal[0] : (items[0].dataIndex ?? 0);
          let html = `<div style="font-size:12px;padding:4px 6px;line-height:1.5;min-width:160px">
            <div style="font-weight:600;color:#00f2fe;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px">
              ⏱️ Time: ${timeSec}s <span style="font-size:11px;color:#94a3b8">(Row ${timeSec + 1})</span>
            </div>`;
          items.forEach((item: any) => {
            const val = Array.isArray(item.value) ? item.value[1] : item.value;
            html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
                <span style="color:#cbd5e1;font-size:11px">${item.seriesName}</span>
              </span>
              <b style="color:var(--text-primary, #fff);font-family:JetBrains Mono, monospace">${typeof val === 'number' ? val.toFixed(3) : val}</b>
            </div>`;
          });
          html += `</div>`;
          return html;
        } : (params: any) => {
          const valX = Array.isArray(params.value) ? params.value[0] : params.value;
          const valY = Array.isArray(params.value) ? params.value[1] : '';
          return `<div style="font-size:12px;padding:3px 6px;line-height:1.5">
            <div style="font-weight:600;color:#00f2fe;margin-bottom:2px">${params.seriesName}</div>
            <div style="color:#94a3b8">X (${xAxisSensor}): <b style="color:var(--text-primary, #fff)">${typeof valX === 'number' ? valX.toFixed(3) : valX}</b></div>
            <div style="color:#94a3b8">Y (Value): <b style="color:var(--text-primary, #fff)">${typeof valY === 'number' ? valY.toFixed(3) : valY}</b></div>
          </div>`;
        }
      },
      legend: {
        data: legendNames,
        textStyle: { color: '#cbd5e1', fontSize: 12 },
        selectedMode: true,
        type: 'scroll',
        top: 4
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
        top: 4
      },
      grid: { left: '4%', right: '5%', bottom: '14%', top: '16%', containLabel: true },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: 0,
          textStyle: { color: '#94a3b8', fontSize: 11 },
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
          textStyle: { color: '#94a3b8', fontSize: 11 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          fillerColor: 'rgba(99, 102, 241, 0.2)',
          handleStyle: { color: '#818cf8' }
        },
        { type: 'inside', yAxisIndex: 0 }
      ],
      xAxis: {
        ...SENSORLENS_CHART_THEME.xAxis,
        type: 'value',
        name: xAxisTitle,
        nameTextStyle: { color: '#94a3b8', fontSize: 12 },
        axisLabel: { color: '#94a3b8', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        ...SENSORLENS_CHART_THEME.yAxis,
        type: 'value',
        name: 'Sensor Reading [Units]',
        nameTextStyle: { color: '#94a3b8', fontSize: 12 },
        axisLabel: { color: '#94a3b8', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      },
      series: seriesList
    };
  };

  return (
    <div className="visual-report-workbench">
      
      {/* Left Sidebar: Organized Sensor Selector & Presets */}
      <aside className="workbench-sidebar glass-panel">
        <div className="sidebar-header-bar">
          <div className="sidebar-title-row">
            <SlidersHorizontal size={16} className="text-accent-cyan" />
            <span className="sidebar-title">Sensor Selector</span>
          </div>
          <span className="channels-total-badge">
            {files.reduce((acc, f) => acc + f.columns.filter(c => c.type === 'numeric').length, 0)} Total
          </span>
        </div>

        <SensorSelector 
          files={files}
          selectedPlotCols={selectedPlotCols}
          onChangeSelected={onChangeSelectedPlotCols}
        />
      </aside>

      {/* Right Main Stage: Plotted Badges & Full-Height Chart */}
      <main className="workbench-main glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Stage Header Toolbar */}
        <div className="stage-toolbar">
          <div className="stage-badges-container">
            {selectedPlotCols.length > 0 ? (
              <PlottedChannelBadges 
                selectedPlotCols={selectedPlotCols}
                onRemove={handleRemoveBadge}
                onClearAll={handleClearAll}
              />
            ) : (
              <div className="no-badges-placeholder">
                <Info size={14} className="text-muted" />
                <span>Select channels from the left panel to overlay on the graph</span>
              </div>
            )}
          </div>

          <div className="stage-controls-group">
            {/* X-Axis Selector Dropdown */}
            <div className="x-axis-selector-wrapper">
              <label htmlFor="visual-xaxis-select" className="x-axis-selector-label">
                <Clock size={12} className="text-accent-cyan" />
                <span>X-Axis:</span>
              </label>
              <select
                id="visual-xaxis-select"
                value={xAxisSensor}
                onChange={(e) => setXAxisSensor(e.target.value)}
                className="x-axis-select"
                title="Select horizontal X-axis: Time in seconds or any sensor from uploaded runs"
              >
                <option value="__time__">⏱️ Time in Seconds [Data Points / Rows] (Default)</option>
                {availableSensors.map(sensor => (
                  <option key={sensor} value={sensor}>📈 {sensor}</option>
                ))}
              </select>
              {xAxisSensor !== '__time__' && (
                <button
                  onClick={() => setXAxisSensor('__time__')}
                  className="x-axis-reset-btn"
                  title="Reset horizontal axis to Time in Seconds"
                >
                  <RotateCcw size={12} />
                  <span>Time (s)</span>
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={selectedPlotCols.length === 0}
              title="Export plotted sensor channels to CSV"
            >
              <Download size={12} />
              <span>Export CSV</span>
            </Button>

            <div className="graph-type-selector">
              {(['line', 'scatter', 'bar'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`graph-type-btn ${chartType === t ? 'active' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards Row above visualizer canvas */}
        {summaryMetrics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', padding: '10px 16px 0 16px' }}>
            <KpiCard
              title="Active Traces"
              value={summaryMetrics.activeCount}
              subtitle="Overlay channels"
              status="info"
            />
            <KpiCard
              title="Max Channel Mean"
              value={summaryMetrics.maxMean}
              subtitle={summaryMetrics.maxMeanCol || 'Peak average'}
            />
            <KpiCard
              title="Dynamic Range"
              value={summaryMetrics.range}
              subtitle="Global Min → Max"
            />
            <KpiCard
              title="Sample Depth"
              value={summaryMetrics.totalPoints.toLocaleString()}
              unit="pts"
              subtitle="Max trace length"
            />
          </div>
        )}

        {/* Large ECharts Visualizer Canvas */}
        <div className="workbench-canvas" style={{ flex: 1, minHeight: 0 }}>
          {selectedPlotCols.length > 0 ? (
            <ReactECharts
              option={getEChartsOption()}
              notMerge={true}
              lazyUpdate={true}
              style={{ height: '100%', width: '100%' }}
              theme="dark"
            />
          ) : (
            <div className="chart-empty-state">
              <Activity size={44} className="empty-state-icon" />
              <h3 className="empty-state-title">No sensor channels active in plot</h3>
              <p className="empty-state-desc">
                Select channels from the left or load a diagnostic preset to visualize waveforms:
              </p>
              
              <div className="quick-preset-buttons-row">
                <button 
                  onClick={() => handleQuickPreset('thermal')}
                  className="quick-preset-btn"
                >
                  <Sparkles size={13} />
                  <span>Thermal Cycle Preset</span>
                </button>
                <button 
                  onClick={() => handleQuickPreset('motor')}
                  className="quick-preset-btn"
                >
                  <Sparkles size={13} />
                  <span>Motor & Power Preset</span>
                </button>
                <button 
                  onClick={() => handleQuickPreset('pressure')}
                  className="quick-preset-btn"
                >
                  <Sparkles size={13} />
                  <span>Pressure / Flow Preset</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
};
