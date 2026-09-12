/** Shared Design contract. UI composition consumes this file; the search lane owns it.
 * Fresh feasible searches inspect their recommendation, never apply it.
 * Candidate freshness and baseline-assessment freshness are independent.
 * All numbers come from the isolated-transmon service; no frontend physics.
 */
import type { DeviceParams, DeviceResult } from './types';
import type { EvaluateHandle } from './useEvaluate';

export type CandidateId = string;
export interface SearchRequirements {
  target_ghz: number;
  max_dispersion_khz: number;
  min_anharmonicity_mhz: number;
  ratio_min: number;
  ratio_max: number;
  ej_min_ghz: number;
  ej_max_ghz: number;
  ec_min_ghz: number;
  ec_max_ghz: number;
  points: number;
  ncut: number;
}
export interface SearchRequest extends SearchRequirements {
  baseline?: DeviceParams | null;
}
export type BoundMargin =
  | 'charge_budget_khz' | 'anharmonicity_floor_mhz'
  | 'ej_lower_ghz' | 'ej_upper_ghz' | 'ec_lower_ghz' | 'ec_upper_ghz'
  | 'ratio_lower' | 'ratio_upper';
export type Violation = BoundMargin
  | 'charge_budget_numerical_buffer' | 'requires_negative_anharmonicity'
  | 'frequency_lock_numerical_error' | 'frequency_target_mismatch'
  | 'design_reference_ng_mismatch';
export interface SearchCandidate extends Omit<DeviceResult, 'charge_response' | 'elapsed_ms'> {
  candidate_id: CandidateId;
  margins: Record<BoundMargin | 'frequency_target_ghz', number>;
  violations: Violation[];
  feasible: boolean;
}
export interface BaselineAssessment {
  params: DeviceParams;
  assessment: SearchCandidate;
}
export interface SelectionEvidence {
  kind: 'higher_a_rejected' | 'grid_boundary' | 'evaluated_maximum' | 'infeasible';
  higher_a_count: number;
  higher_a_rejections: { reason: Violation; count: number }[];
  selected_at_ratio_boundary: 'lower' | 'upper' | null;
}
export interface SearchResponse {
  model: string;
  model_version: string;
  status: 'feasible' | 'infeasible';
  request: SearchRequest;
  selected: SearchCandidate | null;
  candidates: SearchCandidate[];
  evaluated_count: number;
  feasible_count: number;
  selection_rule: string;
  optimality_scope: 'evaluated grid only';
  dispersion_resolution_khz: number;
  frequency_tolerance_ghz: number;
  charge_budget_buffer_khz: number;
  /** Engineering comparison threshold, not a certified global error bound. */
  comparison_resolution_mhz: number;
  baseline_evaluation: BaselineAssessment | null;
  selection_evidence: SelectionEvidence;
  elapsed_ms: number;
}
export interface SearchErrorResponse {
  error: string;
  field_errors?: Record<string, string[]>;
}
export interface SelectionProvenance {
  kind: 'recommendation' | 'candidate';
  requirements: SearchRequirements;
  candidate: SearchCandidate;
  selection_rule: string;
  optimality_scope: 'evaluated grid only';
  comparison_resolution_mhz: number;
}
export interface AppliedDevice {
  params: DeviceParams;
  source: SelectionProvenance | null;
}
export interface FrozenBaseline {
  id: string;
  params: DeviceParams;
  result: DeviceResult;
  /** Null means an Explore pin with no verified Design provenance. */
  source: SelectionProvenance | null;
}
export type SearchStatus = 'dirty' | 'running' | 'ready' | 'infeasible' | 'error';
export type BaselineAssessmentStatus = 'absent' | 'pending' | 'running' | 'ready' | 'error';
export type ComparisonKind = 'none' | 'pending' | 'tightening_cost' | 'unchanged'
  | 'infeasible' | 'candidate_comparison' | 'changed_context' | 'unresolved';
export interface DesignComparison {
  kind: ComparisonKind;
  message: string;
  delta_anharmonicity_mhz: number | null;
  delta_dispersion_khz: number | null;
  comparable_recommendations: boolean;
  changed_requirements: (keyof SearchRequirements)[];
}
export interface GuardedEvaluation {
  result: DeviceResult | null;
  status: EvaluateHandle['status'];
  stale: boolean;
  error: string | null;
  canPin: boolean;
  canApply: boolean;
}
export interface DesignSearchOptions {
  applied: AppliedDevice;
  onApply: (device: AppliedDevice) => void;
}
export interface DesignSearchHandle {
  mode: 'explore' | 'design';
  status: SearchStatus;
  draft: SearchRequirements;
  lastRun: SearchResponse | null;
  candidateResultsFresh: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  recommendedCandidate: SearchCandidate | null;
  inspectedCandidate: SearchCandidate | null;
  displayParams: DeviceParams;
  displaySource: 'applied' | 'candidate';
  baseline: FrozenBaseline | null;
  baselineAssessmentStatus: BaselineAssessmentStatus;
  baselineAssessment: BaselineAssessment | null;
  baselineAssessmentError: string | null;
  comparison: DesignComparison;
  selectionExplanation: string | null;
  enterDesign(): void;
  exitDesign(): void;
  setRequirements(patch: Partial<SearchRequirements>): void;
  search(): Promise<void>;
  inspectCandidate(id: CandidateId): void;
  clearInspection(): void;
  getDisplayEvaluation(evaluation: EvaluateHandle): GuardedEvaluation;
  applyInspected(evaluation: EvaluateHandle): boolean;
  pinBaseline(evaluation: EvaluateHandle): boolean;
  clearBaseline(): void;
  retryBaselineAssessment(): void;
}
