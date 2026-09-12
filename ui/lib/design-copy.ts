/**
 * Presentation copy for Design mode. Labels and formatters only — no
 * classification. Outcome kinds and messages come from lib/search-comparison.ts.
 */
import { SEARCH_BOUNDS, DEFAULT_SEARCH_REQUIREMENTS } from './search-params';
import type { ComparisonKind, SearchRequirements, Violation } from './search-types';
import { num } from './format';

export type RequirementKey = 'target_ghz' | 'max_dispersion_khz' | 'min_anharmonicity_mhz';

export interface RequirementSpec {
  key: RequirementKey;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  fallback: number;
  /** Slider positions on a log scale; the numeric field stays exact. */
  log?: boolean;
  meaning: string;
}

/** Bounds come from the shared contract; nothing here re-declares validation. */
export const REQUIREMENTS: RequirementSpec[] = [
  {
    key: 'target_ghz',
    label: 'Target frequency',
    symbol: 'f01',
    unit: 'GHz',
    min: SEARCH_BOUNDS.target_ghz.min,
    max: SEARCH_BOUNDS.target_ghz.max,
    step: 0.01,
    digits: 3,
    fallback: DEFAULT_SEARCH_REQUIREMENTS.target_ghz,
    meaning: 'Every candidate is tuned so its first transition lands exactly here. EJ and EC move together to keep it true.',
  },
  {
    key: 'max_dispersion_khz',
    label: 'Max charge variation',
    symbol: '|f01(½) − f01(0)|',
    unit: 'kHz',
    min: SEARCH_BOUNDS.max_dispersion_khz.min,
    max: SEARCH_BOUNDS.max_dispersion_khz.max,
    step: 0.001,
    digits: 3,
    fallback: DEFAULT_SEARCH_REQUIREMENTS.max_dispersion_khz,
    log: true,
    meaning: 'Ceiling on how much f01 may shift as the offset charge sweeps from 0 to ½. Lower is stricter.',
  },
  {
    key: 'min_anharmonicity_mhz',
    label: 'Min separation',
    symbol: 'A = f01 − f12',
    unit: 'MHz',
    min: SEARCH_BOUNDS.min_anharmonicity_mhz.min,
    max: SEARCH_BOUNDS.min_anharmonicity_mhz.max,
    step: 1,
    digits: 0,
    fallback: DEFAULT_SEARCH_REQUIREMENTS.min_anharmonicity_mhz,
    meaning: 'Floor on the gap between the first two transition frequencies. A is positive; the signed anharmonicity α is its negative.',
  },
];

export const REQUIREMENT_BY_KEY: Record<RequirementKey, RequirementSpec> = Object.fromEntries(
  REQUIREMENTS.map((spec) => [spec.key, spec]),
) as Record<RequirementKey, RequirementSpec>;

/** One-line summary of the three user-facing requirements. */
export function requirementsSummary(r: SearchRequirements): string {
  return `${num(r.target_ghz, 3)} GHz · ≤ ${num(r.max_dispersion_khz, 3)} kHz · ≥ ${num(r.min_anharmonicity_mhz, 0)} MHz`;
}

/** Search range printed on results so a finite grid is never mistaken for the whole domain. */
export function searchRangeSummary(r: SearchRequirements): string {
  return `EJ/EC ${num(r.ratio_min, 0)}–${num(r.ratio_max, 0)} · EJ ${num(r.ej_min_ghz, 2)}–${num(r.ej_max_ghz, 2)} GHz · EC ${num(r.ec_min_ghz, 3)}–${num(r.ec_max_ghz, 3)} GHz · ${r.points} points · ncut ${r.ncut}`;
}

export const VIOLATION_LABELS: Record<Violation, string> = {
  charge_budget_khz: 'charge variation above the limit',
  charge_budget_numerical_buffer: 'charge variation within the numerical buffer of the limit',
  anharmonicity_floor_mhz: 'separation below the minimum',
  ej_lower_ghz: 'EJ below the search range',
  ej_upper_ghz: 'EJ above the search range',
  ec_lower_ghz: 'EC below the search range',
  ec_upper_ghz: 'EC above the search range',
  ratio_lower: 'EJ/EC below the search range',
  ratio_upper: 'EJ/EC above the search range',
  requires_negative_anharmonicity: 'anharmonicity is not negative',
  frequency_lock_numerical_error: 'frequency lock outside tolerance',
  frequency_target_mismatch: 'f01 does not match the target',
  design_reference_ng_mismatch: 'not evaluated at ng = 0',
};

export function violationList(violations: Violation[]): string {
  return violations.map((v) => VIOLATION_LABELS[v]).join('; ');
}

export const COMPARISON_KIND_LABELS: Record<ComparisonKind, string> = {
  none: 'No baseline',
  pending: 'Comparison pending',
  tightening_cost: 'Cost of tightening',
  unchanged: 'Unchanged',
  infeasible: 'No qualifying design',
  candidate_comparison: 'Candidate comparison',
  changed_context: 'Not comparable',
  unresolved: 'Unresolved',
};

export const LOCK_NOTE =
  'Set by the frequency lock. Junction energy and charging energy move together so the first transition stays at the target.';

export const NG_DESIGN_NOTE =
  'Design candidates are evaluated at ng = 0. Charge variation is |f01(½) − f01(0)| from the sweep. Switch to Explore to bias ng.';

export const INFEASIBLE_SENTENCE = 'No evaluated design meets these requirements.';
