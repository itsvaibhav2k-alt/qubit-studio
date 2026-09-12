import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExperimentSessionStore, DEFAULT_EXPERIMENT_CONTROLS, experimentSnapshot,
  numericExperimentInput, parseExperimentResult, validateExperiment, validExperimentGoals,
} from './experiment-session.ts';
import type { ExperimentContext } from './experiment-session.ts';

const context = (): ExperimentContext => ({
  params: { ej_ghz: 15, ec_ghz: 0.3, ng: 0.3, ncut: 40 },
  goals: { target_ghz: 5, tolerance_ghz: 0.25, min_anharmonicity_mhz: 200, max_dispersion_khz: 10 },
  materials: { topMaterial: 'Al', baseMaterial: 'Si', topColor: '#aaaaaa', baseColor: '#333333' },
});
// Synthetic transport fixtures test lifecycle/shape only; these are not numerical evidence.
const metric = (ej = 15, ec = 0.3, ng = 0, f = 5) => ({
  ej_ghz: ej, ec_ghz: ec, ng, ratio: ej/ec, raw_levels_ghz: [-10, -5, -0.3, 4.1],
  levels_ghz: [0, f, 2*f-0.3, 3*f-0.9], f01_ghz: f, f12_ghz: f-0.3,
  alpha_mhz: -300, anharmonicity_mhz: 300, dispersion_khz: 1,
  dispersion_status: 'resolved', dispersion_upper_khz: 1.001,
});
const full = (p = context().params) => ({ ...metric(p.ej_ghz, p.ec_ghz, p.ng), ...p,
  model: 'isolated-transmon', model_version: 'v1', dispersion_resolution_khz: 0.001,
  elapsed_ms: 1, charge_response: [{ ng: 0, f01_ghz: 5 }, { ng: 0.5, f01_ghz: 5.000001 }] });
function search(payload: Record<string, unknown>) {
  const selected = { ...metric(15, 0.3, 0, payload.target_ghz as number), feasible: true,
    margins: { charge_budget_khz: 8.999, anharmonicity_floor_mhz: 100, ej_lower_ghz: 10, ej_upper_ghz: 20, ec_lower_ghz: 0.15, ec_upper_ghz: 0.15 }, violations: [] };
  return { model: 'isolated-transmon', model_version: 'v1', status: 'feasible', request: payload,
    selected, candidates: Array.from({ length: payload.points as number }, () => selected),
    evaluated_count: payload.points, feasible_count: payload.points, selection_rule: 'maximum A',
    optimality_scope: 'evaluated grid only', dispersion_resolution_khz: 0.001, elapsed_ms: 1 };
}
function material(payload: Record<string, unknown>) {
  const p = { ej_ghz: payload.ej_ghz as number, ec_ghz: payload.ec_ghz as number,
    ng: payload.ng as number, ncut: payload.ncut as number };
  return { status: 'ok', request: payload, scenario_name: payload.scenario_name, scope: 'user factors', assumptions: [],
    baseline: full(p), modified: full({ ...p, ej_ghz: p.ej_ghz*(payload.junction_critical_current_factor as number),
      ec_ghz: p.ec_ghz/(payload.total_capacitance_factor as number) }),
    deltas: { ej_ghz: -1.5, ec_ghz: -0.03, f01_ghz: -0.5, anharmonicity_mhz: -30, dispersion_upper_khz: 0.2 } };
}
function harness() {
  const pending: { payload: Record<string, unknown>; signal: AbortSignal; resolve: (value: Response) => void; reject: (value: unknown) => void }[] = [];
  const fetcher: typeof fetch = async (_url, init) => new Promise<Response>((resolve, reject) => {
    pending.push({ payload: JSON.parse(init!.body as string), signal: init!.signal as AbortSignal, resolve, reject });
  });
  return { store: new ExperimentSessionStore(context(), fetcher), pending,
    succeed: (i: number, value: unknown = search(pending[i].payload)) => pending[i].resolve(Response.json(value)) };
}

test('search Apply preserves selected ng=0 and the producing cutoff; snapshot includes requirements and materials', async () => {
  const h = harness(); const run = h.store.run('search'); h.succeed(0); await run;
  assert.deepEqual(h.store.getApply('search'), { ej_ghz: 15, ec_ghz: 0.3, ng: 0, ncut: 40 });
  const evidence = h.store.view().evidence[0];
  assert.equal(evidence.inputs.params_ng, 0.3); assert.equal(evidence.summary.selected_ng, 0);
  assert.equal(evidence.inputs.goals_tolerance_ghz, 0.25); assert.equal(evidence.inputs.materials_topMaterial, 'Al');
  assert.equal(evidence.current, true); assert.equal(evidence.status, 'ready');
});

