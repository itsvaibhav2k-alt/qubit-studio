/** Mirrors simulation/engine.py contract v1. Nothing here is invented client-side. */

export interface DeviceParams {
  ej_ghz: number;
  ec_ghz: number;
  ng: number;
  ncut: number;
}

export interface ChargePoint {
  ng: number;
  f01_ghz: number;
}

export type DispersionStatus = 'resolved' | 'below_reporting_floor';

export interface DeviceResult extends DeviceParams {
  ratio: number;
  raw_levels_ghz: number[];
  levels_ghz: number[];
  f01_ghz: number;
  f12_ghz: number;
  alpha_mhz: number;
  anharmonicity_mhz: number;
  /** null means "below the reporting floor" — never treat as zero. */
  dispersion_khz: number | null;
  dispersion_status: DispersionStatus;
  dispersion_upper_khz: number;
  dispersion_resolution_khz: number;
  model: string;
  model_version: string;
  charge_response: ChargePoint[];
  elapsed_ms: number;
}
