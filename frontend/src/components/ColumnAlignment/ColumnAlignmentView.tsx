import React, { useState, useEffect, useMemo } from 'react';
import { 
  DragDropContext, Droppable, Draggable 
} from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { 
  Sparkles, ArrowRight, RefreshCw, X, Play, 
  CheckCircle2, HelpCircle, GripVertical, Folder, Filter
} from 'lucide-react';
import type { TestFile, LexicalMatchItem, PairScoreResult } from '../../types/baseline';
import { BucketManagerModal } from '../VisualReport/BucketManagerModal';
import { 
  loadBuckets, saveBuckets, loadBucketMap, saveBucketMap, resolveSensorBucket 
} from '../VisualReport/bucketUtils';
import type { SensorBucket, SensorBucketMap } from '../VisualReport/bucketUtils';

interface ColumnAlignmentViewProps {
  files: TestFile[];
  activeRefId: string;
  activeTestId: string;
  onSelectRefId: (id: string) => void;
  onSelectTestId: (id: string) => void;
  mappings: Record<string, string>; // ref_col -> test_col
  setMappings: (mappings: Record<string, string>) => void;
  onRunSimilarityEngine?: () => void;
}

export function computeAlignmentBadge(
  refColName: string, 
  currentTestColName: string | undefined, 
  lexicalMatches: LexicalMatchItem[]
): { label: string; className: string; tooltip: string } | null {
  if (!currentTestColName) return null;

  const refNorm = refColName.trim().toLowerCase();
  const testNorm = currentTestColName.trim().toLowerCase();

  // 1. Identical channel names
  if (refNorm === testNorm) {
    return {
      label: 'EXACT MATCH',
      className: 'exact',
      tooltip: 'Channel names are identical'
    };
  }

  // 2. Specific pair in Stage 1 lexical matches
  const match = lexicalMatches.find(
    m => m.ref_col.trim().toLowerCase() === refNorm && 
         m.test_col.trim().toLowerCase() === testNorm
  );

  if (match) {
    if (match.match_type === 'exact') {
      return { label: 'EXACT MATCH', className: 'exact', tooltip: 'Exact lexical match' };
    }
    if (match.match_type === 'normalized_token') {
      return { label: 'TOKEN MATCHED', className: 'normalized_token', tooltip: 'Matched via token normalization' };
    }
    return {
      label: `LEXICAL (${(match.confidence * 100).toFixed(0)}%)`,
      className: 'lexical_similarity',
      tooltip: `Levenshtein similarity: ${(match.confidence * 100).toFixed(0)}%`
    };
  }

  // 3. Strip units check
  const stripUnits = (s: string) => s.toLowerCase().replace(/(_degc|_c|_rpm|_bar|_psi|_lpm|_w|_kw|_pct|%)/g, '').replace(/[^a-z0-9]/g, '');
  if (stripUnits(refColName) === stripUnits(currentTestColName) && stripUnits(refColName).length > 2) {
    return {
      label: 'TOKEN MATCHED',
      className: 'normalized_token',
      tooltip: 'Channel names match after stripping engineering units'
    };
  }

  // 4. Manual / Swapped assignment
  return {
    label: 'MANUAL ALIGNMENT',
    className: 'manual',
    tooltip: 'Custom sensor mapping manually assigned or swapped by user'
  };
}

