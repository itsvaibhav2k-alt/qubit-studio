import type { BaselineAssessment, BaselineAssessmentStatus, CandidateId, FrozenBaseline, SearchRequirements, SearchResponse, SearchStatus } from './search-types.ts';
import { DEFAULT_SEARCH_REQUIREMENTS, requirementsKey } from './search-params.ts';
import { sameDeviceParams } from './search-baseline.ts';

export interface SearchState {
  mode: 'explore' | 'design';
  initialized: boolean;
  draft: SearchRequirements;
  status: SearchStatus;
  seq: number;
  lastRun: SearchResponse | null;
  inspectedId: CandidateId | null;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  baseline: FrozenBaseline | null;
  baselineAssessmentStatus: BaselineAssessmentStatus;
  baselineAssessment: BaselineAssessment | null;
  baselineAssessmentError: string | null;
  assessmentSeq: number;
  assessmentKey: string | null;
  assessmentRetry: number;
}
export function initialSearchState(): SearchState {
  return {
    mode: 'explore', initialized: false, draft: { ...DEFAULT_SEARCH_REQUIREMENTS },
    status: 'dirty', seq: 0, lastRun: null, inspectedId: null, error: null, fieldErrors: {},
    baseline: null, baselineAssessmentStatus: 'absent', baselineAssessment: null,
    baselineAssessmentError: null, assessmentSeq: 0, assessmentKey: null, assessmentRetry: 0,
  };
}
export type SearchEvent =
  | { type: 'enter'; ncut: number }
  | { type: 'exit'; seq: number; assessmentSeq: number }
  | { type: 'edit'; patch: Partial<SearchRequirements>; seq: number; assessmentSeq: number }
  | { type: 'start'; seq: number; assessmentSeq: number }
  | { type: 'success'; seq: number; result: SearchResponse; baselineId: string | null; assessmentSeq: number }
  | { type: 'failure'; seq: number; error: string; fieldErrors?: Record<string, string[]>; baselineId: string | null; assessmentSeq: number }
  | { type: 'inspect'; id: CandidateId | null }
  | { type: 'pin'; baseline: FrozenBaseline; assessmentSeq: number }
  | { type: 'clear-baseline'; assessmentSeq: number }
  | { type: 'assessment-start'; seq: number; baselineId: string; key: string }
  | { type: 'assessment-success'; seq: number; baselineId: string; key: string; assessment: BaselineAssessment }
  | { type: 'assessment-failure'; seq: number; baselineId: string; key: string; error: string }
  | { type: 'assessment-retry'; seq: number };

export function candidateResultsFresh(state: SearchState): boolean {
  return (state.status === 'ready' || state.status === 'infeasible') && state.lastRun !== null
    && requirementsKey(state.lastRun.request) === requirementsKey(state.draft);
}
function pendingAssessment(state: SearchState, seq: number): Partial<SearchState> {
  return { baselineAssessmentStatus: state.baseline ? 'pending' : 'absent',
    baselineAssessment: null, baselineAssessmentError: null, assessmentKey: null, assessmentSeq: seq };
}
function assessmentMatches(state: SearchState, id: string | null, seq: number): boolean {
  return state.baseline !== null && state.baseline.id === id && state.assessmentSeq === seq;
}
export function searchReducer(state: SearchState, event: SearchEvent): SearchState {
  switch (event.type) {
    case 'enter':
      return { ...state, mode: 'design', initialized: true,
        draft: state.initialized ? state.draft : { ...state.draft, ncut: event.ncut } };
    case 'exit':
      return { ...state, mode: 'explore', seq: event.seq, inspectedId: null,
        status: state.status === 'running' ? 'dirty' : state.status,
        ...pendingAssessment(state, event.assessmentSeq), assessmentRetry: state.assessmentRetry + 1 };
    case 'edit': {
      const draft = { ...state.draft, ...event.patch };
      return { ...state, draft, seq: event.seq, status: 'dirty', inspectedId: null,
        error: null, fieldErrors: {}, ...pendingAssessment(state, event.assessmentSeq) };
    }
    case 'start':
      return { ...state, seq: event.seq, status: 'running', inspectedId: null, error: null, fieldErrors: {},
        ...pendingAssessment(state, event.assessmentSeq), baselineAssessmentStatus: state.baseline ? 'running' : 'absent' };
    case 'success': {
      if (event.seq !== state.seq || state.mode !== 'design'
        || requirementsKey(event.result.request) !== requirementsKey(state.draft)) return state;
      const assessment = event.result.baseline_evaluation;
      const acceptAssessment = assessmentMatches(state, event.baselineId, event.assessmentSeq)
        && assessment !== null && sameDeviceParams(state.baseline!.params, assessment.params);
      return { ...state, status: event.result.status === 'feasible' ? 'ready' : 'infeasible',
        lastRun: structuredClone(event.result), inspectedId: event.result.selected?.candidate_id ?? null,
        error: null, fieldErrors: {}, ...(acceptAssessment ? {
          baselineAssessment: structuredClone(assessment), baselineAssessmentStatus: 'ready' as const,
          baselineAssessmentError: null, assessmentKey: requirementsKey(state.draft),
        } : {}) };
    }
    case 'failure':
      if (event.seq !== state.seq) return state;
      return { ...state, status: 'error', inspectedId: null, error: event.error, fieldErrors: event.fieldErrors ?? {},
        ...(assessmentMatches(state, event.baselineId, event.assessmentSeq) ? {
          baselineAssessmentStatus: 'error' as const, baselineAssessment: null, baselineAssessmentError: event.error,
        } : {}) };
    case 'inspect':
      if (!candidateResultsFresh(state) || (event.id && !state.lastRun!.candidates.some((p) => p.candidate_id === event.id))) return state;
      return { ...state, inspectedId: event.id };
    case 'pin':
      return { ...state, baseline: structuredClone(event.baseline), baselineAssessmentStatus: 'pending',
        baselineAssessment: null, baselineAssessmentError: null, assessmentSeq: event.assessmentSeq, assessmentKey: null };
    case 'clear-baseline':
      return { ...state, baseline: null, baselineAssessmentStatus: 'absent', baselineAssessment: null,
        baselineAssessmentError: null, assessmentSeq: event.assessmentSeq, assessmentKey: null };
    case 'assessment-start':
      if (!state.baseline || state.baseline.id !== event.baselineId || event.key !== requirementsKey(state.draft)
        || !candidateResultsFresh(state) || event.seq < state.assessmentSeq) return state;
      return { ...state, assessmentSeq: event.seq, baselineAssessmentStatus: 'running', baselineAssessment: null,
        baselineAssessmentError: null, assessmentKey: event.key };
    case 'assessment-success':
      if (!assessmentMatches(state, event.baselineId, event.seq) || event.key !== requirementsKey(state.draft)
        || !candidateResultsFresh(state) || !sameDeviceParams(state.baseline!.params, event.assessment.params)) return state;
      return { ...state, baselineAssessmentStatus: 'ready', baselineAssessment: structuredClone(event.assessment),
        baselineAssessmentError: null, assessmentKey: event.key };
    case 'assessment-failure':
      if (!assessmentMatches(state, event.baselineId, event.seq) || event.key !== requirementsKey(state.draft)
        || !candidateResultsFresh(state)) return state;
      return { ...state, baselineAssessmentStatus: 'error', baselineAssessment: null, baselineAssessmentError: event.error };
    case 'assessment-retry':
      return { ...state, ...pendingAssessment(state, event.seq), assessmentRetry: state.assessmentRetry + 1 };
  }
}
