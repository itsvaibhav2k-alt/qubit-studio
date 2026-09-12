import { PART_BY_ID, type PartId } from './parts.ts';
import type { DeviceParams, DeviceResult } from './types.ts';
import type { ChipSnapshot, SnapshotBaseline, SnapshotOutputs } from './insight-types.ts';

const PART_IDS = new Set<PartId>(['junction', 'capacitor', 'gate', 'substrate', 'ground']);

function peakChargeShiftKhz(result: DeviceResult): number | null {
  const points = result.charge_response;
  if (!points.length) return null;
  const reference = points.reduce((a, b) => (b.ng < a.ng ? b : a)).f01_ghz;
  let peak = 0;
  for (const point of points) {
    const shift = Math.abs((point.f01_ghz - reference) * 1e6);
    if (shift > peak) peak = shift;
  }
  return peak;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function outputsFromResult(result: DeviceResult): SnapshotOutputs {
  return {
    f01_ghz: result.f01_ghz,
    f12_ghz: result.f12_ghz,
    alpha_mhz: result.alpha_mhz,
    ratio: result.ratio,
    dispersion_khz: result.dispersion_khz,
    dispersion_status: result.dispersion_status,
    dispersion_upper_khz: result.dispersion_upper_khz,
    levels_ghz: result.levels_ghz.slice(0, 4),
    charge_shift_peak_khz: peakChargeShiftKhz(result),
    model_version: result.model_version,
    critical_current_na: result.critical_current_na,
    total_capacitance_ff: result.total_capacitance_ff,
  };
}

function baselineFromResult(result: DeviceResult): SnapshotBaseline {
  return {
    f01_ghz: result.f01_ghz,
    alpha_mhz: result.alpha_mhz,
    ratio: result.ratio,
    dispersion_khz: result.dispersion_khz,
  };
}

/** Compact, JSON-safe picture of the chip. This is the contract the LLM will consume later. */
export function buildChipSnapshot(input: {
  params: DeviceParams;
  result: DeviceResult | null;
  baseline: DeviceResult | null;
  selected: PartId | null;
  stale: boolean;
  error: string | null;
}): ChipSnapshot {
  return {
    selected_part: input.selected,
    params: {
      ej_ghz: input.params.ej_ghz,
      ec_ghz: input.params.ec_ghz,
      ng: input.params.ng,
      ncut: input.params.ncut,
      ratio: input.params.ej_ghz / input.params.ec_ghz,
    },
    outputs: input.result ? outputsFromResult(input.result) : null,
    baseline: input.baseline ? baselineFromResult(input.baseline) : null,
    stale: input.stale,
    error: input.error,
  };
}

export function parseChipSnapshot(
  body: unknown,
): { ok: true; snapshot: ChipSnapshot } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Insight request must be a JSON object.' };
  }
  const source = body as Record<string, unknown>;
  const paramsRaw = source.params;
  if (paramsRaw === null || typeof paramsRaw !== 'object') {
    return { ok: false, error: 'Missing params object.' };
  }
  const paramsObj = paramsRaw as Record<string, unknown>;
  const keys = ['ej_ghz', 'ec_ghz', 'ng', 'ncut', 'ratio'] as const;
  for (const key of keys) {
    if (!finiteNumber(paramsObj[key])) {
      return { ok: false, error: `Parameter "${key}" must be a finite number.` };
    }
  }
  const params: ChipSnapshot['params'] = {
    ej_ghz: paramsObj.ej_ghz as number,
    ec_ghz: paramsObj.ec_ghz as number,
    ng: paramsObj.ng as number,
    ncut: paramsObj.ncut as number,
    ratio: paramsObj.ratio as number,
  };

  let selected: PartId | null = null;
  if (source.selected_part !== null && source.selected_part !== undefined) {
    if (typeof source.selected_part !== 'string' || !PART_IDS.has(source.selected_part as PartId)) {
      return { ok: false, error: 'selected_part is not a known part id.' };
    }
    selected = source.selected_part as PartId;
  }

  let outputs: SnapshotOutputs | null = null;
  if (source.outputs !== null && source.outputs !== undefined) {
    if (typeof source.outputs !== 'object') {
      return { ok: false, error: 'outputs must be an object or null.' };
    }
    const out = source.outputs as Record<string, unknown>;
    const required = ['f01_ghz', 'f12_ghz', 'alpha_mhz', 'ratio', 'dispersion_upper_khz'] as const;
    for (const key of required) {
      if (!finiteNumber(out[key])) {
        return { ok: false, error: `outputs.${key} must be a finite number.` };
      }
    }
    if (out.dispersion_status !== 'resolved' && out.dispersion_status !== 'below_reporting_floor') {
      return { ok: false, error: 'outputs.dispersion_status is invalid.' };
    }
    if (out.dispersion_khz !== null && !finiteNumber(out.dispersion_khz)) {
      return { ok: false, error: 'outputs.dispersion_khz must be a finite number or null.' };
    }
    outputs = {
      f01_ghz: out.f01_ghz as number,
      f12_ghz: out.f12_ghz as number,
      alpha_mhz: out.alpha_mhz as number,
      ratio: out.ratio as number,
      dispersion_khz: out.dispersion_khz === null ? null : (out.dispersion_khz as number),
      dispersion_status: out.dispersion_status,
      dispersion_upper_khz: out.dispersion_upper_khz as number,
      levels_ghz: Array.isArray(out.levels_ghz)
        ? out.levels_ghz.filter(finiteNumber).slice(0, 4)
        : [],
      charge_shift_peak_khz: finiteNumber(out.charge_shift_peak_khz) ? out.charge_shift_peak_khz : null,
      model_version: typeof out.model_version === 'string' ? out.model_version : 'unknown',
    };
  }

  let baseline: SnapshotBaseline | null = null;
  if (source.baseline !== null && source.baseline !== undefined) {
    if (typeof source.baseline !== 'object') {
      return { ok: false, error: 'baseline must be an object or null.' };
    }
    const base = source.baseline as Record<string, unknown>;
    if (!finiteNumber(base.f01_ghz) || !finiteNumber(base.alpha_mhz) || !finiteNumber(base.ratio)) {
      return { ok: false, error: 'baseline is missing numeric fields.' };
    }
    baseline = {
      f01_ghz: base.f01_ghz,
      alpha_mhz: base.alpha_mhz,
      ratio: base.ratio,
      dispersion_khz: base.dispersion_khz === null || finiteNumber(base.dispersion_khz) ? (base.dispersion_khz as number | null) : null,
    };
  }

  return {
    ok: true,
    snapshot: {
      selected_part: selected,
      params,
      outputs,
      baseline,
      stale: Boolean(source.stale),
      error: typeof source.error === 'string' ? source.error : null,
    },
  };
}

export function selectedPartName(id: PartId | null): string | null {
  return id ? PART_BY_ID[id].name : null;
}
