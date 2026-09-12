import type { DeviceParams } from './types';

export type ParamKey = keyof DeviceParams;

export interface ParamSpec {
  key: ParamKey;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  digits: number;
  meaning: string;
  advanced?: boolean;
}

/** Bounds copied from engine.DeviceRequest Field() constraints. */
export const PARAMS: Record<ParamKey, ParamSpec> = {
  ej_ghz: {
    key: 'ej_ghz',
    label: 'Josephson energy',
    symbol: 'EJ/h',
    unit: 'GHz',
    min: 0.01,
    max: 50,
    step: 0.01,
    fallback: 15,
    digits: 2,
    meaning: 'Controls Josephson energy in the simplified model.',
  },
  ec_ghz: {
    key: 'ec_ghz',
    label: 'Charging energy',
    symbol: 'EC/h',
    unit: 'GHz',
    min: 0.01,
    max: 2,
    step: 0.005,
    fallback: 0.3,
    digits: 3,
    meaning: 'Controls charging energy in the simplified model.',
  },
  ng: {
    key: 'ng',
    label: 'Offset charge',
    symbol: 'ng',
    unit: '2e',
    min: 0,
    max: 1,
    step: 0.005,
    fallback: 0,
    digits: 3,
    meaning: 'Sets the static offset charge on the island in the simplified model.',
  },
  ncut: {
    key: 'ncut',
    label: 'Charge basis cutoff',
    symbol: 'ncut',
    unit: '',
    min: 20,
    max: 60,
    step: 1,
    fallback: 30,
    digits: 0,
    meaning: 'Numerical truncation of the charge basis. A solver setting, not a device property.',
    advanced: true,
  },
};

export const DEFAULT_PARAMS: DeviceParams = {
  ej_ghz: PARAMS.ej_ghz.fallback,
  ec_ghz: PARAMS.ec_ghz.fallback,
  ng: PARAMS.ng.fallback,
  ncut: PARAMS.ncut.fallback,
};

export function clampParam(key: ParamKey, value: number): number {
  const { min, max } = PARAMS[key];
  const bounded = Math.min(max, Math.max(min, value));
  return key === 'ncut' ? Math.round(bounded) : bounded;
}

export function sameParams(a: DeviceParams, b: DeviceParams): boolean {
  return (['ej_ghz', 'ec_ghz', 'ng', 'ncut'] as ParamKey[]).every((k) => a[k] === b[k]);
}
