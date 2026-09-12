import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SEARCH_REQUIREMENTS, parseSearchResponse, SEARCH_BOUNDS, validateSearchRequest } from './search-params.ts';
import type { SearchRequirements } from './search-types.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
test('request validation rejects coercions, nonfinite values, unknown fields and invalid ordered bounds', () => {
  for (const [key, bounds] of Object.entries(SEARCH_BOUNDS)) {
    for (const value of [null, true, false, '5', NaN, Infinity, -Infinity, bounds.min - 1, bounds.max + 1,
      ...(bounds.integer ? [bounds.min + 0.5] : [])]) {
      const out = validateSearchRequest({ [key]: value });
      assert.equal(out.valid, false, `${key}=${value}`);
      if (!out.valid) assert.ok(out.fieldErrors[key]);
    }
  }
  for (const body of [null, [], 5, { extra: 1 }, { ratio_min: 70, ratio_max: 30 }, { ec_min_ghz: 1, ec_max_ghz: 1 }, { ej_min_ghz: 40, ej_max_ghz: 30 }])
    assert.equal(validateSearchRequest(body).valid, false);
  assert.deepEqual(validateSearchRequest({}), { valid: true, request: { ...DEFAULT_SEARCH_REQUIREMENTS, baseline: null } });
});
test('frozen baseline inputs are complete, independently validated and never clamped', () => {
  const params = fixture.searches.tight.request.baseline;
  assert.deepEqual(validateSearchRequest({ baseline: params }), { valid: true, request: { ...DEFAULT_SEARCH_REQUIREMENTS, baseline: params } });
  for (const baseline of [{}, { ...params, ncut: 40.1 }, { ...params, ej_ghz: '15' }, { ...params, ng: 2 }, { ...params, extra: 1 }])
    assert.equal(validateSearchRequest({ baseline }).valid, false);
});
test('all real HTTP fixtures satisfy the shared runtime contract', () => {
  assert.equal(fixture.provenance.synthetic, false);
  for (const run of Object.values(fixture.searches)) assert.doesNotThrow(() => parseSearchResponse(run));
});
test('malformed, mismatched or incomplete evidence is rejected before becoming state', () => {
  const mutations = [
    (r: typeof fixture.searches.loose) => { r.request = {}; },
    (r: typeof fixture.searches.loose) => { delete r.request.ncut; },
    (r: typeof fixture.searches.loose) => { r.selected = null; },
    (r: typeof fixture.searches.loose) => { r.feasible_count++; },
    (r: typeof fixture.searches.loose) => { r.candidates[0].candidate_id = r.candidates[1].candidate_id; },
    (r: typeof fixture.searches.loose) => { r.candidates[0].ng = 0.5; },
    (r: typeof fixture.searches.loose) => { r.candidates[0].margins.charge_budget_khz = NaN; },
    (r: typeof fixture.searches.loose) => { r.candidates[0].violations = ['invented']; },
    (r: typeof fixture.searches.loose) => { r.selection_evidence.higher_a_rejections[0].reason = 'closest'; },
    (r: typeof fixture.searches.loose) => { r.selection_evidence.higher_a_rejections[0].count++; },
    (r: typeof fixture.searches.loose) => { r.selection_evidence.higher_a_count++; },
    (r: typeof fixture.searches.loose) => { r.selection_evidence.selected_at_ratio_boundary = 'lower'; },
    (r: typeof fixture.searches.loose) => { r.candidates[0].dispersion_status = 'below_reporting_floor'; },
  ];
  for (const mutate of mutations) { const run = structuredClone(fixture.searches.loose); mutate(run); assert.throws(() => parseSearchResponse(run), /response contract/); }
});
test('response may contain fewer distinct candidates than requested for a tiny representable domain', () => {
  const run = structuredClone(fixture.searches.loose);
  // Valid wire shape for exact-ID de-duplication. Numerical narrow-grid test is in Python.
  run.request.points = 1001 satisfies SearchRequirements['points'];
  assert.doesNotThrow(() => parseSearchResponse(run));
});
