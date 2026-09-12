import type { BaselineAssessment, BaselineAssessmentStatus, DesignComparison, FrozenBaseline, SearchCandidate, SearchRequirements, SearchResponse, Violation } from './search-types.ts';
import { SEARCH_KEYS } from './search-params.ts';
import { sameDeviceParams } from './search-baseline.ts';

const CONTEXT_KEYS: (keyof SearchRequirements)[] = SEARCH_KEYS.filter((key) => key !== 'max_dispersion_khz' && key !== 'min_anharmonicity_mhz');
export interface ComparisonInput {
  baseline: FrozenBaseline | null;
  baselineAssessment: BaselineAssessment | null;
  baselineAssessmentStatus: BaselineAssessmentStatus;
  run: SearchResponse | null;
  inspectedCandidate: SearchCandidate | null;
  candidateResultsFresh: boolean;
}

/** A loss in A is a tightening cost only between recommendations on the same
 * evaluated path, objective and numerical settings, with nested requirements.
 * Baseline eligibility is independent evidence, never inferred from grid status.
 */
export function classifyComparison(input: ComparisonInput): DesignComparison {
  const { baseline, baselineAssessment, baselineAssessmentStatus, run, inspectedCandidate: current } = input;
  const base: DesignComparison = { kind: 'none', message: 'Pin an evaluated device to compare.',
    delta_anharmonicity_mhz: null, delta_dispersion_khz: null,
    comparable_recommendations: false, changed_requirements: [] };
  if (!baseline) return base;
  if (!input.candidateResultsFresh || !run) return { ...base, kind: 'pending', message: 'Run the current requirements before comparing.' };
  if (baselineAssessmentStatus !== 'ready' || !baselineAssessment || !sameDeviceParams(baseline.params, baselineAssessment.params)) {
    return { ...base, kind: baselineAssessmentStatus === 'error' ? 'unresolved' : 'pending',
      message: baselineAssessmentStatus === 'error' ? 'The baseline assessment failed. Retry it to compare.' : 'Assessing the frozen baseline against these requirements.' };
  }
  const source = baseline.source;
  const changed = source ? SEARCH_KEYS.filter((key) => source.requirements[key] !== run.request[key]) : [];
  const deltaA = current ? current.anharmonicity_mhz - baseline.result.anharmonicity_mhz : null;
  const deltaD = current?.dispersion_khz != null && baseline.result.dispersion_khz !== null
    ? current.dispersion_khz - baseline.result.dispersion_khz : null;
  const values = { ...base, delta_anharmonicity_mhz: deltaA, delta_dispersion_khz: deltaD, changed_requirements: changed };
  const contextChanged = changed.some((key) => CONTEXT_KEYS.includes(key))
    || baseline.result.model !== run.model || baseline.result.model_version !== run.model_version
    || baseline.result.ncut !== run.request.ncut
    || baseline.result.dispersion_resolution_khz !== run.dispersion_resolution_khz
    || (source !== null && (source.selection_rule !== run.selection_rule || source.optimality_scope !== run.optimality_scope
      || source.candidate.model !== baseline.result.model || source.candidate.model_version !== baseline.result.model_version
      || source.candidate.dispersion_resolution_khz !== baseline.result.dispersion_resolution_khz));
  if (contextChanged) return { ...values, kind: 'changed_context', message: 'The target, search domain, grid, model, or numerical settings changed. These results do not isolate a requirement-tightening cost.' };
  if (run.status === 'infeasible') return { ...values, kind: 'infeasible', message: baselineAssessment.assessment.feasible
    ? 'No evaluated grid candidate qualifies. The frozen baseline still passes its separate assessment; the grid does not cover every possible device.'
    : 'No evaluated grid candidate qualifies. The frozen baseline also fails its separate assessment. This is not a global impossibility result.' };
  if (!current) return { ...values, message: 'Inspect a current candidate to compare with the frozen baseline.' };
  const recommendations = source?.kind === 'recommendation'
    && sameDeviceParams(source.candidate, baseline.params)
    && current.candidate_id === run.selected?.candidate_id;
  if (!recommendations) return { ...values, kind: 'candidate_comparison', message: 'This compares individually selected devices. The difference is not attributed to tightening requirements.' };
  const old = source.requirements;
  const tighter = run.request.max_dispersion_khz <= old.max_dispersion_khz
    && run.request.min_anharmonicity_mhz >= old.min_anharmonicity_mhz;
  if (!tighter) return { ...values, kind: 'candidate_comparison', message: 'The requirements were loosened or changed in opposing directions. This is a recommendation comparison, with no isolated tightening cost.' };
  const comparable = { ...values, comparable_recommendations: true };
  if (sameDeviceParams(current, baseline.params)) return { ...comparable, kind: 'unchanged', message: 'The same evaluated design remains the recommendation.' };
  const resolution = Math.max(source.comparison_resolution_mhz, run.comparison_resolution_mhz);
  if (deltaA === null || Math.abs(deltaA) <= resolution) return { ...comparable, kind: 'unresolved', message: 'The change in transition-spacing difference is within the reported engineering comparison threshold.' };
  if (changed.length > 0 && deltaA < -resolution) return { ...comparable, kind: 'tightening_cost', message: `The tighter requirements reduce the largest qualifying transition-spacing difference by ${(-deltaA).toFixed(3)} MHz on this evaluated grid.` };
  return { ...comparable, kind: 'unresolved', message: 'The returned recommendations do not establish the expected tightening trade-off. Inspect their evaluated evidence before attributing a cost.' };
}

const REASONS: Record<Violation, string> = {
  charge_budget_khz: 'charge-variation ceiling', charge_budget_numerical_buffer: 'charge-budget numerical buffer',
  anharmonicity_floor_mhz: 'minimum transition-spacing difference',
  ej_lower_ghz: 'EJ lower bound', ej_upper_ghz: 'EJ upper bound',
  ec_lower_ghz: 'EC lower bound', ec_upper_ghz: 'EC upper bound',
  ratio_lower: 'EJ/EC lower bound', ratio_upper: 'EJ/EC upper bound',
  requires_negative_anharmonicity: 'negative-alpha requirement',
  frequency_lock_numerical_error: 'frequency-lock tolerance', frequency_target_mismatch: 'target frequency',
  design_reference_ng_mismatch: 'Design reference offset charge ng = 0',
};
export function explainSelection(run: SearchResponse): string {
  const evidence = run.selection_evidence;
  if (!run.selected) {
    const counts = new Map<Violation, number>();
    for (const p of run.candidates) for (const reason of p.violations) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    const reasons = [...counts].map(([reason, count]) => `${REASONS[reason]} (${count})`).join('; ');
    return `No qualifying design among ${run.evaluated_count} evaluated candidates.${reasons ? ` Recorded failures: ${reasons}. A candidate can fail multiple checks.` : ''}`;
  }
  const prefix = `Largest qualifying transition-spacing difference among ${run.evaluated_count} evaluated candidates.`;
  const boundary = evidence.selected_at_ratio_boundary
    ? ` The selected design is at the ${evidence.selected_at_ratio_boundary} EJ/EC search bound.` : '';
  if (evidence.higher_a_count > 0) {
    const reasons = evidence.higher_a_rejections.map(({ reason, count }) => `${REASONS[reason]} (${count})`).join('; ');
    return `${prefix} ${evidence.higher_a_count} evaluated candidates with larger A fail: ${reasons}. A candidate can fail multiple checks.${boundary}`;
  }
  return `${prefix} No evaluated candidate has larger A.${boundary}`;
}
