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

export interface SearchCandidate extends DeviceResult {
  feasible: boolean;
  margins: Record<string, number>;
  violations: string[];
}

export interface SearchResult {
  status: 'feasible' | 'infeasible';
  selected: SearchCandidate | null;
  candidates: SearchCandidate[];
  evaluated_count: number;
  feasible_count: number;
  selection_rule: string;
  optimality_scope: string;
}

export interface MetricRange {
  min: number;
  max: number;
  span: number;
}

export interface StressResult {
  status: 'ok';
  scope: string;
  scenarios: Array<DeviceResult & { ej_factor: number; ec_factor: number }>;
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
  scope: string;
  ejmax_ghz: number;
  ec_ghz: number;
  asymmetry: number;
  flux_response: TunablePoint[];
}

export interface MaterialScenarioResult {
  status: 'ok';
  scenario_name: string;
  scope: string;
  assumptions: string[];
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
