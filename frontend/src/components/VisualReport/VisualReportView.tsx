import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Sparkles, SlidersHorizontal, Info } from 'lucide-react';
import type { TestFile } from '../../types/baseline';
import { SensorSelector } from './SensorSelector';
import type { SelectedPlotCol } from './SensorSelector';
import { PlottedChannelBadges, getChannelColor } from './PlottedChannelBadges';

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

    selectedPlotCols.forEach((sel, idx) => {
      const file = files.find(f => f.id === sel.fileId);
      if (!file) return;
      const col = file.columns.find(c => c.name === sel.colName);
      if (!col) return;

      const seriesName = `${file.name.replace(/\.[^/.]+$/, '')}: ${col.name}`;
      legendNames.push(seriesName);

      const color = getChannelColor(idx);
      const dataPoints = col.sparkline.map((val, ptIdx) => [ptIdx, val]);

      seriesList.push({
        name: seriesName,
        type: chartType,
        data: dataPoints,
        smooth: chartType === 'line',
        symbolSize: chartType === 'scatter' ? 5 : 0,
        showSymbol: chartType === 'scatter',
        lineStyle: {
          width: 2.5,
          color: color
        },
        itemStyle: {
          color: color
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 4 }
        }
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: legendNames,
        textStyle: { color: '#ccc' },
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
        right: '5%',
        top: 4
      },
      grid: { left: '4%', right: '5%', bottom: '14%', top: '16%', containLabel: true },
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
        name: 'Time Index',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      yAxis: {
        type: 'value',
        name: 'Sensor Reading',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
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
      <main className="workbench-main glass-panel">
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

        {/* Large ECharts Visualizer Canvas */}
        <div className="workbench-canvas">
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
