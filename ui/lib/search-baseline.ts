import type { DeviceParams, DeviceResult } from './types.ts';
import type { EvaluateHandle } from './useEvaluate.ts';
import type { AppliedDevice, FrozenBaseline, GuardedEvaluation, SearchCandidate, SearchResponse, SelectionProvenance } from './search-types.ts';
import { requirementsFrom } from './search-params.ts';

export function deviceParams(value: DeviceParams): DeviceParams {
  return { ej_ghz: value.ej_ghz, ec_ghz: value.ec_ghz, ng: value.ng, ncut: value.ncut };
}
export function sameDeviceParams(a: DeviceParams, b: DeviceParams): boolean {
  return a.ej_ghz === b.ej_ghz && a.ec_ghz === b.ec_ghz && a.ng === b.ng && a.ncut === b.ncut;
}

export function sourceForCandidate(candidate: SearchCandidate, run: SearchResponse): SelectionProvenance {
  return structuredClone({
    kind: candidate.candidate_id === run.selected?.candidate_id ? 'recommendation' : 'candidate',
    requirements: requirementsFrom(run.request), candidate,
    selection_rule: run.selection_rule, optimality_scope: run.optimality_scope,
    comparison_resolution_mhz: run.comparison_resolution_mhz,
  });
}
export function sourceForApplied(applied: AppliedDevice): SelectionProvenance | null {
  return applied.source && sameDeviceParams(applied.params, applied.source.candidate)
    ? structuredClone(applied.source) : null;
}

function validResult(result: DeviceResult): boolean {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return ['ej_ghz', 'ec_ghz', 'ng', 'ncut', 'ratio', 'f01_ghz', 'f12_ghz', 'alpha_mhz', 'anharmonicity_mhz', 'dispersion_upper_khz', 'dispersion_resolution_khz', 'elapsed_ms']
    .every((k) => finite(result[k as keyof DeviceResult]))
    && typeof result.model === 'string' && typeof result.model_version === 'string'
    && Array.isArray(result.levels_ghz) && result.levels_ghz.length >= 4 && result.levels_ghz.every(finite)
    && Array.isArray(result.raw_levels_ghz) && result.raw_levels_ghz.length >= 4 && result.raw_levels_ghz.every(finite)
    && Array.isArray(result.charge_response) && result.charge_response.length >= 2
    && result.charge_response.every((p) => p !== null && typeof p === 'object' && finite(p.ng) && finite(p.f01_ghz))
    && ((result.dispersion_status === 'resolved' && finite(result.dispersion_khz))
      || (result.dispersion_status === 'below_reporting_floor' && result.dispersion_khz === null));
}

/** Check identity during render as well as the evaluate hook's request sequence.
 * A parameter change precedes useEvaluate's effect, so its old ready flag alone
 * is insufficient. Never expose another device's levels as current.
 */
export function guardEvaluation(
  evaluation: EvaluateHandle, params: DeviceParams,
  allowPin: boolean, allowApply: boolean, expected?: SearchCandidate | null,
): GuardedEvaluation {
  const result = evaluation.result;
  const identityMatches = result !== null && sameDeviceParams(result, params);
  const metadataMatches = !expected || (result?.model === expected.model
    && result.model_version === expected.model_version
    && result.dispersion_resolution_khz === expected.dispersion_resolution_khz);
  const malformed = identityMatches && evaluation.status === 'ready' && (!validResult(result!) || !metadataMatches);
  const ready = evaluation.status === 'ready' && !evaluation.stale
    && evaluation.seq === evaluation.appliedSeq && identityMatches && !malformed;
  return {
    result: ready ? result : null,
    status: malformed ? 'error' : evaluation.status === 'ready' && !ready ? 'loading' : evaluation.status,
    stale: !ready && (evaluation.stale || evaluation.status === 'ready' || evaluation.status === 'loading'),
    error: malformed ? 'Evaluation metadata does not match this device and search.' : evaluation.error,
    canPin: ready && allowPin, canApply: ready && allowApply,
  };
}

export function createFrozenBaseline(id: string, result: DeviceResult, source: SelectionProvenance | null): FrozenBaseline {
  // Copy everything, including level/curve arrays and the original requirements.
  // Neither subsequent edits nor an Apply callback can rewrite the pin.
  return structuredClone({ id, params: deviceParams(result), result, source });
}