test('synchronous freshness rejects a changed render before context effect commits', async () => {
  const h = harness(); const run = h.store.run('search'); h.succeed(0); await run;
  const next = context(); next.params.ng = 0.4;
  const view = h.store.view(next);
  assert.equal(view.search.current, false); assert.equal(view.getApply('search'), null);
  assert.equal(view.getSearchMaterials(), null); assert.equal(view.evidence[0].current, false);
  await view.run('search'); assert.equal(h.pending.length, 1);
});

test('superseded success and failure cannot replace the current request', async () => {
  const h = harness(); const a = h.store.run('search'), b = h.store.run('search');
  assert.equal(h.pending[0].signal.aborted, true);
  h.succeed(1); await b; h.pending[0].reject(new Error('old failure')); await a;
  assert.equal(h.store.record('search').current, true); assert.equal(h.store.record('search').error, null);
  const c = h.store.run('search'), d = h.store.run('search');
  h.succeed(3); await d; h.succeed(2); await c;
  assert.equal(h.store.record('search').current, true);
});

test('parameter, goal, material name and color edits abort pending work and retain old provenance', async () => {
  for (const change of [
    (c: ExperimentContext) => { c.params.ncut = 41; },
    (c: ExperimentContext) => { c.goals.tolerance_ghz = 0.3; },
    (c: ExperimentContext) => { c.materials.topMaterial = 'Ta'; },
    (c: ExperimentContext) => { c.materials.topColor = '#bbbbbb'; },
  ]) {
    const h = harness(); const first = h.store.run('search'); h.succeed(0); await first;
    const pending = h.store.run('search'); const next = context(); change(next); h.store.updateContext(next);
    assert.equal(h.pending[1].signal.aborted, true); h.succeed(1); await pending;
    assert.equal(h.store.getApply('search'), null); assert.equal(h.store.view().evidence[0].inputs.materials_topMaterial, 'Al');
    h.store.updateContext(context()); assert.equal(h.store.record('search').current, false, 'edit-and-revert requires rerun');
  }
});

test('completed result remains explicitly outdated on pending work and current failure', async () => {
  const h = harness(); const a = h.store.run('search'); h.succeed(0); await a;
  const b = h.store.run('search'); assert.equal(h.store.view().evidence[0].status, 'pending');
  assert.equal(h.store.getApply('search'), null); h.pending[1].resolve(new Response('', { status: 503 })); await b;
  assert.equal(h.store.record('search').status, 'error'); assert.ok(h.store.record('search').result);
  assert.equal(h.store.view().evidence[0].current, false); assert.equal(h.store.getApply('search'), null);
});

test('tab views preserve session controls/results; unrelated controls do not invalidate search', async () => {
  const h = harness(); h.store.setControls({ materialPriority: 50 });
  const a = h.store.run('search'); h.succeed(0); await a;
  h.store.setControls({ variation: 10 });
  assert.equal(h.store.view().controls.materialPriority, 50); assert.equal(h.store.view().search.current, true);
  h.store.setControls({ substratePreference: 'Si' }); assert.equal(h.store.view().search.current, false);
});

test('dispose cancels requests and StrictMode reactivation permits new work only', async () => {
  const h = harness(); const a = h.store.run('search'); h.store.dispose();
  assert.equal(h.pending[0].signal.aborted, true); h.store.activate();
  const b = h.store.run('search'); h.succeed(1); await b; h.succeed(0); await a;
  assert.equal(h.store.record('search').current, true);
});

test('blank, nonfinite and out-of-bounds goals/controls prevent requests', async () => {
  assert.ok(Number.isNaN(numericExperimentInput('  ')));
  for (const target of [NaN, Infinity, -Infinity, 0, 8.001]) {
    const h = harness(); const c = context(); c.goals.target_ghz = target;
    assert.equal(validExperimentGoals(c.goals), false); h.store.updateContext(c); await h.store.run('search');
    assert.equal(h.pending.length, 0); assert.equal(h.store.record('search').status, 'error');
  }
  for (const [kind, patch] of [['stress', { variation: NaN }], ['tunable', { flux: 1.01 }], ['material', { junctionFactor: 0.49 }]] as const) {
    assert.ok(validateExperiment(kind, context(), { ...DEFAULT_EXPERIMENT_CONTROLS, ...patch }));
  }
  const c = context(); c.params.ej_ghz = 50;
  assert.ok(validateExperiment('stress', c, DEFAULT_EXPERIMENT_CONTROLS));
  assert.ok(validateExperiment('material', c, { ...DEFAULT_EXPERIMENT_CONTROLS, junctionFactor: 1.1 }));
});

