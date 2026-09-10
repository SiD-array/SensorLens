import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Bookmark, Plus, Trash2, CheckSquare, 
  Square, ChevronDown, ChevronRight, X,
  Folder, ArrowRightLeft, Check
} from 'lucide-react';
import type { TestFile, ChannelPreset } from '../../types/baseline';
import type { SensorBucket, SensorBucketMap } from './bucketUtils';
import { 
  loadBuckets, saveBuckets, 
  loadBucketMap, saveBucketMap, resolveSensorBucket 
} from './bucketUtils';
import { BucketManagerModal } from './BucketManagerModal';

export interface SelectedPlotCol {
  fileId: string;
  colName: string;
  fileName?: string;
}

interface SensorSelectorProps {
  files: TestFile[];
  selectedPlotCols: SelectedPlotCol[];
  onChangeSelected: (updated: SelectedPlotCol[]) => void;
  onApplyPreset?: (presetName: string) => void;
}

const STORAGE_PRESETS_KEY = 'sensorlens_channel_presets';

export const SensorSelector: React.FC<SensorSelectorProps> = ({
  files,
  selectedPlotCols,
  onChangeSelected
}) => {
  const [activeTab, setActiveTab] = useState<'available' | 'selected'>('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [presets, setPresets] = useState<ChannelPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [newPresetName, setNewPresetName] = useState('');
  const [showNewPresetInput, setShowNewPresetInput] = useState(false);

  // User-Configurable Sensor Buckets & Mapping State
  const [buckets, setBuckets] = useState<SensorBucket[]>(() => loadBuckets());
  const [bucketMap, setBucketMap] = useState<SensorBucketMap>(() => loadBucketMap());
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [quickMoveColName, setQuickMoveColName] = useState<string | null>(null);

  // Load presets from localStorage with sensible defaults
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS_KEY);
      if (saved) {
        setPresets(JSON.parse(saved));
      } else {
        const defaultPresets: ChannelPreset[] = [
          {
            id: 'preset_thermal',
            name: 'Thermal Cycle Diagnostic',
            channelNames: ['Temp_Zone1', 'T_Sensor_ZoneA', 'Temp', 'Temperature'],
            created: new Date().toISOString()
          },
          {
            id: 'preset_motor',
            name: 'Motor Drive Analysis',
            channelNames: ['Speed_B', 'Flow_Rate', 'Flow_Rate_Sensor', 'Power_C', 'Motor_Speed_rpm', 'Heater_Power_W'],
            created: new Date().toISOString()
          },
          {
            id: 'preset_pressure',
            name: 'Hydraulic / Pressure Loop',
            channelNames: ['Pressure_Zone1', 'P_Sensor_1', 'Pressure_Main'],
            created: new Date().toISOString()
          }
        ];
        setPresets(defaultPresets);
        localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(defaultPresets));
      }
    } catch (e) {
      console.error('Failed to load presets', e);
    }
  }, []);

  const savePresets = (newPresets: ChannelPreset[]) => {
    setPresets(newPresets);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(newPresets));
    } catch (e) {
      console.error('Failed to save presets', e);
    }
  };

  // Bucket Updates
  const handleUpdateBuckets = (newBuckets: SensorBucket[]) => {
    setBuckets(newBuckets);
    saveBuckets(newBuckets);
  };

  const handleUpdateBucketMap = (newMap: SensorBucketMap) => {
    setBucketMap(newMap);
    saveBucketMap(newMap);
  };

  // Quick In-line Reassignment
  const handleQuickMoveSensor = (colName: string, bucketId: string) => {
    const updated = { ...bucketMap, [colName]: bucketId };
    setBucketMap(updated);
    saveBucketMap(updated);
    setQuickMoveColName(null);
  };

  // Unique list of all available sensor names
  const allSensorNames = useMemo(() => {
    const names = new Set<string>();
    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => names.add(c.name));
    });
    return Array.from(names);
  }, [files]);

  // Extract all available channels across all loaded files, resolved against user buckets
  const allAvailableChannels = useMemo(() => {
    const list: Array<{
      fileId: string;
      fileName: string;
      fileTag: string;
      colName: string;
      category: string;
      bucketId: string;
      bucketColor: string;
      isCustom: boolean;
      min: number;
      max: number;
      mean: number;
    }> = [];

    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => {
        const bucket = resolveSensorBucket(c.name, buckets, bucketMap);
        list.push({
          fileId: f.id,
          fileName: f.name,
          fileTag: f.tag,
          colName: c.name,
          category: bucket.name,
          bucketId: bucket.id,
          bucketColor: bucket.color,
          isCustom: !bucket.isDefault,
          min: c.min,
          max: c.max,
          mean: c.mean
        });
      });
    });
    return list;
  }, [files, buckets, bucketMap]);

  // Filter channels based on search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return allAvailableChannels;
    const q = searchQuery.toLowerCase().trim();
    return allAvailableChannels.filter(item => 
      item.colName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.fileName.toLowerCase().includes(q)
    );
  }, [allAvailableChannels, searchQuery]);

  // Group filtered channels by User-Configured Buckets
  const groupedCategories = useMemo(() => {
    const groups: Array<{
      bucket: SensorBucket;
      items: typeof filteredChannels;
    }> = [];

    buckets.forEach(b => {
      const matched = filteredChannels.filter(it => it.bucketId === b.id);
      // Include bucket if it has matching items, or if user created it and no search is active
      if (matched.length > 0 || (!searchQuery.trim() && !b.isDefault)) {
        groups.push({
          bucket: b,
          items: matched
        });
      }
    });

    return groups;
  }, [buckets, filteredChannels, searchQuery]);

  const toggleCategoryCollapse = (bucketId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [bucketId]: !prev[bucketId] }));
  };

  const isSelected = (fileId: string, colName: string) => {
    return selectedPlotCols.some(p => p.fileId === fileId && p.colName === colName);
  };

  const toggleChannel = (fileId: string, colName: string, fileName: string) => {
    if (isSelected(fileId, colName)) {
      onChangeSelected(selectedPlotCols.filter(p => !(p.fileId === fileId && p.colName === colName)));
    } else {
      onChangeSelected([...selectedPlotCols, { fileId, colName, fileName }]);
    }
  };

  // Toggle entire category
  const toggleCategoryAll = (categoryItems: typeof filteredChannels) => {
    const allSelected = categoryItems.length > 0 && categoryItems.every(it => isSelected(it.fileId, it.colName));
    if (allSelected) {
      const removeKeys = new Set(categoryItems.map(it => `${it.fileId}_${it.colName}`));
      onChangeSelected(selectedPlotCols.filter(p => !removeKeys.has(`${p.fileId}_${p.colName}`)));
    } else {
      const currentKeys = new Set(selectedPlotCols.map(p => `${p.fileId}_${p.colName}`));
      const toAdd = categoryItems
        .filter(it => !currentKeys.has(`${it.fileId}_${it.colName}`))
        .map(it => ({ fileId: it.fileId, colName: it.colName, fileName: it.fileName }));
      onChangeSelected([...selectedPlotCols, ...toAdd]);
    }
  };

  // Select all filtered channels
  const handleSelectAllFiltered = () => {
    const newItems: SelectedPlotCol[] = [...selectedPlotCols];
    filteredChannels.forEach(ch => {
      if (!newItems.some(p => p.fileId === ch.fileId && p.colName === ch.colName)) {
        newItems.push({ fileId: ch.fileId, colName: ch.colName, fileName: ch.fileName });
      }
    });
    onChangeSelected(newItems);
  };

  // Deselect all
  const handleDeselectAll = () => {
    onChangeSelected([]);
  };

  // Apply preset
  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const found = presets.find(p => p.id === presetId);
    if (!found) return;

    const matched: SelectedPlotCol[] = [];
    allAvailableChannels.forEach(item => {
      const matchInPreset = found.channelNames.some(pName => 
        pName.toLowerCase() === item.colName.toLowerCase() ||
        item.colName.toLowerCase().includes(pName.toLowerCase()) ||
        pName.toLowerCase().includes(item.colName.toLowerCase())
      );
      if (matchInPreset && !matched.some(m => m.fileId === item.fileId && m.colName === item.colName)) {
        matched.push({ fileId: item.fileId, colName: item.colName, fileName: item.fileName });
      }
    });
    onChangeSelected(matched);
  };

  // Save current selection as a new preset
  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return;
    const names = Array.from(new Set(selectedPlotCols.map(p => p.colName)));
    const newPreset: ChannelPreset = {
      id: `preset_${Date.now()}`,
      name: newPresetName.trim(),
      channelNames: names,
      created: new Date().toISOString()
    };
    savePresets([newPreset, ...presets]);
    setSelectedPresetId(newPreset.id);
    setNewPresetName('');
    setShowNewPresetInput(false);
  };

  // Delete preset
  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    savePresets(updated);
    if (selectedPresetId === id) setSelectedPresetId('');
  };

  // Inline category creation
  const [showNewCatInline, setShowNewCatInline] = useState(false);
  const [newCatInlineName, setNewCatInlineName] = useState('');
  const [newCatInlineColor, setNewCatInlineColor] = useState('#f97316');
  const [showBulkMoveDropdown, setShowBulkMoveDropdown] = useState(false);

  const handleCreateInlineCategory = () => {
    if (!newCatInlineName.trim()) return;
    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCat = {
      id,
      name: newCatInlineName.trim(),
      color: newCatInlineColor,
      isDefault: false
    };
    const updated = [...buckets, newCat];
    handleUpdateBuckets(updated);
    setNewCatInlineName('');
    setShowNewCatInline(false);
  };

  const handleDeleteCategory = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (buckets.length <= 1) {
      alert('Cannot delete the last remaining category. At least one category must be kept.');
      return;
    }
    const catToDelete = buckets.find(b => b.id === catId);
    if (!window.confirm(`Delete category '${catToDelete?.name || ''}'? Assigned sensors will move to another category.`)) return;
    const updatedBuckets = buckets.filter(b => b.id !== catId);
    const fallbackId = updatedBuckets[0]?.id;
    const updatedMap = { ...bucketMap };
    Object.keys(updatedMap).forEach(k => {
      if (updatedMap[k] === catId) {
        if (fallbackId) updatedMap[k] = fallbackId;
        else delete updatedMap[k];
      }
    });
    handleUpdateBuckets(updatedBuckets);
    handleUpdateBucketMap(updatedMap);
  };

  const handleBulkMoveSelected = (targetBucketId: string) => {
    if (selectedPlotCols.length === 0) return;
    const updatedMap = { ...bucketMap };
    selectedPlotCols.forEach(p => {
      updatedMap[p.colName] = targetBucketId;
    });
    handleUpdateBucketMap(updatedMap);
    setShowBulkMoveDropdown(false);
  };

  return (
    <div className="sensor-selector-panel">
      {/* Top Presets Section */}
      <div className="preset-card-section">
        <div className="preset-section-header">
          <div className="preset-title">
            <Bookmark size={14} className="text-accent-cyan" />
            <span>Channel Presets</span>
          </div>
          {!showNewPresetInput ? (
            <button 
              onClick={() => setShowNewPresetInput(true)}
              disabled={selectedPlotCols.length === 0}
              className="save-preset-btn"
              title="Save current sensor selection as a new custom preset"
            >
              <Plus size={12} />
              <span>Save As Preset</span>
            </button>
          ) : null}
        </div>

        {showNewPresetInput && (
          <div className="preset-input-row" style={{ marginTop: '8px' }}>
            <input 
              type="text" 
              placeholder="e.g. Pump & Motor Analysis" 
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePreset()}
              className="preset-name-input"
              autoFocus
            />
            <button onClick={handleCreatePreset} className="btn btn-sm btn-primary">Save</button>
            <button onClick={() => setShowNewPresetInput(false)} className="btn btn-sm btn-ghost">Cancel</button>
          </div>
        )}

        <div className="preset-select-row">
          <select 
            value={selectedPresetId}
            onChange={(e) => handleApplyPreset(e.target.value)}
            className="preset-dropdown"
          >
            <option value="">-- Load a Channel Preset --</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.channelNames.length} channels)</option>
            ))}
          </select>
          {selectedPresetId && (
            <button 
              onClick={(e) => handleDeletePreset(selectedPresetId, e)}
              className="preset-del-btn"
              title="Delete selected preset"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Dual-Pane Mode Switcher Tabs */}
      <div className="selector-tabs-header">
        <button 
          onClick={() => setActiveTab('available')}
          className={`selector-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
        >
          <span>Available Channels</span>
          <span className="tab-badge">{filteredChannels.length}</span>
        </button>
        <button 
          onClick={() => setActiveTab('selected')}
          className={`selector-tab-btn ${activeTab === 'selected' ? 'active' : ''}`}
        >
          <span>Active Plotted</span>
          <span className="tab-badge highlight">{selectedPlotCols.length}</span>
        </button>
      </div>

      {/* Available Channels View */}
      {activeTab === 'available' && (
        <div className="selector-available-view">
          
          {/* Search Box + Category Actions */}
          <div className="selector-search-and-bucket-row">
            <div className="selector-search-box">
              <Search size={13} className="search-icon" />
              <input 
                type="text"
                placeholder="Filter sensors or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="selector-search-input"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="search-clear-btn">
                  <X size={12} />
                </button>
              )}
            </div>

            <button 
              onClick={() => setShowNewCatInline(!showNewCatInline)}
              className="btn-add-category-inline"
              title="Create a new sensor category"
            >
              <Plus size={13} />
              <span>Category</span>
            </button>

            <button 
              onClick={() => setIsBucketModalOpen(true)}
              className="btn-open-bucket-manager"
              title="Configure and organize sensor categories"
            >
              <Folder size={13} className="text-accent-cyan" />
              <span>Manage</span>
            </button>
          </div>

          {/* Inline Category Creator Form */}
          {showNewCatInline && (
            <div className="inline-category-creator-card">
              <div className="inline-creator-header">
                <span>Create New Sensor Category</span>
                <button onClick={() => setShowNewCatInline(false)} className="close-creator-btn">×</button>
              </div>
              <div className="inline-creator-inputs">
                <input 
                  type="text" 
                  placeholder="e.g. Critical Thermal, Motor Drive..." 
                  value={newCatInlineName}
                  onChange={(e) => setNewCatInlineName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateInlineCategory()}
                  className="inline-cat-name-input"
                  autoFocus
                />
                <div className="inline-color-dots">
                  {['#38bdf8', '#818cf8', '#34d399', '#f59e0b', '#f97316', '#f43f5e', '#a855f7', '#ec4899'].map(c => (
                    <button 
                      key={c}
                      onClick={() => setNewCatInlineColor(c)}
                      className={`inline-color-dot ${newCatInlineColor === c ? 'active' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="inline-creator-actions">
                <button onClick={handleCreateInlineCategory} className="btn-inline-submit">
                  Add Category
                </button>
                <button onClick={() => setShowNewCatInline(false)} className="btn-inline-cancel">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Buttons */}
          <div className="pane-quick-actions">
            <button 
              onClick={handleSelectAllFiltered} 
              disabled={filteredChannels.length === 0}
              className="quick-action-btn"
            >
              <CheckSquare size={12} />
              <span>Select All ({filteredChannels.length})</span>
            </button>
            <button 
              onClick={handleDeselectAll} 
              disabled={selectedPlotCols.length === 0}
              className="quick-action-btn"
            >
              <Square size={12} />
              <span>Deselect All</span>
            </button>

            {/* Bulk Move Selected Sensors to a Category */}
            {selectedPlotCols.length > 0 && (
              <div className="bulk-move-dropdown-wrapper">
                <button 
                  onClick={() => setShowBulkMoveDropdown(!showBulkMoveDropdown)}
                  className="quick-action-btn bulk-move-btn"
                  title="Move all checked sensors to a category"
                >
                  <ArrowRightLeft size={11} />
                  <span>Move ({selectedPlotCols.length}) to... ▾</span>
                </button>

                {showBulkMoveDropdown && (
                  <div className="bulk-move-popover-menu">
                    <div className="popover-heading">Move {selectedPlotCols.length} sensors to:</div>
                    {buckets.map(b => (
                      <div 
                        key={b.id} 
                        onClick={() => handleBulkMoveSelected(b.id)}
                        className="popover-option-row"
                      >
                        <span className="dot-mini" style={{ backgroundColor: b.color }} />
                        <span className="popover-opt-name">{b.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Categorized Channels List */}
          <div className="selector-categories-scroll">
            {groupedCategories.length === 0 ? (
              <div className="pane-empty-state">
                {allAvailableChannels.length === 0 
                  ? "No channels found. Please upload runs in the Dashboard first." 
                  : "No channels match your search filter."}
              </div>
            ) : (
              groupedCategories.map(({ bucket, items }) => {
                const isCollapsed = !!collapsedCategories[bucket.id];
                const selectedInGroup = items.filter(it => isSelected(it.fileId, it.colName)).length;
                const allSelected = items.length > 0 && selectedInGroup === items.length;

                return (
                  <div key={bucket.id} className="category-group">
                    <div className="category-header">
                      <div 
                        className="category-header-left"
                        onClick={() => toggleCategoryCollapse(bucket.id)}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span className="category-color-dot" style={{ backgroundColor: bucket.color }} />
                        <span className="category-name">{bucket.name}</span>
                        {!bucket.isDefault && (
                          <span className="custom-category-tag">Custom</span>
                        )}
                      </div>
                      
                      <div className="category-header-right">
                        <span className="category-count-badge">
                          {selectedInGroup > 0 ? `${selectedInGroup}/` : ''}{items.length}
                        </span>

                        {buckets.length > 1 && (
                          <button 
                            onClick={(e) => handleDeleteCategory(bucket.id, e)}
                            className="category-del-inline-btn"
                            title={`Delete category '${bucket.name}'`}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}

                        {items.length > 0 && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCategoryAll(items);
                            }}
                            className="category-toggle-all-btn"
                            title={allSelected ? "Deselect category" : "Select all in category"}
                          >
                            {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="category-items-list">
                        {items.length === 0 ? (
                          <div className="category-empty-sub">
                            No sensors assigned yet. Click "Buckets" above or move sensors here.
                          </div>
                        ) : (
                          items.map(item => {
                            const active = isSelected(item.fileId, item.colName);
                            const isPopoverOpen = quickMoveColName === item.colName;

                            return (
                              <div 
                                key={`${item.fileId}_${item.colName}`}
                                onClick={() => toggleChannel(item.fileId, item.colName, item.fileName)}
                                className={`channel-list-item ${active ? 'active' : ''}`}
                              >
                                <div className="channel-item-left">
                                  <input 
                                    type="checkbox" 
                                    checked={active} 
                                    onChange={() => {}} 
                                    className="channel-checkbox"
                                  />
                                  <div className="channel-names">
                                    <span className="channel-col-name" title={item.colName}>{item.colName}</span>
                                    <span className="channel-file-sub" title={item.fileName}>
                                      {item.fileName}
                                    </span>
                                  </div>
                                </div>

                                <div className="channel-item-right-actions" onClick={(e) => e.stopPropagation()}>
                                  <div className="channel-stats-preview">
                                    <span>{item.min.toFixed(0)}..{item.max.toFixed(0)}</span>
                                  </div>

                                  {/* Quick In-line Category Reassignment Popover */}
                                  <div className="quick-move-container">
                                    <button 
                                      onClick={() => setQuickMoveColName(isPopoverOpen ? null : item.colName)}
                                      className={`btn-quick-move-trigger ${isPopoverOpen ? 'active' : ''}`}
                                      title={`Category: ${item.category}. Click to move.`}
                                    >
                                      <span className="dot-indicator" style={{ backgroundColor: item.bucketColor }} />
                                      <ArrowRightLeft size={11} />
                                    </button>

                                    {isPopoverOpen && (
                                      <div className="quick-move-popover">
                                        <div className="popover-heading">Move to Category:</div>
                                        <div className="popover-options-list">
                                          {buckets.map(b => (
                                            <div 
                                              key={b.id}
                                              onClick={() => handleQuickMoveSensor(item.colName, b.id)}
                                              className={`popover-option-row ${b.id === item.bucketId ? 'selected' : ''}`}
                                            >
                                              <span className="dot-mini" style={{ backgroundColor: b.color }} />
                                              <span className="popover-opt-name">{b.name}</span>
                                              {b.id === item.bucketId && <Check size={11} className="text-accent-cyan" />}
                                            </div>
                                          ))}
                                        </div>
                                        <div 
                                          onClick={() => {
                                            setQuickMoveColName(null);
                                            setShowNewCatInline(true);
                                          }}
                                          className="popover-add-new-btn"
                                        >
                                          <Plus size={11} />
                                          <span>+ New Category...</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected Active Plotted Channels Tab */}
      {activeTab === 'selected' && (
        <div className="selector-selected-view">
          <div className="selected-view-header">
            <span className="selected-summary-text">
              {selectedPlotCols.length} channel{selectedPlotCols.length === 1 ? '' : 's'} overlaid on chart
            </span>
            {selectedPlotCols.length > 0 && (
              <button onClick={handleDeselectAll} className="badge-clear-all-btn">
                Clear All
              </button>
            )}
          </div>

          <div className="selected-view-list">
            {selectedPlotCols.length === 0 ? (
              <div className="pane-empty-state">
                No channels selected yet.
                <br />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Switch to the Available Channels tab or choose a Preset above.
                </span>
              </div>
            ) : (
              selectedPlotCols.map(item => (
                <div key={`${item.fileId}_${item.colName}`} className="selected-item-row">
                  <div className="selected-item-info">
                    <span className="selected-item-col" title={item.colName}>{item.colName}</span>
                    <span className="selected-item-file">{item.fileName || 'Run Channel'}</span>
                  </div>
                  <button 
                    onClick={() => onChangeSelected(selectedPlotCols.filter(p => !(p.fileId === item.fileId && p.colName === item.colName)))}
                    className="selected-item-remove"
                    title="Remove from plot"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sensor Bucket Manager Modal */}
      <BucketManagerModal 
        isOpen={isBucketModalOpen}
        onClose={() => setIsBucketModalOpen(false)}
        buckets={buckets}
        bucketMap={bucketMap}
        onUpdateBuckets={handleUpdateBuckets}
        onUpdateBucketMap={handleUpdateBucketMap}
        availableSensorNames={allSensorNames}
      />
    </div>
  );
};
