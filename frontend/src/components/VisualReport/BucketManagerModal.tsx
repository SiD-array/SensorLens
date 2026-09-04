import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Plus, Trash2, Folder, Search, 
  ArrowRight, RotateCcw, Edit2, AlertCircle
} from 'lucide-react';
import type { SensorBucket, SensorBucketMap } from './bucketUtils';
import { 
  PRESET_COLORS, DEFAULT_BUCKETS, resolveSensorBucket 
} from './bucketUtils';

interface BucketManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  buckets: SensorBucket[];
  bucketMap: SensorBucketMap;
  onUpdateBuckets: (newBuckets: SensorBucket[]) => void;
  onUpdateBucketMap: (newMap: SensorBucketMap) => void;
  availableSensorNames: string[]; // unique list of all sensor names from loaded files
}

export const BucketManagerModal: React.FC<BucketManagerModalProps> = ({
  isOpen,
  onClose,
  buckets,
  bucketMap,
  onUpdateBuckets,
  onUpdateBucketMap,
  availableSensorNames
}) => {
  const safeBuckets = useMemo(() => {
    return (buckets && buckets.length > 0) ? buckets : DEFAULT_BUCKETS;
  }, [buckets]);

  const [selectedBucketId, setSelectedBucketId] = useState<string>(safeBuckets[0]?.id || 'cat_general');
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketColor, setNewBucketColor] = useState(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  // Search filter for sensor assigner on the right
  const [sensorSearchQuery, setSensorSearchQuery] = useState('');
  const [checkedSensors, setCheckedSensors] = useState<Set<string>>(new Set());

  // Editing bucket name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');

  const currentBucket = useMemo(() => {
    return safeBuckets.find(b => b.id === selectedBucketId) || safeBuckets[0] || DEFAULT_BUCKETS[0];
  }, [safeBuckets, selectedBucketId]);

  const safeSensorNames = useMemo(() => {
    return availableSensorNames || [];
  }, [availableSensorNames]);

  // Map each available sensor to its resolved bucket
  const sensorResolutions = useMemo(() => {
    const res: Record<string, SensorBucket> = {};
    safeSensorNames.forEach(name => {
      res[name] = resolveSensorBucket(name, safeBuckets, bucketMap);
    });
    return res;
  }, [safeSensorNames, safeBuckets, bucketMap]);

  // Sensors currently assigned to the active bucket
  const assignedSensors = useMemo(() => {
    return safeSensorNames.filter(name => sensorResolutions[name]?.id === currentBucket?.id);
  }, [safeSensorNames, sensorResolutions, currentBucket]);

  // Sensors available to be added to this bucket
  const otherSensors = useMemo(() => {
    const list = availableSensorNames.filter(name => sensorResolutions[name]?.id !== currentBucket?.id);
    if (!sensorSearchQuery.trim()) return list;
    const q = sensorSearchQuery.toLowerCase().trim();
    return list.filter(name => name.toLowerCase().includes(q));
  }, [availableSensorNames, sensorResolutions, currentBucket, sensorSearchQuery]);

  // Create new bucket
  const handleCreateBucket = () => {
    if (!newBucketName.trim()) return;
    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newB: SensorBucket = {
      id,
      name: newBucketName.trim(),
      color: newBucketColor,
      isDefault: false
    };
    const updated = [...buckets, newB];
    onUpdateBuckets(updated);
    setSelectedBucketId(id);
    setNewBucketName('');
    setIsCreating(false);
  };

  // Delete bucket
  const handleDeleteBucket = (id: string) => {
    const updatedBuckets = buckets.filter(b => b.id !== id);
    // Remove all mappings to this bucket
    const updatedMap = { ...bucketMap };
    Object.keys(updatedMap).forEach(key => {
      if (updatedMap[key] === id) {
        delete updatedMap[key];
      }
    });
    onUpdateBuckets(updatedBuckets);
    onUpdateBucketMap(updatedMap);
    setSelectedBucketId(updatedBuckets[0]?.id || 'cat_general');
  };

  // Rename bucket
  const handleSaveRename = () => {
    if (!editingNameValue.trim()) return;
    const updated = buckets.map(b => 
      b.id === currentBucket.id ? { ...b, name: editingNameValue.trim() } : b
    );
    onUpdateBuckets(updated);
    setIsEditingName(false);
  };

  // Change color
  const handleChangeColor = (color: string) => {
    const updated = buckets.map(b => 
      b.id === currentBucket.id ? { ...b, color } : b
    );
    onUpdateBuckets(updated);
  };

  // Assign single sensor to current bucket
  const handleAssignSensor = (colName: string) => {
    const updatedMap = { ...bucketMap, [colName]: currentBucket.id };
    onUpdateBucketMap(updatedMap);
  };

  // Remove sensor from current bucket (resets mapping to default)
  const handleRemoveSensor = (colName: string) => {
    const updatedMap = { ...bucketMap };
    delete updatedMap[colName];
    // If it still resolves to this bucket by prefix and it's a default bucket, we can explicitly map it to General
    if (resolveSensorBucket(colName, buckets, updatedMap).id === currentBucket.id) {
      updatedMap[colName] = 'cat_general';
    }
    onUpdateBucketMap(updatedMap);
  };

  // Bulk assign checked sensors to current bucket
  const handleBulkAssign = () => {
    if (checkedSensors.size === 0) return;
    const updatedMap = { ...bucketMap };
    checkedSensors.forEach(colName => {
      updatedMap[colName] = currentBucket.id;
    });
    onUpdateBucketMap(updatedMap);
    setCheckedSensors(new Set());
  };

  // Reset to default configuration
  const handleResetToDefaults = () => {
    if (window.confirm('Reset all buckets and sensor assignments back to factory defaults?')) {
      onUpdateBuckets(DEFAULT_BUCKETS);
      onUpdateBucketMap({});
      setSelectedBucketId('cat_temp');
    }
  };

  const toggleCheckSensor = (name: string) => {
    const next = new Set(checkedSensors);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setCheckedSensors(next);
  };

  const handleSelectAllOther = () => {
    if (checkedSensors.size === otherSensors.length) {
      setCheckedSensors(new Set());
    } else {
      setCheckedSensors(new Set(otherSensors));
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="bucket-modal-backdrop" onClick={onClose}>
      <div className="bucket-modal-window" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="bucket-modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Folder size={18} className="text-accent-cyan" />
            </div>
            <div>
              <h3 className="modal-title">Configure Sensor Categories</h3>
              <p className="modal-subtitle">
                Create custom categories, group your sensors, and tailor your visual analysis.
              </p>
            </div>
          </div>

          <div className="modal-header-actions">
            <button 
              onClick={handleResetToDefaults}
              className="btn-modal-ghost"
              title="Reset all categories and assignments to default"
            >
              <RotateCcw size={13} />
              <span>Reset Defaults</span>
            </button>
            <button onClick={onClose} className="modal-close-btn" title="Close">×</button>
          </div>
        </div>

        {/* Modal Body - 2 Column Workbench */}
        <div className="bucket-modal-body">
          
          {/* Left Column: Categories List & Creator */}
          <div className="bucket-list-panel">
            <div className="panel-subhead">
              <span>Categories ({buckets.length})</span>
              {!isCreating && (
                <button 
                  onClick={() => setIsCreating(true)} 
                  className="btn-create-bucket-trigger"
                >
                  <Plus size={12} />
                  <span>New Category</span>
                </button>
              )}
            </div>

            {/* New Category Creator Form */}
            {isCreating && (
              <div className="new-bucket-creator-box">
                <input 
                  type="text" 
                  placeholder="e.g. Critical Thermal, Motor Drive..." 
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateBucket()}
                  className="new-bucket-input"
                  autoFocus
                />
                
                <div className="color-palette-row">
                  {PRESET_COLORS.map(c => (
                    <button 
                      key={c}
                      onClick={() => setNewBucketColor(c)}
                      className={`color-swatch-dot ${newBucketColor === c ? 'active' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="creator-actions-row">
                  <button onClick={handleCreateBucket} className="btn-sm btn-primary">Create</button>
                  <button onClick={() => setIsCreating(false)} className="btn-sm btn-ghost">Cancel</button>
                </div>
              </div>
            )}

            {/* Categories Scroll List */}
            <div className="buckets-scroll-list">
              {buckets.map(b => {
                const count = availableSensorNames.filter(name => sensorResolutions[name]?.id === b.id).length;
                const isSelected = b.id === currentBucket.id;
                return (
                  <div 
                    key={b.id}
                    onClick={() => {
                      setSelectedBucketId(b.id);
                      setIsEditingName(false);
                      setCheckedSensors(new Set());
                    }}
                    className={`bucket-nav-item ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="bucket-nav-left">
                      <span className="bucket-color-dot" style={{ backgroundColor: b.color }} />
                      <span className="bucket-nav-name" title={b.name}>{b.name}</span>
                      {!b.isDefault && (
                        <span className="custom-pill-tag">Custom</span>
                      )}
                    </div>
                    <span className="bucket-nav-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Category Content & Sensor Assignment */}
          <div className="bucket-details-panel">
            {currentBucket && (
              <>
                {/* Category Info Bar */}
                <div className="bucket-info-bar">
                  <div className="info-bar-left">
                    <span className="bucket-info-color-indicator" style={{ backgroundColor: currentBucket.color }} />
                    {isEditingName ? (
                      <div className="rename-form-inline">
                        <input 
                          type="text" 
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                          className="rename-input"
                          autoFocus
                        />
                        <button onClick={handleSaveRename} className="btn-sm btn-primary">Save</button>
                        <button onClick={() => setIsEditingName(false)} className="btn-sm btn-ghost">Cancel</button>
                      </div>
                    ) : (
                      <div className="bucket-name-display">
                        <h4 className="active-bucket-title">{currentBucket.name}</h4>
                        <button 
                          onClick={() => {
                            setEditingNameValue(currentBucket.name);
                            setIsEditingName(true);
                          }}
                          className="btn-icon-ghost"
                          title="Rename category"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="info-bar-right">
                    {/* Color Swatch Picker */}
                    <div className="inline-color-swatches">
                      {PRESET_COLORS.slice(0, 7).map(c => (
                        <button 
                          key={c}
                          onClick={() => handleChangeColor(c)}
                          className={`color-swatch-sm ${currentBucket.color === c ? 'active' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    {!currentBucket.isDefault && (
                      <button 
                        onClick={() => handleDeleteBucket(currentBucket.id)}
                        className="btn-delete-bucket"
                        title="Delete custom category"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Content Workspace Split: Left = Assigned, Right = Add from Other */}
                <div className="bucket-assigner-split">
                  
                  {/* Sub-panel 1: Currently Assigned Sensors */}
                  <div className="assigned-sensors-subpanel">
                    <div className="subpanel-header">
                      <span className="subpanel-title">
                        Assigned Sensors ({assignedSensors.length})
                      </span>
                      <span className="subpanel-hint">In this category</span>
                    </div>

                    <div className="assigned-sensors-list">
                      {assignedSensors.length === 0 ? (
                        <div className="assigned-empty-hint">
                          <AlertCircle size={16} className="text-muted" />
                          <span>No sensors currently in this category. Add sensors from the right pane.</span>
                        </div>
                      ) : (
                        assignedSensors.map(name => {
                          const isExplicit = !!bucketMap[name];
                          return (
                            <div key={name} className="sensor-assigned-chip">
                              <div className="chip-info">
                                <span className="chip-sensor-name" title={name}>{name}</span>
                                {isExplicit && <span className="explicit-tag">Custom Assigned</span>}
                              </div>
                              <button 
                                onClick={() => handleRemoveSensor(name)}
                                className="btn-remove-sensor"
                                title="Remove from this category"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Sub-panel 2: Add Other Sensors */}
                  <div className="add-sensors-subpanel">
                    <div className="subpanel-header">
                      <div className="search-other-box">
                        <Search size={12} className="text-muted" />
                        <input 
                          type="text" 
                          placeholder="Search sensors to add..." 
                          value={sensorSearchQuery}
                          onChange={(e) => setSensorSearchQuery(e.target.value)}
                          className="search-other-input"
                        />
                        {sensorSearchQuery && (
                          <button onClick={() => setSensorSearchQuery('')} className="search-clear-sm">×</button>
                        )}
                      </div>

                      {checkedSensors.size > 0 && (
                        <button onClick={handleBulkAssign} className="btn-bulk-assign">
                          <ArrowRight size={12} />
                          <span>Move ({checkedSensors.size}) to Category</span>
                        </button>
                      )}
                    </div>

                    <div className="other-sensors-action-bar">
                      <button onClick={handleSelectAllOther} className="btn-select-all-other">
                        {checkedSensors.size === otherSensors.length && otherSensors.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="other-count-note">{otherSensors.length} available</span>
                    </div>

                    <div className="other-sensors-list">
                      {otherSensors.length === 0 ? (
                        <div className="other-empty-hint">
                          {sensorSearchQuery 
                            ? "No matching sensors found." 
                            : "All available sensors are already in this category."}
                        </div>
                      ) : (
                        otherSensors.map(name => {
                          const currentHome = sensorResolutions[name];
                          const isChecked = checkedSensors.has(name);
                          return (
                            <div 
                              key={name}
                              onClick={() => toggleCheckSensor(name)}
                              className={`other-sensor-row ${isChecked ? 'checked' : ''}`}
                            >
                              <div className="other-sensor-left">
                                <input 
                                  type="checkbox" 
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="other-sensor-checkbox"
                                />
                                <span className="other-sensor-name" title={name}>{name}</span>
                              </div>

                              <div className="other-sensor-right">
                                <span className="current-home-badge" style={{ borderColor: currentHome?.color }}>
                                  {currentHome?.name}
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAssignSensor(name);
                                  }}
                                  className="btn-quick-add"
                                  title={`Move immediately to ${currentBucket.name}`}
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>
              </>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bucket-modal-footer">
          <span className="footer-tip">
            💡 Changes to categories and assignments are automatically saved and applied to the Visual Report.
          </span>
          <button onClick={onClose} className="btn btn-primary">Done</button>
        </div>

      </div>
    </div>,
    document.body
  );
};
