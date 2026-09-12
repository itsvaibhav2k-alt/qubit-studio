'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { EvaluateHandle } from './useEvaluate.ts';
import type { AppliedDevice, DesignSearchHandle, DesignSearchOptions, SearchRequest, SearchRequirements, SearchResponse } from './search-types.ts';
import { parseSearchResponse, requirementsFrom, requirementsKey, validateSearchRequest } from './search-params.ts';
import { candidateResultsFresh, initialSearchState, searchReducer } from './search-state.ts';
import type { SearchEvent, SearchState } from './search-state.ts';
import { createFrozenBaseline, deviceParams, guardEvaluation, sameDeviceParams, sourceForApplied, sourceForCandidate } from './search-baseline.ts';
import { classifyComparison, explainSelection } from './search-comparison.ts';

export class SearchRequestError extends Error {
  fieldErrors: Record<string, string[]>;
  constructor(message: string, fieldErrors: Record<string, string[]> = {}) { super(message); this.fieldErrors = fieldErrors; }
}
export async function requestDesignSearch(request: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  const response = await fetch('/api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request), signal, cache: 'no-store',
  });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new SearchRequestError('Search returned a non-JSON response.'); }
  if (!response.ok) {
    const p = payload as { error?: unknown; field_errors?: unknown } | null;
    const fields: Record<string, string[]> = {};
    if (p?.field_errors && typeof p.field_errors === 'object') {
      for (const [key, errors] of Object.entries(p.field_errors))
        if (Array.isArray(errors) && errors.every((e) => typeof e === 'string')) fields[key] = errors;
    }
    throw new SearchRequestError(typeof p?.error === 'string' ? p.error : `Search failed (HTTP ${response.status}).`, fields);
  }
  const result = parseSearchResponse(payload);
  if (requirementsKey(result.request) !== requirementsKey(request)
    || (!!result.request.baseline !== !!request.baseline)
    || (request.baseline && !sameDeviceParams(request.baseline, result.request.baseline!))) {
    throw new SearchRequestError('Search response does not match the submitted requirements or baseline.');
  }
  return result;
}

/** Public rendering adapter, also used by action handlers with their latest state. */
export function designDisplay(state: SearchState, applied: AppliedDevice) {
  const fresh = candidateResultsFresh(state);
  const inspected = state.mode === 'design' && fresh
    ? state.lastRun!.candidates.find((p) => p.candidate_id === state.inspectedId) ?? null : null;
  const source = inspected ? sourceForCandidate(inspected, state.lastRun!) : sourceForApplied(applied);
  return { fresh, inspected, source, params: deviceParams(inspected ?? applied.params) };
}
function displayEvaluation(state: SearchState, applied: AppliedDevice, evaluation: EvaluateHandle) {
  const view = designDisplay(state, applied);
  return guardEvaluation(evaluation, view.params,
    state.mode === 'explore' || view.fresh,
    state.mode === 'design' && view.fresh && !!view.inspected?.feasible,
    view.source?.candidate);
}

/** Owns Design decisions only. The page keeps AppliedDevice and all visual state.
 * Feed displayParams to ONE existing useEvaluate; wrap it with getDisplayEvaluation.
 * Candidate inspection is automatic on successful search; application is explicit.
 */
