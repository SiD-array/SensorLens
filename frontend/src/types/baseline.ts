export interface SensorColumn {
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

export interface TestFile {
  id: string;
  name: string;
  rowCount: number;
  columns: SensorColumn[];
  tag: 'useful' | 'reviewable' | 'reference' | 'archive';
}

export interface ChannelPreset {
  id: string;
  name: string;
  channelNames: string[]; // List of column names
  created: string;
}

export interface LexicalMatchItem {
  ref_col: string;
  test_col: string;
  match_type: 'exact' | 'normalized_token' | 'lexical_similarity';
  confidence: number;
}

export interface LexicalMatchResult {
  matches: LexicalMatchItem[];
  mapping_dict: Record<string, string>;
  unassigned_ref: string[];
  unassigned_test: string[];
}

export interface PairScoreResult {
  ref_col: string;
  test_col: string;
  pearson: number;
  dtw: number;
  hybrid: number;
  error?: string;
}

export interface ChannelAvailability {
  channel_name: string;
  available_runs: number;
  total_accepted_runs: number;
  presence_pct: number;
  present_in_runs: string[];
}

export interface BaselineChannelProfile {
  channel_name: string;
  mean: number[];
  std: number[];
  sample_count: number;
}

export interface RejectedRunInfo {
  file_name: string;
  reason: string;
}

export interface BaselineProfile {
  success: boolean;
  target_variable: string;
  direction: 'downward' | 'upward';
  grid_points: number;
  grid: number[];
  accepted_count: number;
  rejected_count: number;
  rejected_runs: RejectedRunInfo[];
  availability_matrix: ChannelAvailability[];
  baseline_channels: Record<string, BaselineChannelProfile>;
  error?: string;
}

export interface CorridorViolationResult {
  channel_name: string;
  matched_test_col?: string;
  violation_pct: number;
  cumulative_deviation: number;
  slope_correlation: number;
  test_values: number[];
  baseline_mean: number[];
  upper_corridor: number[];
  lower_corridor: number[];
  violating_mask: boolean[];
}

export interface RunEvaluationSummary {
  file_id: string;
  file_name: string;
  success: boolean;
  error?: string;
  evaluated_channels_count: number;
  mean_violation_pct: number;
  max_violation_pct: number;
  verdict: 'PASS' | 'WARN' | 'DEFECT' | 'ERROR';
}

export interface BaselineEvaluationResponse {
  success: boolean;
  test_file_name: string;
  target_col: string;
  k_sigma: number;
  pct_margin?: number;
  grid: number[];
  channel_evaluations: Record<string, CorridorViolationResult>;
  matched_channels?: string[];
  missing_channels?: string[];
  extra_test_channels?: string[];
  error?: string;
  is_batch?: boolean;
  evaluations_by_run?: Record<string, BaselineEvaluationResponse>;
  runs_summary?: RunEvaluationSummary[];
  primary_run_id?: string;
}
