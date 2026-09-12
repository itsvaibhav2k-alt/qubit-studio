import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyComparison, explainSelection } from './search-comparison.ts';
import type { ComparisonInput } from './search-comparison.ts';
import { createFrozenBaseline, sourceForCandidate } from './search-baseline.ts';
import { parseSearchResponse } from './search-params.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
const loose = parseSearchResponse(fixture.searches.loose);
const tight = parseSearchResponse(fixture.searches.tight);
function input(): ComparisonInput {
  return {
    baseline: createFrozenBaseline('one', fixture.evaluations[loose.selected!.candidate_id], sourceForCandidate(loose.selected!, loose)),
    baselineAssessment: structuredClone(tight.baseline_evaluation), baselineAssessmentStatus: 'ready',
    run: structuredClone(tight), inspectedCandidate: structuredClone(tight.selected), candidateResultsFresh: true,
  };
}
test('real 10 to 1 kHz recommendation change is a comparable tightening cost', () => {
  const out = classifyComparison(input());
  assert.equal(out.kind, 'tightening_cost');
  assert.equal(out.comparable_recommendations, true);
  assert.deepEqual(out.changed_requirements, ['max_dispersion_khz']);
  assert.ok(Math.abs(out.delta_anharmonicity_mhz! + 40.8141002241) < 1e-6);
});
test('arbitrary pin, Explore pin, rejected preview, and nonrecommended preview are candidate comparisons', () => {
  const cases = [input(), input(), input(), input()];
  cases[0].baseline!.source!.kind = 'candidate';
  cases[1].baseline!.source = null;
  cases[2].inspectedCandidate = tight.candidates.find((p) => !p.feasible)!;
  cases[3].inspectedCandidate = tight.candidates.find((p) => p.feasible && p.candidate_id !== tight.selected!.candidate_id)!;
  for (const item of cases) {
    const out = classifyComparison(item);
    assert.equal(out.kind, 'candidate_comparison');
    assert.equal(out.comparable_recommendations, false);
  }
});
test('changed target, domain, grid, cutoff, model and originating model break comparability', () => {
  const cases = [input(), input(), input(), input(), input(), input(), input()];
  cases[0].run = parseSearchResponse(fixture.searches.changedTarget);
  cases[1].run!.request.ratio_min = 21;
  cases[2].run!.request.points = 101;
  cases[3].run!.request.ncut = 40;
  cases[4].run!.model_version = 'v2';
  cases[5].baseline!.source!.candidate.model_version = 'v0';
  cases[6].baseline!.source!.candidate.dispersion_resolution_khz = 0.01;
  for (const item of cases) assert.equal(classifyComparison(item).kind, 'changed_context');
});
test('loosening and crossed requirements do not get a tightening-cost label', () => {
  const a = input();
  a.baseline!.source!.requirements.min_anharmonicity_mhz = 250;
  assert.equal(classifyComparison(a).kind, 'candidate_comparison');
  a.baseline!.source!.requirements.min_anharmonicity_mhz = 200;
  a.run!.request.max_dispersion_khz = 20;
  assert.equal(classifyComparison(a).kind, 'candidate_comparison');
});
test('same recommendation is unchanged; subthreshold and anomalous changes are unresolved', () => {
  const a = input();
  a.run!.selected = structuredClone(loose.selected);
  a.inspectedCandidate = a.run!.selected;
  assert.equal(classifyComparison(a).kind, 'unchanged');
  const b = input();
  b.inspectedCandidate!.anharmonicity_mhz = b.baseline!.result.anharmonicity_mhz + 1e-6;
  assert.equal(classifyComparison(b).kind, 'unresolved');
  b.inspectedCandidate!.anharmonicity_mhz = b.baseline!.result.anharmonicity_mhz + 1;
  assert.equal(classifyComparison(b).kind, 'unresolved');
});
test('candidate freshness and independent baseline assessment gate comparisons', () => {
  const a = input();
  a.candidateResultsFresh = false;
  assert.equal(classifyComparison(a).kind, 'pending');
  a.candidateResultsFresh = true;
  a.baselineAssessmentStatus = 'running';
  assert.equal(classifyComparison(a).kind, 'pending');
  a.baselineAssessmentStatus = 'error';
  assert.equal(classifyComparison(a).kind, 'unresolved');
  a.baseline = null;
  assert.equal(classifyComparison(a).kind, 'none');
});
test('empty grid never implies a failing baseline; null dispersion is not zero', () => {
  const a = input();
  a.run = parseSearchResponse(fixture.searches.infeasible);
  a.inspectedCandidate = null;
  a.baselineAssessment!.assessment.feasible = true; // state-semantic case, not numerical evidence
  assert.match(classifyComparison(a).message, /baseline still passes/);
  assert.equal(classifyComparison(a).kind, 'infeasible');
  const b = input();
  b.baseline!.result.dispersion_khz = null;
  b.baseline!.result.dispersion_status = 'below_reporting_floor';
  assert.equal(classifyComparison(b).delta_dispersion_khz, null);
});
test('explanations enumerate evaluated rejection reasons and do not invent a charge constraint', () => {
  const actual = explainSelection(tight);
  assert.match(actual, /evaluated candidates with larger A fail/);
  for (const { count } of tight.selection_evidence.higher_a_rejections) assert.ok(actual.includes(`(${count})`));
  const a = structuredClone(loose);
  a.selection_evidence = { kind: 'grid_boundary', higher_a_count: 0, higher_a_rejections: [], selected_at_ratio_boundary: 'lower' };
  assert.match(explainSelection(a), /lower EJ\/EC search bound/);
  assert.doesNotMatch(explainSelection(a), /charge|closest/);
  a.selection_evidence = { kind: 'higher_a_rejected', higher_a_count: 3, higher_a_rejections: [{ reason: 'ec_upper_ghz', count: 3 }], selected_at_ratio_boundary: null };
  assert.match(explainSelection(a), /EC upper bound \(3\)/);
  assert.doesNotMatch(explainSelection(a), /charge|closest/);
  assert.match(explainSelection(parseSearchResponse(fixture.searches.infeasible)), /minimum transition-spacing difference/);
});
