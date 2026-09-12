import type { PartId } from './parts.ts';
import type { DispersionStatus } from './types.ts';

export type InsightTone = 'ok' | 'watch' | 'alert' | 'info';
export type InsightSource = 'local' | 'llm';
export type RegimeId = 'transmon' | 'transitional' | 'charge';

export interface InsightCard {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
  relatedTerms: string[];
}

export interface InsightBundle {
  source: InsightSource;
  headline: string;
  /** Compact HUD line for the 3D view. Symbols stay visible. */
  readout: string;
  cards: InsightCard[];
}

export interface SnapshotOutputs {
  f01_ghz: number;
  f12_ghz: number;
  alpha_mhz: number;
  ratio: number;
  dispersion_khz: number | null;
  dispersion_status: DispersionStatus;
  dispersion_upper_khz: number;
  levels_ghz: number[];
  /** Peak |Δf₀₁| across the returned charge sweep, in kHz. */
  charge_shift_peak_khz: number | null;
  model_version: string;
  critical_current_na?: number;
  total_capacitance_ff?: number;
}

export interface SnapshotBaseline {
  f01_ghz: number;
  alpha_mhz: number;
  ratio: number;
  dispersion_khz: number | null;
}

export interface ChipSnapshot {
  selected_part: PartId | null;
  params: {
    ej_ghz: number;
    ec_ghz: number;
    ng: number;
    ncut: number;
    ratio: number;
  };
  outputs: SnapshotOutputs | null;
  baseline: SnapshotBaseline | null;
  stale: boolean;
  error: string | null;
}

export interface InsightApiResponse extends InsightBundle {
  llm_configured: boolean;
  llm_error: string | null;
}
