import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, LayoutDashboard, LineChart, ArrowLeftRight, 
  Sparkles, GitCompare, BrainCircuit, FileText, Database, 
  Settings, Info, Download, UploadCloud, X
} from 'lucide-react';
import type { ViewType } from './AppSidebar';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Views' | 'Runs' | 'Sensors' | 'Actions';
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  onSelect: () => void;
}


interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView: (view: ViewType) => void;
  files: Array<{ id: string; name: string; columns: Array<{ name: string }> }>;
  onSelectSensor?: (sensorName: string) => void;
  onSelectFile?: (fileId: string) => void;
  onOpenUpload?: () => void;
  onExportSession?: () => void;
  onOpenGuide?: () => void;
  onOpenSettings?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectView,
  files,
  onSelectSensor,
  onSelectFile,
  onOpenUpload,
  onExportSession,
  onOpenGuide,
  onOpenSettings,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global Ctrl/Cmd + K hotkey listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // If called from outside, handled by caller
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build searchable items
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Views
    items.push(
      {
        id: 'view-dashboard',
        title: 'Dashboard',
        subtitle: 'Telemetry files overview and active run selection',
        category: 'Views',
        icon: LayoutDashboard,
        onSelect: () => onSelectView('dashboard')
      },
      {
        id: 'view-visualizer',
        title: 'Visual Report',
        subtitle: 'Interactive multi-axis time-series visualization',
        category: 'Views',
        icon: LineChart,
        onSelect: () => onSelectView('visualizer')
      },
      {
        id: 'view-alignment',
        title: 'Column Alignment',
        subtitle: 'Cross-file schema matching and column pairing',
        category: 'Views',
        icon: ArrowLeftRight,
        onSelect: () => onSelectView('alignment')
      },
      {
        id: 'view-baseline',
        title: 'Baseline Engine',
        subtitle: 'Tolerance corridors, envelope bounds, and multi-run baselines',
        category: 'Views',
        icon: Sparkles,
        onSelect: () => onSelectView('baseline')
      },
      {
        id: 'view-compare',
        title: 'Similarity Matcher',
        subtitle: 'Pearson & DTW automated pattern matching diagnostics',
        category: 'Views',
        icon: GitCompare,
        onSelect: () => onSelectView('compare')
      },
      {
        id: 'view-analytics',
        title: 'Analytics & ML Studio',
        subtitle: 'Correlation matrix, PCA, target drivers, degradation analytics',
        category: 'Views',
        icon: BrainCircuit,
        onSelect: () => onSelectView('analytics')
      }
    );

    // Uploaded Files / Runs
    files.forEach((file) => {
      items.push({
        id: `file-${file.id}`,
        title: file.name,
        subtitle: `${file.columns.length} channels loaded`,
        category: 'Runs',
        icon: Database,
        onSelect: () => {
          if (onSelectFile) onSelectFile(file.id);
          onSelectView('dashboard');
        }
      });
    });

    // Unique sensor channels across files
    const seenSensors = new Set<string>();
    files.forEach((file) => {
      file.columns.forEach((col) => {
        if (!seenSensors.has(col.name) && seenSensors.size < 40) {
          seenSensors.add(col.name);
          items.push({
            id: `sensor-${col.name}`,
            title: col.name,
            subtitle: `Sensor channel (from ${file.name})`,
            category: 'Sensors',
            icon: FileText,
            onSelect: () => {
              if (onSelectSensor) onSelectSensor(col.name);
              onSelectView('visualizer');
            }
          });
        }
      });
    });

    // Actions
    if (onOpenUpload) {
      items.push({
        id: 'action-upload',
        title: 'Upload Telemetry Runs',
        subtitle: 'Load CSV or DAT telemetry files into workspace',
        category: 'Actions',
        icon: UploadCloud,
        onSelect: onOpenUpload
      });
    }

    if (onExportSession) {
      items.push({
        id: 'action-export',
        title: 'Export Workspace Session',
        subtitle: 'Download complete state as sensorlens_session.json',
        category: 'Actions',
        icon: Download,
        onSelect: onExportSession
      });
    }

    if (onOpenGuide) {
      items.push({
        id: 'action-guide',
        title: 'Open User Guide',
        subtitle: 'Feature walkthrough and diagnostic reference guide',
        category: 'Actions',
        icon: Info,
        onSelect: onOpenGuide
      });
    }

    if (onOpenSettings) {
      items.push({
        id: 'action-settings',
        title: 'Configure Settings',
        subtitle: 'Adjust similarity weights and export paths',
        category: 'Actions',
        icon: Settings,
        onSelect: onOpenSettings
      });
    }

    return items;
  }, [files, onSelectView, onSelectFile, onSelectSensor, onOpenUpload, onExportSession, onOpenGuide, onOpenSettings]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 15);
    return allItems
      .filter((item) => 
        item.title.toLowerCase().includes(q) || 
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [allItems, query]);

  // Keyboard navigation within results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.onSelect();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.cmd-palette-item.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="cmd-palette-backdrop" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette search"
    >
      <div 
        className="cmd-palette-card" 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Box */}
        <div className="cmd-palette-input-box">
          <Search size={18} style={{ color: 'var(--accent-cyan)' }} />
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="Type a command, view, run, or sensor name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-autocomplete="list"
            id="cmd-palette-search-input"
          />
          {query ? (
            <button 
              type="button"
              className="ui-icon-btn ui-icon-btn-xs" 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="cmd-kbd-badge">ESC to close</kbd>
          )}
        </div>

        {/* Results List */}
        <div className="cmd-palette-list" ref={listRef} role="listbox">
          {filteredItems.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No results found for "{query}".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`cmd-palette-item ${isSelected ? 'active' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="cmd-item-left">
                    <Icon size={16} style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                    <div>
                      <div style={{ fontWeight: 'var(--weight-medium)', color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="cmd-kbd-badge" style={{ fontSize: 9, opacity: 0.8 }}>
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="cmd-palette-footer">
          <div style={{ display: 'flex', gap: 12 }}>
            <span><kbd className="cmd-kbd-badge">↑</kbd> <kbd className="cmd-kbd-badge">↓</kbd> navigate</span>
            <span><kbd className="cmd-kbd-badge">↵</kbd> select</span>
            <span><kbd className="cmd-kbd-badge">esc</kbd> close</span>
          </div>
          <div>SensorLens Navigation</div>
        </div>
      </div>
    </div>
  );
};
