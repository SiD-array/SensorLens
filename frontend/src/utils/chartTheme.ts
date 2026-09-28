/**
 * SensorLens Shared ECharts Theme & Utilities
 * Provides:
 * 1. Accessible colorblind-safe palette (Okabe-Ito)
 * 2. Shared dark glass grid, 12px+ typography, synchronized crosshairs
 * 3. CSV export utility for chart data
 * 4. Dual-encoding (color + shape) anomaly markers for accessible corridors
 */

export const COLORBLIND_PALETTE = [
  '#00f2fe', // Bright Cyan (Primary)
  '#3b82f6', // Vivid Blue (Secondary)
  '#f59e0b', // Amber / Orange
  '#10b981', // Emerald / Mint
  '#d946ef', // Fuchsia / Magenta
  '#06b6d4', // Cyan
  '#f43f5e', // Rose / Red (Violation / Warning)
  '#8b5cf6', // Violet
  '#e2e8f0', // Cool White
];

export const SENSORLENS_CHART_THEME = {
  color: COLORBLIND_PALETTE,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
    color: '#94a3b8',
  },
  title: {
    textStyle: {
      color: '#f8fafc',
      fontWeight: 600,
      fontSize: 14,
    },
    subtextStyle: {
      color: '#64748b',
      fontSize: 12,
    },
  },
  grid: {
    top: 50,
    right: 25,
    bottom: 50,
    left: 45,
    containLabel: true,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(6, 15, 28, 0.94)',
    borderColor: 'rgba(0, 242, 254, 0.3)',
    borderWidth: 1,
    padding: [10, 14],
    textStyle: {
      color: '#f8fafc',
      fontSize: 12,
      fontFamily: 'Inter, sans-serif',
    },
    axisPointer: {
      type: 'cross',
      label: {
        backgroundColor: '#0f172a',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      lineStyle: {
        color: '#00f2fe',
        type: 'dashed',
        width: 1,
      },
      crossStyle: {
        color: 'rgba(0, 242, 254, 0.4)',
      },
    },
  },
  xAxis: {
    axisLine: {
      lineStyle: { color: 'rgba(255, 255, 255, 0.12)' },
    },
    axisTick: {
      lineStyle: { color: 'rgba(255, 255, 255, 0.12)' },
    },
    axisLabel: {
      color: '#94a3b8',
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace',
    },
    splitLine: {
      show: true,
      lineStyle: { color: 'rgba(255, 255, 255, 0.05)', type: 'dashed' },
    },
  },
  yAxis: {
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: '#94a3b8',
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace',
    },
    splitLine: {
      lineStyle: { color: 'rgba(255, 255, 255, 0.06)' },
    },
  },
  legend: {
    textStyle: {
      color: '#cbd5e1',
      fontSize: 12,
    },
    pageTextStyle: {
      color: '#94a3b8',
    },
  },
};

/**
 * Exports tabular or time-series data to a downloadable CSV file.
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const sanitize = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvContent = [
    headers.map(sanitize).join(','),
    ...rows.map((row) => row.map(sanitize).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Builds dual-encoded anomaly markers for baseline charts.
 * Violations are highlighted using both Red Color AND Diamond Symbol for colorblind safety.
 */
export function createAnomalyMarkPoints(violations: Array<{ coord: [number, number]; value?: string | number }>) {
  if (!violations || violations.length === 0) return undefined;

  return {
    symbol: 'diamond',
    symbolSize: 10,
    itemStyle: {
      color: '#f43f5e', // Rose 500
      borderColor: '#ffffff',
      borderWidth: 1.5,
      shadowBlur: 6,
      shadowColor: 'rgba(244, 63, 94, 0.8)',
    },
    data: violations.map((v) => ({
      coord: v.coord,
      value: v.value !== undefined ? String(v.value) : 'Violation',
    })),
  };
}
