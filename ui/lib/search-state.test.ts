import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidateResultsFresh, initialSearchState, searchReducer } from './search-state.ts';
import { createFrozenBaseline, sourceForCandidate } from './search-baseline.ts';
import { parseSearchResponse, requirementsKey } from './search-params.ts';
import type { SearchState } from './search-state.ts';
import type { SearchResponse } from './search-types.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
const loose = parseSearchResponse(fixture.searches.loose);
const tight = parseSearchResponse(fixture.searches.tight);
const pin = createFrozenBaseline('one', fixture.evaluations[loose.selected!.candidate_id], sourceForCandidate(loose.selected!, loose));
function fresh(run = loose): SearchState {
  let state = searchReducer(initialSearchState(), { type: 'enter', ncut: 30 });
  state = searchReducer(state, { type: 'edit', patch: run.request, seq: 1, assessmentSeq: 1 });
  state = searchReducer(state, { type: 'start', seq: 2, assessmentSeq: 2 });
  return searchReducer(state, { type: 'success', seq: 2, result: run, baselineId: null, assessmentSeq: 2 });
}
test('first entry initializes Design ncut once; subsequent Explore changes do not track it', () => {
  let state = searchReducer(initialSearchState(), { type: 'enter', ncut: 40 });
  assert.equal(state.draft.ncut, 40);
  state = searchReducer(state, { type: 'edit', patch: { ncut: 50 }, seq: 1, assessmentSeq: 1 });
  state = searchReducer(state, { type: 'exit', seq: 2, assessmentSeq: 2 });
  state = searchReducer(state, { type: 'enter', ncut: 60 });
  assert.equal(state.draft.ncut, 50);
});
test('fresh success inspects the recommendation; rejected candidates remain inspectable', () => {
  let state = fresh();
  assert.equal(state.status, 'ready');
  assert.equal(state.inspectedId, loose.selected!.candidate_id);
  const rejected = loose.candidates.find((p) => !p.feasible)!;
  state = searchReducer(state, { type: 'inspect', id: rejected.candidate_id });
  assert.equal(state.inspectedId, rejected.candidate_id);
  assert.equal(state.lastRun!.selected!.candidate_id, loose.selected!.candidate_id);
  assert.equal(state.baseline, null);
  assert.equal(searchReducer(state, { type: 'inspect', id: 'not-in-run' }), state);
});
test('edits invalidate in-flight results before a new search is submitted', () => {
  let state = fresh();
  state = searchReducer(state, { type: 'start', seq: 3, assessmentSeq: 3 });
  state = searchReducer(state, { type: 'edit', patch: { target_ghz: 6 }, seq: 4, assessmentSeq: 4 });
  const edited = state;
  state = searchReducer(state, { type: 'success', seq: 3, result: loose, baselineId: null, assessmentSeq: 3 });
  assert.equal(state, edited);
  state = searchReducer(state, { type: 'failure', seq: 3, error: 'late error', baselineId: null, assessmentSeq: 3 });
  assert.equal(state, edited);
  assert.equal(state.status, 'dirty');
  assert.equal(candidateResultsFresh(state), false);
  assert.equal(state.inspectedId, null);
  assert.equal(state.lastRun!.request.target_ghz, 5);
});
test('two submissions with identical requirements still have different generations', () => {
  let state = fresh();
  state = searchReducer(state, { type: 'start', seq: 3, assessmentSeq: 3 });
  state = searchReducer(state, { type: 'start', seq: 4, assessmentSeq: 4 });
  assert.equal(searchReducer(state, { type: 'success', seq: 3, result: loose, baselineId: null, assessmentSeq: 3 }), state);
});
test('batched exit/re-entry publishes a new assessment intent even when final mode is unchanged', () => {
  let state = searchReducer(fresh(tight), { type: 'pin', baseline: pin, assessmentSeq: 3 });
  const key = requirementsKey(state.draft);
  state = searchReducer(state, { type: 'assessment-success', seq: 3, baselineId: 'one', key, assessment: tight.baseline_evaluation! });
  const intent = state.assessmentRetry;
  state = searchReducer(state, { type: 'exit', seq: 3, assessmentSeq: 4 });
  state = searchReducer(state, { type: 'enter', ncut: 30 });
  assert.equal(state.mode, 'design');
  assert.equal(state.baselineAssessmentStatus, 'pending');
  assert.ok(state.assessmentRetry > intent);
  assert.equal(candidateResultsFresh(state), true);
});
test('pin/clear preserve current candidate results and inspection', () => {
  const state = fresh();
  const pinned = searchReducer(state, { type: 'pin', baseline: pin, assessmentSeq: 3 });
  assert.equal(candidateResultsFresh(pinned), true);
  assert.equal(pinned.lastRun, state.lastRun);
  assert.equal(pinned.inspectedId, state.inspectedId);
  assert.equal(pinned.baselineAssessmentStatus, 'pending');
  const cleared = searchReducer(pinned, { type: 'clear-baseline', assessmentSeq: 4 });
  assert.equal(candidateResultsFresh(cleared), true);
  assert.equal(cleared.lastRun, state.lastRun);
  assert.equal(cleared.inspectedId, state.inspectedId);
  assert.equal(cleared.baselineAssessmentStatus, 'absent');
});
test('baseline replacement during search accepts candidates but discards the old baseline assessment', () => {
  let state = searchReducer(fresh(tight), { type: 'pin', baseline: pin, assessmentSeq: 3 });
  state = searchReducer(state, { type: 'start', seq: 3, assessmentSeq: 4 });
  state = searchReducer(state, { type: 'pin', baseline: { ...pin, id: 'two' }, assessmentSeq: 5 });
  state = searchReducer(state, { type: 'success', seq: 3, result: tight, baselineId: 'one', assessmentSeq: 4 });
  assert.equal(candidateResultsFresh(state), true);
  assert.equal(state.baseline!.id, 'two');
  assert.equal(state.baselineAssessment, null);
  assert.equal(state.baselineAssessmentStatus, 'pending');
});
test('late independent assessments cannot attach after replacement, clear, or edits', () => {
  let state = searchReducer(fresh(tight), { type: 'pin', baseline: pin, assessmentSeq: 3 });
  const key = requirementsKey(state.draft);
  state = searchReducer(state, { type: 'assessment-start', seq: 4, baselineId: 'one', key });
  for (const next of [
    searchReducer(state, { type: 'clear-baseline', assessmentSeq: 5 }),
    searchReducer(state, { type: 'pin', baseline: { ...pin, id: 'two' }, assessmentSeq: 5 }),
    searchReducer(state, { type: 'edit', patch: { target_ghz: 6 }, seq: 3, assessmentSeq: 5 }),
  ]) {
    assert.equal(searchReducer(next, { type: 'assessment-success', seq: 4, baselineId: 'one', key, assessment: tight.baseline_evaluation! }), next);
    assert.equal(searchReducer(next, { type: 'assessment-failure', seq: 4, baselineId: 'one', key, error: 'late' }), next);
  }
});
test('baseline failure and retry do not fail or dirty a valid candidate set', () => {
  let state = searchReducer(fresh(tight), { type: 'pin', baseline: pin, assessmentSeq: 3 });
  const key = requirementsKey(state.draft);
  state = searchReducer(state, { type: 'assessment-start', seq: 4, baselineId: 'one', key });
  state = searchReducer(state, { type: 'assessment-failure', seq: 4, baselineId: 'one', key, error: 'service unavailable' });
  assert.equal(state.status, 'ready');
  assert.equal(state.baselineAssessmentStatus, 'error');
  assert.equal(candidateResultsFresh(state), true);
  state = searchReducer(state, { type: 'assessment-retry', seq: 5 });
  assert.equal(state.baselineAssessmentStatus, 'pending');
  assert.equal(candidateResultsFresh(state), true);
});
test('an empty grid accepts a separately passing frozen baseline without inventing a winner', () => {
  // Deliberate state-machine fixture: scoring itself is covered by the real Python test.
  const run: SearchResponse = structuredClone(fixture.searches.infeasible);
  run.baseline_evaluation!.assessment.feasible = true;
  run.baseline_evaluation!.assessment.violations = [];
  let state = searchReducer(fresh(run), { type: 'pin', baseline: pin, assessmentSeq: 3 });
  state = searchReducer(state, { type: 'start', seq: 3, assessmentSeq: 4 });
  state = searchReducer(state, { type: 'success', seq: 3, result: run, baselineId: 'one', assessmentSeq: 4 });
  assert.equal(state.status, 'infeasible');
  assert.equal(state.inspectedId, null);
  assert.equal(state.baselineAssessment!.assessment.feasible, true);
});