test('material Apply preserves exact producing ng/ncut and transformed coordinates', async () => {
  const h = harness(); const a = h.store.run('material'); h.succeed(0, material(h.pending[0].payload)); await a;
  assert.deepEqual(h.store.getApply('material'), { ej_ghz: 13.5, ec_ghz: 0.3/1.1, ng: 0.3, ncut: 40 });
  h.store.setControls({ capacitanceFactor: 1.2 }); assert.equal(h.store.getApply('material'), null);
  assert.equal(h.store.view().evidence[0].inputs.capacitanceFactor, 1.1);
});

test('mismatched echo, selected coordinates and malformed metrics never become actionable', () => {
  const snapshot = experimentSnapshot('search', context(), DEFAULT_EXPERIMENT_CONTROLS);
  const invalidEcho = search({ ...snapshot.payload, ncut: 30 });
  assert.throws(() => parseExperimentResult('search', invalidEcho, snapshot));
  const invalidNg = search(snapshot.payload); invalidNg.selected.ng = 0.3;
  assert.throws(() => parseExperimentResult('search', invalidNg, snapshot));
  const invalidMetric = search(snapshot.payload); invalidMetric.selected.f01_ghz = NaN;
  assert.throws(() => parseExperimentResult('search', invalidMetric, snapshot));
});

test('tunable curve rejects out-of-range flux, effective EJ and negative frequencies', () => {
  const snapshot = experimentSnapshot('tunable', context(), DEFAULT_EXPERIMENT_CONTROLS);
  const point = { flux: 0.25, effective_ej_ghz: 10, f01_ghz: 4, f12_ghz: 3.7,
    alpha_mhz: -300, anharmonicity_mhz: 300, levels_ghz: [0, 4, 7.7, 11.1] };
  const response = { ...point, ...snapshot.payload, model: 'symmetric-asymmetric-squid-transmon',
    model_version: 'v1', scope: 'SQUID model', flux_response: Array.from({ length: 51 }, (_, i) => ({ ...point, flux: i/50 })) };
  assert.doesNotThrow(() => parseExperimentResult('tunable', response, snapshot));
  for (const [field, value] of [['flux', 7], ['effective_ej_ghz', -1], ['effective_ej_ghz', 16], ['f01_ghz', -1], ['f12_ghz', -1]] as const) {
    const malformed = structuredClone(response); malformed.flux_response[0][field] = value;
    assert.throws(() => parseExperimentResult('tunable', malformed, snapshot));
  }
  const positiveAlpha = structuredClone(response); positiveAlpha.alpha_mhz = 300; positiveAlpha.anharmonicity_mhz = -300;
  assert.doesNotThrow(() => parseExperimentResult('tunable', positiveAlpha, snapshot), 'general model may have positive alpha');
});

test('stress response must echo nominal inputs, cover nine distinct corners, and report matching ranges', () => {
  const snapshot = experimentSnapshot('stress', context(), DEFAULT_EXPERIMENT_CONTROLS);
  const scenarios = [0.95, 1, 1.05].flatMap((j) => [0.95, 1, 1.05].map((c) => ({
    ...metric(15*j, 0.3*c, 0.3), ej_factor: j, ec_factor: c,
  })));
  const response = { status: 'ok', model: 'isolated-transmon', scope: 'deterministic grid', request: snapshot.payload,
    nominal: metric(15, 0.3, 0.3), scenarios, ranges: {
      f01_ghz: { min: 5, max: 5, span: 0 }, anharmonicity_mhz: { min: 300, max: 300, span: 0 },
      dispersion_upper_khz: { min: 1.001, max: 1.001, span: 0 },
    } };
  assert.doesNotThrow(() => parseExperimentResult('stress', response, snapshot));
  const badRange = structuredClone(response); badRange.ranges.f01_ghz.span = -1;
  assert.throws(() => parseExperimentResult('stress', badRange, snapshot));
  const wrongRange = structuredClone(response); wrongRange.ranges.f01_ghz.max = 6;
  assert.throws(() => parseExperimentResult('stress', wrongRange, snapshot));
  const duplicate = structuredClone(response); duplicate.scenarios[0] = duplicate.scenarios[1];
  assert.throws(() => parseExperimentResult('stress', duplicate, snapshot));
  const wrongNominal = structuredClone(response); wrongNominal.nominal.ng = 0;
  assert.throws(() => parseExperimentResult('stress', wrongNominal, snapshot));
});