export function useDesignSearch({ applied, onApply }: DesignSearchOptions): DesignSearchHandle {
  const [state, reactDispatch] = useReducer(searchReducer, undefined, initialSearchState);
  const liveState = useRef(state);
  const searchSeq = useRef(0);
  const assessmentSeq = useRef(0);
  const pinSeq = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const assessmentController = useRef<AbortController | null>(null);

  // Updating this event snapshot synchronously closes the interval between an
  // input event and React's next render/effect. A late response cannot win it.
  const send = useCallback((event: SearchEvent) => {
    liveState.current = searchReducer(liveState.current, event);
    reactDispatch(event);
  }, []);
  const invalidateAssessment = useCallback(() => {
    assessmentController.current?.abort();
    return ++assessmentSeq.current;
  }, []);
  const invalidateSearch = useCallback(() => {
    searchController.current?.abort();
    return ++searchSeq.current;
  }, []);

  const enterDesign = useCallback(() => { send({ type: 'enter', ncut: applied.params.ncut }); }, [applied.params.ncut, send]);
  const exitDesign = useCallback(() => {
    send({ type: 'exit', seq: invalidateSearch(), assessmentSeq: invalidateAssessment() });
  }, [invalidateSearch, invalidateAssessment, send]);
  const setRequirements = useCallback((patch: Partial<SearchRequirements>) => {
    send({ type: 'edit', patch, seq: invalidateSearch(), assessmentSeq: invalidateAssessment() });
  }, [invalidateSearch, invalidateAssessment, send]);
  const search = useCallback(async () => {
    const snapshot = liveState.current;
    if (snapshot.mode !== 'design') return;
    const seq = invalidateSearch();
    const aseq = invalidateAssessment();
    const baselineId = snapshot.baseline?.id ?? null;
    send({ type: 'start', seq, assessmentSeq: aseq });
    const checked = validateSearchRequest({ ...snapshot.draft, baseline: snapshot.baseline?.params ?? null });
    if (!checked.valid) {
      send({ type: 'failure', seq, error: 'Fix the invalid search requirements.', fieldErrors: checked.fieldErrors,
        baselineId, assessmentSeq: aseq });
      return;
    }
    const controller = new AbortController();
    searchController.current = controller;
    try {
      const result = await requestDesignSearch(checked.request, controller.signal);
      if (controller.signal.aborted || seq !== searchSeq.current) return;
      send({ type: 'success', seq, result, baselineId, assessmentSeq: aseq });
    } catch (error) {
      if (controller.signal.aborted || seq !== searchSeq.current) return;
      send({ type: 'failure', seq, error: error instanceof Error ? error.message : 'Search failed.',
        fieldErrors: error instanceof SearchRequestError ? error.fieldErrors : {}, baselineId, assessmentSeq: aseq });
    }
  }, [invalidateSearch, invalidateAssessment, send]);

  const fresh = candidateResultsFresh(state);
  const draftKey = requirementsKey(state.draft);
  const baselineId = state.baseline?.id ?? null;
  // Pinning/replacing/clearing affects only this request stream. Reuse /search's
  // shared scorer; the candidate portion of an assessment-only response is ignored.
  useEffect(() => {
    const snapshot = liveState.current;
    if (snapshot.mode !== 'design' || !candidateResultsFresh(snapshot) || !snapshot.baseline
      || snapshot.baselineAssessmentStatus === 'ready' || snapshot.baselineAssessmentStatus === 'error') return;
    const baseline = snapshot.baseline;
    const key = requirementsKey(snapshot.draft);
    const seq = ++assessmentSeq.current;
    const controller = new AbortController();
    assessmentController.current = controller;
    send({ type: 'assessment-start', seq, baselineId: baseline.id, key });
    void requestDesignSearch({ ...requirementsFrom(snapshot.draft), baseline: deviceParams(baseline.params) }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || seq !== assessmentSeq.current) return;
        if (!result.baseline_evaluation) throw new SearchRequestError('Search did not return the requested baseline assessment.');
        send({ type: 'assessment-success', seq, baselineId: baseline.id, key, assessment: result.baseline_evaluation });
      })
      .catch((error) => {
        if (controller.signal.aborted || seq !== assessmentSeq.current) return;
        send({ type: 'assessment-failure', seq, baselineId: baseline.id, key,
          error: error instanceof Error ? error.message : 'Baseline assessment failed.' });
      });
    return () => controller.abort();
  }, [state.mode, fresh, draftKey, baselineId, state.assessmentRetry, send]);

  useEffect(() => () => {
    searchController.current?.abort(); assessmentController.current?.abort();
  }, []);

  const view = designDisplay(state, applied);
  return {
    mode: state.mode, status: state.status, draft: state.draft, lastRun: state.lastRun,
    candidateResultsFresh: fresh, error: state.error, fieldErrors: state.fieldErrors,
    recommendedCandidate: fresh ? state.lastRun!.selected : null, inspectedCandidate: view.inspected,
    displayParams: view.params, displaySource: view.inspected ? 'candidate' : 'applied',
    baseline: state.baseline, baselineAssessmentStatus: state.baselineAssessmentStatus,
    baselineAssessment: state.baselineAssessment, baselineAssessmentError: state.baselineAssessmentError,
    comparison: classifyComparison({ baseline: state.baseline, baselineAssessment: state.baselineAssessment,
      baselineAssessmentStatus: state.baselineAssessmentStatus, run: state.lastRun,
      inspectedCandidate: view.inspected, candidateResultsFresh: fresh }),
    selectionExplanation: fresh ? explainSelection(state.lastRun!) : null,
    enterDesign, exitDesign, setRequirements, search,
    inspectCandidate: (id) => send({ type: 'inspect', id }),
    clearInspection: () => send({ type: 'inspect', id: null }),
    getDisplayEvaluation: (evaluation) => displayEvaluation(state, applied, evaluation),
    applyInspected: (evaluation) => {
      const current = liveState.current;
      if (!displayEvaluation(current, applied, evaluation).canApply) return false;
      const target = designDisplay(current, applied);
      onApply({ params: deviceParams(target.inspected!), source: target.source });
      return true;
    },
    pinBaseline: (evaluation) => {
      const current = liveState.current;
      const guarded = displayEvaluation(current, applied, evaluation);
      if (!guarded.canPin || !guarded.result) return false;
      const target = designDisplay(current, applied);
      send({ type: 'pin', baseline: createFrozenBaseline(`baseline-${++pinSeq.current}`, guarded.result, target.source),
        assessmentSeq: invalidateAssessment() });
      return true;
    },
    clearBaseline: () => send({ type: 'clear-baseline', assessmentSeq: invalidateAssessment() }),
    retryBaselineAssessment: () => send({ type: 'assessment-retry', seq: invalidateAssessment() }),
  };
}
