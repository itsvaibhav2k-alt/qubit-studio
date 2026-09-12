'use client';

import { num } from '@/lib/format';
import { BCQT_SOURCE } from '@/lib/material-records';
import type { MaterialAppearance } from '@/lib/material-colors';
import { processBurden, recommendMaterialStack } from '@/lib/material-ranking';
import type { SubstratePreference } from '@/lib/material-ranking';
import { numericExperimentInput, type ExperimentSession } from '@/lib/experiment-session';
import type {
  DesignGoals,
  DeviceParams,
} from '@/lib/types';

interface DesignLabProps {
  params: DeviceParams;
  goals: DesignGoals;
  onGoalsChange: (goals: DesignGoals) => void;
  onApply: (params: DeviceParams) => void;
  session: ExperimentSession;
  onMaterialsChange: (topMaterial: string, baseMaterial: string) => void;
  currentMaterials: MaterialAppearance;
}

export default function DesignLab({
  session,
  goals,
  onGoalsChange,
  onApply,
  onMaterialsChange,
  currentMaterials,
}: DesignLabProps) {
  const { variation, flux, asymmetry, materialPriority, substratePreference } = session.controls;
  const search = session.search.result, stress = session.stress.result, tunable = session.tunable.result;
  const busy = (['search', 'stress', 'tunable', 'material'] as const).find((kind) => session[kind].status === 'pending') ?? null;
  const producingControls = session.search.snapshot?.controls;
  const recommendedStack = recommendMaterialStack(
    producingControls?.materialPriority ?? materialPriority,
    producingControls?.substratePreference ?? substratePreference,
  );
  const updateGoal = (key: keyof DesignGoals, value: number) => onGoalsChange({ ...goals, [key]: value });
  const run = session.run;
  const error = session.search.error ?? session.stress.error ?? session.tunable.error;

  return (
    <div className="insp-section design-lab">
      <div className="insp-title">Find a complete design</div>
      <p className="insp-role">Choose a target speed. The app will recommend electrical settings and an evidence-backed material stack.</p>

      <div className="current-stack">
        <span>Currently using</span>
        <strong>{currentMaterials.topMaterial} on {currentMaterials.baseMaterial}</strong>
      </div>

      <div className="goal-primary">
        <label htmlFor="design-target-frequency">Target operating frequency</label>
        <div><input id="design-target-frequency" aria-label="Target operating frequency value" aria-invalid={!Number.isFinite(goals.target_ghz) || goals.target_ghz < 3 || goals.target_ghz > 8} aria-describedby="design-target-help design-search-validation" className="num" type="number" min="3" max="8" step="0.1" value={Number.isFinite(goals.target_ghz) ? goals.target_ghz : ''} onChange={(e) => updateGoal('target_ghz', numericExperimentInput(e.target.value))} /><span>GHz</span></div>
        <input aria-label="Target operating frequency" type="range" min="3" max="8" step="0.1" value={Number.isFinite(goals.target_ghz) ? goals.target_ghz : ''} onChange={(e) => updateGoal('target_ghz', numericExperimentInput(e.target.value))} />
        <small id="design-target-help">Choose 3–8 GHz. Search uses this exact target at ng = 0.</small>
      </div>

      <details className="tech goal-rules">
        <summary>Change what counts as a good design</summary>
        <div className="body goal-sliders">
          <label className="scenario-field">
            <span>Allowed frequency error <strong>±{num(goals.tolerance_ghz, 2)} GHz</strong></span>
            <input aria-label="Allowed frequency error" type="range" min="0.01" max="1" step="0.01" value={goals.tolerance_ghz} onChange={(e) => updateGoal('tolerance_ghz', Number(e.target.value))} />
            <small>Applies to the current design verdict. Search locks exactly to the target frequency.</small>
          </label>
          <label className="scenario-field">
            <span>Minimum level separation <strong>{num(goals.min_anharmonicity_mhz, 0)} MHz</strong></span>
            <input aria-label="Minimum level separation" type="range" min="0" max="1000" step="10" value={goals.min_anharmonicity_mhz} onChange={(e) => updateGoal('min_anharmonicity_mhz', Number(e.target.value))} />
            <small>Higher is usually easier to control, but harder to balance with stability.</small>
          </label>
          <label className="scenario-field">
            <span>Maximum charge sensitivity <strong>{num(goals.max_dispersion_khz, 2)} kHz</strong></span>
            <input aria-label="Maximum charge sensitivity" type="range" min="0.01" max="100" step="0.01" value={goals.max_dispersion_khz} onChange={(e) => updateGoal('max_dispersion_khz', Number(e.target.value))} />
            <small>Lower means the design must be less affected by stray electrical charge.</small>
          </label>
        </div>
      </details>

      <div className="material-goal">
        <div className="material-goal-title">Material requirements</div>
        <label className="scenario-field">
          <span>
            Ranking priority
            <strong>{materialPriority >= 60 ? 'Lower measured loss' : 'Simpler recorded process'}</strong>
          </span>
          <input aria-label="Material ranking priority" type="range" min="0" max="100" step="5" value={materialPriority} onChange={(event) => session.setControls({ materialPriority: Number(event.target.value) })} />
          <span className="range-ends"><small>Simpler process</small><small>Lower loss</small></span>
        </label>
        <label className="material-picker compact-picker">
          <span>Required chip base</span>
          <select value={substratePreference} onChange={(event) => session.setControls({ substratePreference: event.target.value as SubstratePreference })}>
            <option value="any">Any measured substrate</option>
            <option value="Si">Silicon only</option>
            <option value="Al₂O₃ (sapphire)">Sapphire only</option>
          </select>
        </label>
      </div>

      <button type="button" className="btn primary lab-button full-button" aria-label="Find variables + materials" aria-busy={busy === 'search'} onClick={() => run('search')} disabled={busy !== null || !!session.validationError('search')}>
        <span role="status">{busy === 'search' ? 'Searching 201 designs…' : 'Find variables + materials'}</span>
      </button>
      {session.validationError('search') && <p id="design-search-validation" className="scenario-error" role="status">{session.validationError('search')}</p>}
          {search && (
            <div className="lab-result" aria-live="polite">
              <span className={`pill ${!session.search.current ? '' : search.selected ? 'ok' : 'no'}`}>{!session.search.current ? 'Outdated result — rerun search' : search.selected ? '✓ Found a design that passes' : 'No design passed these rules'}</span>
              <p>The app checked {search.evaluated_count} options; {search.feasible_count} passed every rule.</p>
              {search.selected && <>
                <div className="recommend-block">
                  <strong>Electrical settings</strong>
                  <dl className="kv"><dt>EJ / EC</dt><dd>{num(search.selected.ej_ghz, 3)} / {num(search.selected.ec_ghz, 3)} GHz</dd><dt>Offset charge / cutoff</dt><dd>ng = 0 / ncut = {session.search.snapshot?.params.ncut}</dd><dt>Operating frequency</dt><dd>{num(search.selected.f01_ghz, 3)} GHz</dd><dt>Level separation</dt><dd>{num(search.selected.anharmonicity_mhz, 1)} MHz</dd><dt>Charge sensitivity</dt><dd>≤ {num(search.selected.dispersion_upper_khz, 3)} kHz</dd></dl>
                </div>
                <div className="recommend-block material-choice">
                  <strong>Suggested material stack</strong>
                  <div className="stack-name">{recommendedStack.material} on {recommendedStack.substrate}</div>
                  <dl className="kv">
                    <dt>Measured loss</dt><dd>{recommendedStack.lowPowerLossMin.toExponential(1)}–{recommendedStack.lowPowerLossMax.toExponential(1)}</dd>
                    <dt>Deposition</dt><dd>{recommendedStack.deposition}</dd>
                    <dt>Treatment</dt><dd>{recommendedStack.treatment}</dd>
                    <dt>Process burden</dt><dd>{num(processBurden(recommendedStack), 1)} heuristic points</dd>
                  </dl>
                  <p>Ranked from valid measured stacks using your performance-versus-process preference.</p>
                </div>
                <button type="button" className="btn primary full-button" onClick={() => {
                  const applied = session.getApply('search');
                  const stack = session.getSearchMaterials();
                  if (!applied || !stack) return;
                  onApply(applied);
                  onMaterialsChange(stack.topMaterial, stack.baseMaterial);
                }} disabled={!session.getApply('search')}>Use variables + materials</button>
                <p className="combined-scope">Apply uses the selected EJ, EC, ng = 0, and the producing cutoff shown above. The electrical settings pass the transmon model independently. Material ranking uses measured resonator loss plus a clearly labeled process-complexity heuristic; it is not a joint fabricated-chip prediction. <a href={BCQT_SOURCE} target="_blank" rel="noreferrer">View material data</a>.</p>
              </>}
            </div>
          )}

      <div className="section-divider" />
      <div className="insp-title small-title">Optional experiments</div>
      <p className="insp-role">Open one when you want to explore beyond the basic chip.</p>
      <details className="tech experiment-card">
        <summary>How robust is this design?</summary>
        <div className="body">
          <p>Test nine hypothetical electrical cases that vary EJ and EC independently.</p>
          <label className="scenario-field"><span>Possible variation <strong>±{variation}%</strong></span><input type="range" min="0.1" max="20" step="0.1" value={variation} onChange={(e) => { session.setControls({ variation: Number(e.target.value) }); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('stress')} disabled={busy !== null || !!session.validationError('stress')}>{busy === 'stress' ? 'Testing…' : 'Test robustness'}</button>
          {session.validationError('stress') && <p className="scenario-error" role="status">{session.validationError('stress')}</p>}
          {stress && <div className="lab-result" aria-live="polite">{!session.stress.current && <p className="scenario-error" role="status">Outdated result — rerun this experiment.</p>}<dl className="kv"><dt>Frequency could be</dt><dd>{num(stress.ranges.f01_ghz.min, 3)}–{num(stress.ranges.f01_ghz.max, 3)} GHz</dd><dt>Level separation</dt><dd>{num(stress.ranges.anharmonicity_mhz.min, 1)}–{num(stress.ranges.anharmonicity_mhz.max, 1)} MHz</dd><dt>Worst charge sensitivity</dt><dd>{num(stress.ranges.dispersion_upper_khz.max, 3)} kHz</dd></dl><p>This is a sensitivity test, not a manufacturing-yield prediction.</p></div>}
        </div>
      </details>

      <details className="tech experiment-card">
        <summary>What if the chip is flux-tunable?</summary>
        <div className="body">
          <p>Add a second junction so magnetic flux can tune the operating frequency.</p>
          <label className="scenario-field"><span>Magnetic flux <strong>{num(flux, 2)} Φ/Φ₀</strong></span><input type="range" min="0" max="1" step="0.01" value={flux} onChange={(e) => { session.setControls({ flux: Number(e.target.value) }); }} /></label>
          <label className="scenario-field"><span>Difference between junctions <strong>{num(asymmetry * 100, 0)}%</strong></span><input type="range" min="0" max="1" step="0.01" value={asymmetry} onChange={(e) => { session.setControls({ asymmetry: Number(e.target.value) }); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('tunable')} disabled={busy !== null || !!session.validationError('tunable')}>{busy === 'tunable' ? 'Calculating…' : 'Try flux-tunable chip'}</button>
          {session.validationError('tunable') && <p className="scenario-error" role="status">{session.validationError('tunable')}</p>}
          {tunable && <div className="lab-result" aria-live="polite">{!session.tunable.current && <p className="scenario-error" role="status">Outdated result — rerun this experiment.</p>}<dl className="kv"><dt>Operating frequency</dt><dd>{num(tunable.f01_ghz, 3)} GHz</dd><dt>Effective junction energy</dt><dd>{num(tunable.effective_ej_ghz, 3)} GHz</dd><dt>Level separation</dt><dd>{num(tunable.anharmonicity_mhz, 1)} MHz</dd></dl><p>This uses a separate tunable-transmon model; it does not change the main chip above.</p></div>}
        </div>
      </details>
      {error && <p className="scenario-error" role="status">{error}</p>}
    </div>
  );
}