export const ColumnAlignmentView: React.FC<ColumnAlignmentViewProps> = ({
  files,
  activeRefId,
  activeTestId,
  onSelectRefId,
  onSelectTestId,
  mappings,
  setMappings,
  onRunSimilarityEngine
}) => {
  const [unassignedPool, setUnassignedPool] = useState<string[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [lexicalMatches, setLexicalMatches] = useState<LexicalMatchItem[]>([]);
  const [pairScores, setPairScores] = useState<Record<string, PairScoreResult>>({});

  // Sensor Category Management State
  const [buckets, setBuckets] = useState<SensorBucket[]>(() => loadBuckets());
  const [bucketMap, setBucketMap] = useState<SensorBucketMap>(() => loadBucketMap());
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const handleUpdateBuckets = (newBuckets: SensorBucket[]) => {
    setBuckets(newBuckets);
    saveBuckets(newBuckets);
  };

  const handleUpdateBucketMap = (newMap: SensorBucketMap) => {
    setBucketMap(newMap);
    saveBucketMap(newMap);
  };

  const allSensorNames = useMemo(() => {
    const names = new Set<string>();
    files.forEach(f => {
      f.columns.filter(c => c.type === 'numeric').forEach(c => names.add(c.name));
    });
    return Array.from(names);
  }, [files]);

  const refFile = files.find(f => f.id === activeRefId);
  const testFile = files.find(f => f.id === activeTestId);

  // Trigger Stage 1 Deterministic Lexical Alignment
  const runDeterministicLexicalMatch = async () => {
    if (!refFile || !testFile) return;
    setIsMatching(true);

    try {
      const refCols = refFile.columns.map(c => c.name);
      const testCols = testFile.columns.map(c => c.name);

      const res = await fetch('http://localhost:8000/api/alignment/lexical-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_cols: refCols,
          test_cols: testCols,
          threshold: 0.85
        })
      });

      if (!res.ok) throw new Error('Lexical matching request failed');
      const data = await res.json();

      setMappings(data.mapping_dict || {});
      setUnassignedPool(data.unassigned_test || []);
      setLexicalMatches(data.matches || []);

      // Trigger dynamic scores for all newly matched pairs
      if (data.mapping_dict) {
        Object.entries(data.mapping_dict).forEach(([rCol, tCol]) => {
          if (tCol) fetchPairScore(rCol, tCol as string);
        });
      }
    } catch (err) {
      console.error('Error running lexical match:', err);
    } finally {
      setIsMatching(false);
    }
  };

  // Run initial match when files are set if mappings is empty
  useEffect(() => {
    if (activeRefId && activeTestId && Object.keys(mappings).length === 0) {
      runDeterministicLexicalMatch();
    } else if (testFile) {
      // Sync unassigned pool with currently mapped test channels
      const assigned = new Set(Object.values(mappings).filter(Boolean));
      const unassigned = testFile.columns
        .map(c => c.name)
        .filter(name => !assigned.has(name));
      setUnassignedPool(unassigned);
    }
  }, [activeRefId, activeTestId]);

  // Stage 3: On-Demand Dynamic Scoring
  const fetchPairScore = async (refCol: string, testCol: string) => {
    if (!refCol || !testCol || !activeRefId || !activeTestId) return;

    try {
      const res = await fetch('http://localhost:8000/api/alignment/pair-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_file_id: activeRefId,
          test_file_id: activeTestId,
          ref_col: refCol,
          test_col: testCol
        })
      });
      if (res.ok) {
        const scoreData: PairScoreResult = await res.json();
        setPairScores(prev => ({
          ...prev,
          [`${refCol}_${testCol}`]: scoreData
        }));
      }
    } catch (e) {
      console.error('Dynamic score fetch error:', e);
    }
  };

  // Debounced pair scoring handler
  const triggerDebouncedPairScore = (refCol: string, testCol: string) => {
    fetchPairScore(refCol, testCol);
  };

  // Drag and Drop Handler using @hello-pangea/dnd
  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Dropped outside any droppable
    if (!destination) return;

    // Dropped in same place
    if (source.droppableId === destination.droppableId) return;

    const draggedChannel = draggableId;

    // Case 1: Dragged from unassigned pool to a reference slot
    if (source.droppableId === 'unassigned-pool' && destination.droppableId.startsWith('slot-')) {
      const targetRefCol = destination.droppableId.substring(5);
      const existingOccupant = mappings[targetRefCol];

      const newMappings = { ...mappings, [targetRefCol]: draggedChannel };
      const newPool = unassignedPool.filter(c => c !== draggedChannel);

      // If slot had an existing occupant, move it back to unassigned pool
      if (existingOccupant) {
        newPool.push(existingOccupant);
      }

      setMappings(newMappings);
      setUnassignedPool(newPool);
      triggerDebouncedPairScore(targetRefCol, draggedChannel);
      return;
    }

    // Case 2: Dragged from a reference slot to the unassigned pool
    if (source.droppableId.startsWith('slot-') && destination.droppableId === 'unassigned-pool') {
      const sourceRefCol = source.droppableId.substring(5);
      const newMappings = { ...mappings, [sourceRefCol]: '' };
      
      setMappings(newMappings);
      setUnassignedPool([...unassignedPool, draggedChannel]);
      return;
    }

    // Case 3: Dragged between two reference slots (swap)
    if (source.droppableId.startsWith('slot-') && destination.droppableId.startsWith('slot-')) {
      const sourceRefCol = source.droppableId.substring(5);
      const targetRefCol = destination.droppableId.substring(5);

      const targetOccupant = mappings[targetRefCol] || '';
      const newMappings = {
        ...mappings,
        [sourceRefCol]: targetOccupant,
        [targetRefCol]: draggedChannel
      };

      setMappings(newMappings);
      triggerDebouncedPairScore(targetRefCol, draggedChannel);
      if (targetOccupant) {
        triggerDebouncedPairScore(sourceRefCol, targetOccupant);
      }
    }
  };

  // Direct 1-click slot swap handler
  const handleSwapSlots = (refColA: string, refColB: string) => {
    const occupantA = mappings[refColA] || '';
    const occupantB = mappings[refColB] || '';

    const newMappings = {
      ...mappings,
      [refColA]: occupantB,
      [refColB]: occupantA
    };

    setMappings(newMappings);
    if (occupantB) triggerDebouncedPairScore(refColA, occupantB);
    if (occupantA) triggerDebouncedPairScore(refColB, occupantA);
  };

  // Unassign card manually
  const handleRemoveFromSlot = (refCol: string) => {
    const occupant = mappings[refCol];
    if (!occupant) return;
    const newMappings = { ...mappings, [refCol]: '' };
    setMappings(newMappings);
    setUnassignedPool([...unassignedPool, occupant]);
  };

  const filteredUnassignedPool = useMemo(() => {
    if (categoryFilter === 'all') return unassignedPool;
    return unassignedPool.filter(c => resolveSensorBucket(c, buckets, bucketMap).id === categoryFilter);
  }, [unassignedPool, categoryFilter, buckets, bucketMap]);

  return (
    <div className="column-alignment-layout">
      {/* Alignment Stage Header Bar */}
      <div className="alignment-header-bar">
        <div className="alignment-header-left">
          <h2>Two-Stage Interactive Column Alignment</h2>
          <p className="alignment-header-desc">
            Stage 1 uses deterministic lexical rules (casing, engineering unit stripping, Levenshtein ≥ 0.85).
            Stage 2 lets you drag unassigned test sensors into slots with real-time Pearson <i>r</i> & DTW scoring.
          </p>
        </div>

        <div className="alignment-header-actions">
          <button 
            onClick={() => setIsBucketModalOpen(true)}
            className="btn btn-secondary btn-manage-cats"
            title="Configure, group, or delete sensor categories"
          >
            <Folder size={14} className="text-accent-cyan" />
            <span>Manage Categories ({buckets.length})</span>
          </button>

          {Object.values(mappings).some(Boolean) && (
            <button 
              onClick={() => {
                setMappings({});
                if (testFile) {
                  setUnassignedPool(testFile.columns.map(c => c.name));
                }
              }}
              className="btn btn-secondary"
              title="Reset all current column pairings"
            >
              <X size={13} />
              <span>Reset Mappings</span>
            </button>
          )}

          <button 
            onClick={runDeterministicLexicalMatch}
            disabled={isMatching || !activeRefId || !activeTestId}
            className="btn btn-primary"
          >
            {isMatching ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
            <span>Run Stage 1 Lexical Matcher</span>
          </button>

          {onRunSimilarityEngine && (
            <button 
              onClick={onRunSimilarityEngine}
              disabled={!activeRefId || !activeTestId}
              className="btn btn-accent"
            >
              <Play size={14} />
              <span>Run Full Similarity Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* File Run Selectors if not chosen */}
      <div className="alignment-selectors-bar">
        <div className="run-selector-group">
          <span className="run-label">Reference Run:</span>
          <select 
            value={activeRefId} 
            onChange={(e) => onSelectRefId(e.target.value)}
            className="run-select ref-select"
          >
            <option value="">-- Choose Reference Run --</option>
            {files.map(f => (
              <option key={f.id} value={f.id}>{f.name} ({f.columns.length} channels)</option>
            ))}
          </select>
        </div>

        <ArrowRight size={16} className="text-muted" />

        <div className="run-selector-group">
          <span className="run-label">Test Run:</span>
          <select 
            value={activeTestId} 
            onChange={(e) => onSelectTestId(e.target.value)}
            className="run-select test-select"
          >
            <option value="">-- Choose Test Run to Verify --</option>
            {files.map(f => (
              <option key={f.id} value={f.id}>{f.name} ({f.columns.length} channels)</option>
            ))}
          </select>
        </div>

        {refFile && testFile && (
          <div className="alignment-stats-pills">
            <span className="stat-pill">
              {refFile.columns.length} Ref Slots
            </span>
            <span className="stat-pill">
              {Object.values(mappings).filter(Boolean).length} Mapped
            </span>
            <span className="stat-pill highlight">
              {unassignedPool.length} Unassigned
            </span>
          </div>
        )}
      </div>

      {/* Main Drag-and-Drop Workspace */}
      {refFile && testFile ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="alignment-workspace-grid">
            
            {/* Left Column: Reference Schema & Drop Slots */}
            <div className="alignment-slots-panel">
              <div className="panel-title-bar">
                <span className="panel-title">Reference Slots & Aligned Channels</span>
                <span className="panel-subtitle">Drop test cards into empty target slots</span>
              </div>

              <div className="slots-list-scroll">
                {refFile.columns.map((refCol, idx) => {
                  const mappedTestCol = mappings[refCol.name];
                  const badge = computeAlignmentBadge(refCol.name, mappedTestCol, lexicalMatches);
                  const scoreKey = `${refCol.name}_${mappedTestCol}`;
                  const score = mappedTestCol ? pairScores[scoreKey] : null;
                  const refBucket = resolveSensorBucket(refCol.name, buckets, bucketMap);
                  const mappedBucket = mappedTestCol ? resolveSensorBucket(mappedTestCol, buckets, bucketMap) : null;

                  return (
                    <div key={refCol.name} className="alignment-slot-row">
                      {/* Reference Target Column Box */}
                      <div className="ref-col-box">
                        <div className="ref-col-header">
                          <span 
                            className="slot-cat-dot" 
                            style={{ backgroundColor: refBucket.color }} 
                            title={`Category: ${refBucket.name}`} 
                          />
                          <span className="slot-index">#{idx + 1}</span>
                          <span className="ref-col-name" title={refCol.name}>{refCol.name}</span>
                        </div>
                        <span className="ref-col-type">{refCol.type}</span>
                      </div>

                      <ArrowRight size={16} className="slot-arrow" />

                      {/* Drop Target Zone */}
                      <Droppable droppableId={`slot-${refCol.name}`}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`slot-drop-zone ${snapshot.isDraggingOver ? 'dragging-over' : ''} ${
                              mappedTestCol ? 'occupied' : 'empty'
                            }`}
                          >
                            {snapshot.isDraggingOver && (
                              <div className="slot-drop-overlay">
                                <span>{mappedTestCol ? `⇄ Swap with ${mappedTestCol}` : `+ Drop to Align`}</span>
                              </div>
                            )}

                            {mappedTestCol ? (
                              <Draggable key={mappedTestCol} draggableId={mappedTestCol} index={0}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className={`aligned-test-card ${dragSnapshot.isDragging ? 'is-dragging' : ''}`}
                                  >
                                    <div className="card-top-row">
                                      <div className="card-drag-handle">
                                        <GripVertical size={14} />
                                        {mappedBucket && (
                                          <span 
                                            className="slot-cat-dot" 
                                            style={{ backgroundColor: mappedBucket.color }} 
                                            title={`Category: ${mappedBucket.name}`} 
                                          />
                                        )}
                                        <span className="test-channel-title" title={mappedTestCol}>
                                          {mappedTestCol}
                                        </span>
                                      </div>
                                      
                                      <div className="card-actions-group">
                                        {/* Quick Swap Dropdown */}
                                        <select 
                                          value=""
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              handleSwapSlots(refCol.name, e.target.value);
                                            }
                                          }}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          className="card-swap-select"
                                          title="Quick swap with another reference slot"
                                        >
                                          <option value="">⇄ Swap...</option>
                                          {refFile.columns
                                            .filter(other => other.name !== refCol.name)
                                            .map(other => (
                                              <option key={other.name} value={other.name}>
                                                Swap with #{refFile.columns.findIndex(c => c.name === other.name) + 1} {other.name} {mappings[other.name] ? `(${mappings[other.name]})` : '(Empty)'}
                                              </option>
                                            ))}
                                        </select>

                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveFromSlot(refCol.name);
                                          }}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          className="card-remove-btn"
                                          title="Unassign this channel"
                                        >
                                          <X size={13} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Stage 1 & Stage 3 Badges */}
                                    <div className="card-meta-row">
                                      {badge && (
                                        <span className={`lexical-badge ${badge.className}`} title={badge.tooltip}>
                                          {badge.label}
                                        </span>
                                      )}

                                      {score ? (
                                        <div className="dynamic-scores-pill">
                                          <span title="Pearson correlation r">r: <b>{(score.pearson * 100).toFixed(0)}%</b></span>
                                          <span className="dot-sep">•</span>
                                          <span title="Dynamic Time Warping similarity">DTW: <b>{(score.dtw * 100).toFixed(0)}%</b></span>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            fetchPairScore(refCol.name, mappedTestCol);
                                          }}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          className="calc-score-btn"
                                          title="Compute Pearson r and DTW distance for this pair"
                                        >
                                          Calculate Score
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ) : (
                              <div className="empty-drop-placeholder">
                                <span>Empty Target Slot (Drag test channel here)</span>
                              </div>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Unassigned Test Channels Bank */}
            <div className="alignment-unassigned-panel">
              <div className="panel-title-bar">
                <div>
                  <span className="panel-title">Unassigned Test Channels</span>
                  <span className="count-pill highlight" style={{ marginLeft: '8px' }}>
                    {filteredUnassignedPool.length}{categoryFilter !== 'all' ? ` / ${unassignedPool.length}` : ''}
                  </span>
                </div>
                <span className="panel-subtitle">Channels without confident lexical match</span>
              </div>

              {/* Category Filter for Bank */}
              <div className="bank-filter-row">
                <Filter size={13} className="text-muted" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bank-category-select"
                  title="Filter unassigned channels by category"
                >
                  <option value="all">All Categories ({unassignedPool.length})</option>
                  {buckets.map(b => {
                    const count = unassignedPool.filter(c => resolveSensorBucket(c, buckets, bucketMap).id === b.id).length;
                    return (
                      <option key={b.id} value={b.id}>
                        {b.name} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <Droppable droppableId="unassigned-pool">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`unassigned-bank-body ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {filteredUnassignedPool.length === 0 ? (
                      <div className="bank-empty-state">
                        <CheckCircle2 size={24} className="text-emerald-400" />
                        <span>
                          {unassignedPool.length === 0 
                            ? 'All test channels have been aligned!' 
                            : 'No unassigned channels in this category'}
                        </span>
                      </div>
                    ) : (
                      filteredUnassignedPool.map((channelName, index) => {
                        const cardBucket = resolveSensorBucket(channelName, buckets, bucketMap);
                        return (
                          <Draggable key={channelName} draggableId={channelName} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`bank-channel-card ${dragSnapshot.isDragging ? 'is-dragging' : ''}`}
                              >
                                <div className="card-drag-handle">
                                  <GripVertical size={14} />
                                  <span 
                                    className="slot-cat-dot" 
                                    style={{ backgroundColor: cardBucket.color }} 
                                    title={`Category: ${cardBucket.name}`} 
                                  />
                                  <span className="bank-channel-name" title={channelName}>
                                    {channelName}
                                  </span>
                                </div>
                                <div className="bank-card-actions">
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        const targetRefCol = e.target.value;
                                        const existingOccupant = mappings[targetRefCol];
                                        const newMappings = { ...mappings, [targetRefCol]: channelName };
                                        const newPool = unassignedPool.filter(c => c !== channelName);
                                        if (existingOccupant) newPool.push(existingOccupant);
                                        setMappings(newMappings);
                                        setUnassignedPool(newPool);
                                        triggerDebouncedPairScore(targetRefCol, channelName);
                                      }
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="bank-assign-select"
                                    title="Assign channel directly to a slot"
                                  >
                                    <option value="">Assign to...</option>
                                    {refFile.columns.map((c, i) => (
                                      <option key={c.name} value={c.name}>
                                        Slot #{i + 1}: {c.name} {mappings[c.name] ? `(${mappings[c.name]})` : '(Empty)'}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>

          </div>
        </DragDropContext>
      ) : (
        <div className="alignment-placeholder">
          <HelpCircle size={44} className="text-accent-cyan" style={{ opacity: 0.8 }} />
          {files.length === 0 ? (
            <>
              <h3>No Sensor Logs Uploaded Yet</h3>
              <p>
                Navigate to the <b>Dashboard</b> tab and upload your reference and test runs (.xlsx or .csv) to begin schema alignment.
              </p>
            </>
          ) : files.length === 1 ? (
            <>
              <h3>Only 1 Run Ingested</h3>
              <p>
                Two-stage column alignment requires at least two runs (one <b>Reference</b> and one <b>Test</b>). Upload another test run to compare sensor mappings.
              </p>
            </>
          ) : (
            <>
              <h3>Select Reference & Test Runs Above</h3>
              <p>
                Choose a <b>Reference Run</b> and a <b>Test Run</b> from the selector bar to map channel names across both logs.
              </p>
              {(!activeRefId || !activeTestId) && files.length >= 2 && (
                <div className="placeholder-quick-actions">
                  <button 
                    onClick={() => {
                      if (!activeRefId && files[0]) onSelectRefId(files[0].id);
                      if (!activeTestId && files[1]) onSelectTestId(files[1].id);
                    }}
                    className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '7px 14px' }}
                  >
                    Auto-Select "{files[0]?.name}" (Ref) & "{files[1]?.name}" (Test)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Sensor Category Configuration Modal */}
      <BucketManagerModal
        isOpen={isBucketModalOpen}
        onClose={() => setIsBucketModalOpen(false)}
        buckets={buckets}
        bucketMap={bucketMap}
        availableSensorNames={allSensorNames}
        onUpdateBuckets={handleUpdateBuckets}
        onUpdateBucketMap={handleUpdateBucketMap}
      />
    </div>
  );
};
