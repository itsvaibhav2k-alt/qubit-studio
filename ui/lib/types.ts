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
  critical_current_na?: number;
  total_capacitance_ff?: number;
}

export interface DesignGoals {
  target_ghz: number;
  tolerance_ghz: number;
  min_anharmonicity_mhz: number;
  max_dispersion_khz: number;
}

/** The engine's metrics() summaries do not contain an evaluation curve or cutoff. */
export type DeviceMetrics = Pick<DeviceResult,
  'ej_ghz' | 'ec_ghz' | 'ng' | 'ratio' | 'raw_levels_ghz' | 'levels_ghz'
  | 'f01_ghz' | 'f12_ghz' | 'alpha_mhz' | 'anharmonicity_mhz'
  | 'dispersion_khz' | 'dispersion_status' | 'dispersion_upper_khz'
  | 'critical_current_na' | 'total_capacitance_ff'>;

export interface SearchCandidate extends DeviceMetrics {
  feasible: boolean;
  margins: Record<string, number>;
  violations: string[];
}

export interface SearchResult {
  model: string;
  model_version: string;
  request: Record<string, number>;
  status: 'feasible' | 'infeasible';
  selected: SearchCandidate | null;
  candidates: SearchCandidate[];
  evaluated_count: number;
  feasible_count: number;
  selection_rule: string;
  optimality_scope: string;
  dispersion_resolution_khz: number;
  elapsed_ms: number;
}

export interface MetricRange {
  min: number;
  max: number;
  span: number;
}

export interface StressResult {
  model: string;
  status: 'ok';
  scope: string;
  request: DeviceParams & { variation_percent: number };
  nominal: DeviceMetrics;
  scenarios: Array<DeviceMetrics & { ej_factor: number; ec_factor: number }>;
  elapsed_ms: number;
  ranges: {
    f01_ghz: MetricRange;
    anharmonicity_mhz: MetricRange;
    dispersion_upper_khz: MetricRange;
  };
}

export interface TunablePoint {
  flux: number;
  effective_ej_ghz: number;
  f01_ghz: number;
  f12_ghz: number;
  alpha_mhz: number;
  anharmonicity_mhz: number;
  levels_ghz: number[];
}

export interface TunableResult extends TunablePoint {
  model: string;
  model_version: string;
  scope: string;
  ejmax_ghz: number;
  ec_ghz: number;
  asymmetry: number;
  ng: number;
  ncut: number;
  elapsed_ms: number;
  flux_response: TunablePoint[];
}

export interface MaterialScenarioResult {
  status: 'ok';
  scenario_name: string;
  scope: string;
  assumptions: string[];
  request: DeviceParams & {
    scenario_name: string;
    junction_critical_current_factor: number;
    total_capacitance_factor: number;
  };
  baseline: DeviceResult;
  modified: DeviceResult;
  deltas: {
    ej_ghz: number;
    ec_ghz: number;
    f01_ghz: number;
    anharmonicity_mhz: number;
    dispersion_upper_khz: number;
  };
}
