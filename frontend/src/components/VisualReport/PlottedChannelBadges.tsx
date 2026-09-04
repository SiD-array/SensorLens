import React from 'react';
import { X } from 'lucide-react';
import type { SelectedPlotCol } from './SensorSelector';

export const TRACE_COLORS = [
  '#00f2fe', '#818cf8', '#34d399', '#fbbf24', '#f43f5e', 
  '#a855f7', '#38bdf8', '#fb923c', '#4ade80', '#c084fc',
  '#2dd4bf', '#f87171'
];

export function getChannelColor(index: number): string {
  return TRACE_COLORS[index % TRACE_COLORS.length];
}

interface PlottedChannelBadgesProps {
  selectedPlotCols: SelectedPlotCol[];
  onRemove: (fileId: string, colName: string) => void;
  onClearAll: () => void;
}

export const PlottedChannelBadges: React.FC<PlottedChannelBadgesProps> = ({
  selectedPlotCols,
  onRemove,
  onClearAll
}) => {
  if (selectedPlotCols.length === 0) return null;

  return (
    <div className="plotted-badges-strip">
      <div className="plotted-badges-scroll">
        {selectedPlotCols.map((item, idx) => {
          const color = getChannelColor(idx);
          return (
            <div 
              key={`${item.fileId}_${item.colName}`} 
              className="channel-badge"
              style={{ borderColor: `${color}66` }}
            >
              <span 
                className="channel-badge-swatch"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}aa` }}
              />
              <span className="channel-badge-text" title={`${item.fileName ? item.fileName + ': ' : ''}${item.colName}`}>
                {item.colName}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.fileId, item.colName);
                }}
                className="channel-badge-remove-btn"
                title={`Remove ${item.colName}`}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <button 
        onClick={onClearAll}
        className="badge-clear-all-btn"
        title="Clear all plotted channels"
      >
        Clear ({selectedPlotCols.length})
      </button>
    </div>
  );
};
