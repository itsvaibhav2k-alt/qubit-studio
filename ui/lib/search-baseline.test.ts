import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrozenBaseline, deviceParams, guardEvaluation, sourceForApplied, sourceForCandidate } from './search-baseline.ts';
import { parseSearchResponse } from './search-params.ts';
import type { DeviceResult } from './types.ts';
import type { EvaluateHandle } from './useEvaluate.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
const run = parseSearchResponse(fixture.searches.loose);
const selected = run.selected!;
const evaluated: DeviceResult = fixture.evaluations[selected.candidate_id];
function ready(result = evaluated): EvaluateHandle {
  return { result, status: 'ready', stale: false, seq: 3, appliedSeq: 3, error: null, retry() {} };
}

test('freeze preserves full precision, original requirements and complete arrays', () => {
  const result = structuredClone(evaluated);
  const source = sourceForCandidate(selected, run);
  const pin = createFrozenBaseline('pin', result, source);
  result.levels_ghz[1] = -999;
  source.requirements.max_dispersion_khz = 1;
  source.candidate.ej_ghz = 0;
  assert.deepEqual(pin.params, deviceParams(evaluated));
  assert.equal(pin.result.levels_ghz[1], evaluated.levels_ghz[1]);
  assert.equal(pin.source!.requirements.max_dispersion_khz, 10);
  assert.equal(pin.source!.candidate.ej_ghz, selected.ej_ghz);
});
test('parameter, cutoff and sequence freshness guard the old ready frame', () => {
  for (const params of [
    { ...deviceParams(evaluated), ej_ghz: evaluated.ej_ghz + 1e-10 },
    { ...deviceParams(evaluated), ncut: 40 },
    { ...deviceParams(evaluated), ng: 0.25 },
  ]) {
    const guarded = guardEvaluation(ready(), params, true, true, selected);
    assert.equal(guarded.result, null);
    assert.equal(guarded.status, 'loading');
    assert.equal(guarded.canApply, false);
    assert.equal(guarded.canPin, false);
  }
  assert.equal(guardEvaluation({ ...ready(), seq: 4 }, evaluated, true, true).canPin, false);
  assert.equal(guardEvaluation({ ...ready(), stale: true }, evaluated, true, true).canApply, false);
});
test('only a ready matching complete evaluation enables authorized actions', () => {
  assert.equal(guardEvaluation(ready(), selected, true, true, selected).canApply, true);
  assert.equal(guardEvaluation(ready(), selected, true, false, selected).canApply, false);
  assert.equal(guardEvaluation(ready(), selected, false, false, selected).canPin, false);
  for (const patch of [
    { model_version: 'different' }, { dispersion_resolution_khz: 0.1 },
    { charge_response: [null, null] }, { levels_ghz: [0, 1, NaN, 3] },
    { dispersion_status: 'resolved', dispersion_khz: null },
  ]) {
    const result = { ...evaluated, ...patch } as DeviceResult;
    const guarded = guardEvaluation(ready(result), selected, true, true, selected);
    assert.equal(guarded.status, 'error');
    assert.equal(guarded.result, null);
    assert.equal(guarded.canPin, false);
  }
});
test('arbitrary selections and manual applied edits do not gain recommendation provenance', () => {
  const candidate = run.candidates.find((p) => p.candidate_id !== selected.candidate_id)!;
  assert.equal(sourceForCandidate(candidate, run).kind, 'candidate');
  const source = sourceForCandidate(selected, run);
  assert.equal(sourceForApplied({ params: deviceParams(selected), source })!.kind, 'recommendation');
  assert.equal(sourceForApplied({ params: { ...deviceParams(selected), ng: 0.1 }, source }), null);
});
