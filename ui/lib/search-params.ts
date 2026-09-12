import { PARAMS } from './params.ts';
import type { DeviceParams } from './types.ts';
import type { SearchRequest, SearchRequirements, SearchResponse } from './search-types.ts';

export const DEFAULT_SEARCH_REQUIREMENTS: SearchRequirements = {
  target_ghz: 5, max_dispersion_khz: 10, min_anharmonicity_mhz: 200,
  ratio_min: 20, ratio_max: 120, ej_min_ghz: 5, ej_max_ghz: 35,
  ec_min_ghz: 0.15, ec_max_ghz: 0.45, points: 401, ncut: 30,
};
export const SEARCH_BOUNDS: Record<keyof SearchRequirements, { min: number; max: number; integer?: boolean }> = {
  target_ghz: { min: 3, max: 8 }, max_dispersion_khz: { min: 0.01, max: 100000 },
  min_anharmonicity_mhz: { min: 0, max: 2000 },
  ratio_min: { min: 20, max: 120 }, ratio_max: { min: 20, max: 120 },
  ej_min_ghz: { min: 0.01, max: 50 }, ej_max_ghz: { min: 0.01, max: 50 },
  ec_min_ghz: { min: 0.01, max: 2 }, ec_max_ghz: { min: 0.01, max: 2 },
  points: { min: 21, max: 1001, integer: true }, ncut: { min: 20, max: 60, integer: true },
};
export const SEARCH_KEYS = Object.keys(DEFAULT_SEARCH_REQUIREMENTS) as (keyof SearchRequirements)[];
const DEVICE_KEYS = ['ej_ghz', 'ec_ghz', 'ng', 'ncut'] as const;
export function requirementsFrom(request: SearchRequirements): SearchRequirements {
  return Object.fromEntries(SEARCH_KEYS.map((key) => [key, request[key]])) as unknown as SearchRequirements;
}
export function requirementsKey(request: SearchRequirements): string {
  return JSON.stringify(SEARCH_KEYS.map((key) => request[key]));
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export type SearchValidation = { valid: true; request: SearchRequest } |
  { valid: false; fieldErrors: Record<string, string[]> };

export function validateSearchRequest(value: unknown): SearchValidation {
  const errors: Record<string, string[]> = {};
  const bad = (key: string, message: string) => { errors[key] = [message]; };
  if (!record(value)) return { valid: false, fieldErrors: { request: ['Expected a JSON object.'] } };
  for (const key of Object.keys(value)) if (!SEARCH_KEYS.includes(key as keyof SearchRequirements) && key !== 'baseline') bad(key, 'Unknown parameter.');
  const request = { ...DEFAULT_SEARCH_REQUIREMENTS } as SearchRequest;
  for (const key of SEARCH_KEYS) {
    const n = key in value ? value[key] : DEFAULT_SEARCH_REQUIREMENTS[key];
    const bound = SEARCH_BOUNDS[key];
    if (!finite(n) || n < bound.min || n > bound.max || (bound.integer && !Number.isInteger(n))) {
      bad(key, `Expected ${bound.integer ? 'an integer' : 'a finite number'} from ${bound.min} to ${bound.max}.`);
    } else request[key] = n;
  }
  for (const [lo, hi] of [['ratio_min', 'ratio_max'], ['ej_min_ghz', 'ej_max_ghz'], ['ec_min_ghz', 'ec_max_ghz']] as const) {
    if (!errors[lo] && !errors[hi] && request[lo] >= request[hi]) bad(lo, `Must be smaller than ${hi}.`);
  }
  request.baseline = null;
  if (value.baseline !== undefined && value.baseline !== null) {
    if (!record(value.baseline)) bad('baseline', 'Expected device parameters or null.');
    else {
      const baseline: Partial<DeviceParams> = {};
      for (const key of Object.keys(value.baseline)) if (!DEVICE_KEYS.includes(key as typeof DEVICE_KEYS[number])) bad(`baseline.${key}`, 'Unknown parameter.');
      for (const key of DEVICE_KEYS) {
        const n = value.baseline[key];
        const { min, max } = PARAMS[key];
        if (!finite(n) || n < min || n > max || (key === 'ncut' && !Number.isInteger(n))) bad(`baseline.${key}`, `Expected ${key === 'ncut' ? 'an integer' : 'a finite number'} from ${min} to ${max}.`);
        else baseline[key] = n;
      }
      request.baseline = baseline as DeviceParams;
    }
  }
  return Object.keys(errors).length ? { valid: false, fieldErrors: errors } : { valid: true, request };
}

/** Validate the service boundary before treating JSON as numerical evidence. */
export function parseSearchResponse(value: unknown): SearchResponse {
  const fail = (): never => { throw new Error('Search backend returned an invalid or outdated response contract.'); };
  if (!record(value)) return fail();
  const request = validateSearchRequest(value.request);
  if (!request.valid || !record(value.request) || !SEARCH_KEYS.every((key) => key in (value.request as Record<string, unknown>))
    || !Array.isArray(value.candidates) || !record(value.selection_evidence)) return fail();
  for (const key of ['model', 'model_version', 'selection_rule']) if (typeof value[key] !== 'string' || !value[key]) return fail();
  if (value.optimality_scope !== 'evaluated grid only' || !['feasible', 'infeasible'].includes(String(value.status))) return fail();
  for (const key of ['dispersion_resolution_khz', 'frequency_tolerance_ghz', 'charge_budget_buffer_khz', 'comparison_resolution_mhz']) if (!finite(value[key]) || value[key] <= 0) return fail();
  if (!finite(value.elapsed_ms) || value.elapsed_ms < 0 || !Number.isInteger(value.evaluated_count)
    || value.evaluated_count !== value.candidates.length || value.candidates.length < 1 || value.candidates.length > request.request.points) return fail();
  const marginKeys = ['charge_budget_khz', 'anharmonicity_floor_mhz', 'ej_lower_ghz', 'ej_upper_ghz', 'ec_lower_ghz', 'ec_upper_ghz', 'ratio_lower', 'ratio_upper', 'frequency_target_ghz'];
  const reasons = [...marginKeys.filter((key) => key !== 'frequency_target_ghz'), 'charge_budget_numerical_buffer', 'requires_negative_anharmonicity', 'frequency_lock_numerical_error', 'frequency_target_mismatch', 'design_reference_ng_mismatch'];
  const validateCandidate = (item: unknown) => {
    if (!record(item) || typeof item.candidate_id !== 'string' || !item.candidate_id || !record(item.margins)) return fail();
    for (const key of ['ej_ghz', 'ec_ghz', 'ng', 'ncut', 'ratio', 'f01_ghz', 'f12_ghz', 'alpha_mhz', 'anharmonicity_mhz', 'dispersion_upper_khz', 'dispersion_resolution_khz']) if (!finite(item[key])) return fail();
    if (item.model !== value.model || item.model_version !== value.model_version || item.dispersion_resolution_khz !== value.dispersion_resolution_khz) return fail();
    if (!Number.isInteger(item.ncut) || (item.ej_ghz as number) <= 0 || (item.ec_ghz as number) <= 0) return fail();
    for (const key of ['raw_levels_ghz', 'levels_ghz']) if (!Array.isArray(item[key]) || item[key].length < 4 || !item[key].every(finite)) return fail();
    if (!marginKeys.every((key) => finite((item.margins as Record<string, unknown>)[key]))) return fail();
    if (!Array.isArray(item.violations) || !item.violations.every((reason) => typeof reason === 'string' && reasons.includes(reason)) || item.feasible !== (item.violations.length === 0)) return fail();
    if (item.dispersion_status === 'resolved') {
      if (!finite(item.dispersion_khz) || item.dispersion_khz < (item.dispersion_resolution_khz as number)) return fail();
    } else if (item.dispersion_status !== 'below_reporting_floor' || item.dispersion_khz !== null) return fail();
    if ((item.dispersion_upper_khz as number) < (item.dispersion_resolution_khz as number)) return fail();
    return item;
  };
  const candidates = value.candidates.map(validateCandidate);
  if (new Set(candidates.map((p) => p.candidate_id)).size !== candidates.length) return fail();
  if (candidates.some((p) => p.ng !== 0 || p.ncut !== request.request.ncut)) return fail();
  const qualifying = candidates.filter((p) => p.feasible);
  if (value.feasible_count !== qualifying.length) return fail();
  if (qualifying.length === 0) {
    if (value.status !== 'infeasible' || value.selected !== null) return fail();
  } else {
    const selected = validateCandidate(value.selected);
    const member = candidates.find((p) => p.candidate_id === selected.candidate_id);
    if (value.status !== 'feasible' || !selected.feasible || !member || Object.keys(member).some((key) => JSON.stringify(member[key]) !== JSON.stringify(selected[key]))) return fail();
    if (selected.anharmonicity_mhz !== Math.max(...qualifying.map((p) => p.anharmonicity_mhz as number))) return fail();
  }
  if (request.request.baseline) {
    if (!record(value.baseline_evaluation) || !record(value.baseline_evaluation.params)) return fail();
    const p = validateCandidate(value.baseline_evaluation.assessment);
    if (DEVICE_KEYS.some((key) => value.baseline_evaluation && ((value.baseline_evaluation as Record<string, Record<string, unknown>>).params[key] !== request.request.baseline?.[key] || p[key] !== request.request.baseline?.[key]))) return fail();
  } else if (value.baseline_evaluation !== null) return fail();
  const e = value.selection_evidence;
  if (!['higher_a_rejected', 'grid_boundary', 'evaluated_maximum', 'infeasible'].includes(String(e.kind)) || !Number.isInteger(e.higher_a_count) || (e.higher_a_count as number) < 0 || ![null, 'lower', 'upper'].includes(e.selected_at_ratio_boundary as null | string) || !Array.isArray(e.higher_a_rejections)) return fail();
  if (!e.higher_a_rejections.every((r) => record(r) && typeof r.reason === 'string' && reasons.includes(r.reason)
    && Number.isInteger(r.count) && (r.count as number) > 0)) return fail();
  const selected = value.selected as Record<string, unknown> | null;
  const higher = selected ? candidates.filter((p) => (p.anharmonicity_mhz as number) > (selected.anharmonicity_mhz as number)) : [];
  const boundary = !selected ? null : (selected.margins as Record<string, number>).ratio_lower === 0 ? 'lower'
    : (selected.margins as Record<string, number>).ratio_upper === 0 ? 'upper' : null;
  const expectedKind = !selected ? 'infeasible' : higher.length ? 'higher_a_rejected' : boundary ? 'grid_boundary' : 'evaluated_maximum';
  const actualReasons = reasons.filter((reason) => higher.some((p) => (p.violations as string[]).includes(reason)));
  if (e.kind !== expectedKind || e.higher_a_count !== higher.length || e.selected_at_ratio_boundary !== boundary
    || e.higher_a_rejections.length !== actualReasons.length
    || !actualReasons.every((reason) => e.higher_a_rejections instanceof Array && e.higher_a_rejections.some((r) => r.reason === reason
      && r.count === higher.filter((p) => (p.violations as string[]).includes(reason)).length))) return fail();
  return value as unknown as SearchResponse;
}
