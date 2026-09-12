import { completedDevice } from './device-snapshot.ts';
import type { DesignGoals, DeviceParams, DeviceResult } from './types.ts';
import type { ExperimentEvidence } from './experiment-session.ts';
import { validExperimentGoals } from './experiment-session.ts';

interface ReportInput {
  params: DeviceParams;
  result: DeviceResult | null;
  status: string;
  stale: boolean;
  goals: DesignGoals;
  materials: { topMaterial: string; baseMaterial: string };
  baseline: DeviceResult | null;
  experiments: ExperimentEvidence[];
}

/** A report is one completed electrical snapshot; visual materials are separate context. */
export function buildExportReport(input: ReportInput, exportedAt = new Date().toISOString()) {
  if (!completedDevice(input.params, input.result, input.status, input.stale)) return null;
  if (!validExperimentGoals(input.goals)) return null;
  return {
    exported_at: exportedAt,
    application: 'Qubit Studio',
    schema_version: 1,
    parameters: { ej_ghz: input.result.ej_ghz, ec_ghz: input.result.ec_ghz, ng: input.result.ng, ncut: input.result.ncut },
    design_goals: { ...input.goals },
    goal_scope: 'Tolerance assesses the current device. Search locks frequency to the target at ng=0.',
    result: input.result,
    selected_materials: { top_material: input.materials.topMaterial, base_material: input.materials.baseMaterial, scope: 'Visual selection and literature context; not electrical solver inputs.' },
    pinned_baseline: input.baseline,
    experiments: input.experiments,
    disclaimer: 'Simplified isolated-transmon calculation; not a fabricated-device prediction. Experiment model scopes and producing inputs are recorded separately.',
  };
}
