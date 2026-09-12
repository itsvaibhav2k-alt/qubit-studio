'use client';

import { useState } from 'react';
import { num } from '@/lib/format';
import { BCQT_SOURCE } from '@/lib/material-records';
import type { TopicId } from '@/lib/explain-topics';
import type { MaterialAppearance } from '@/lib/material-colors';
import { processBurden, recommendMaterialStack } from '@/lib/material-ranking';
import type { SubstratePreference } from '@/lib/material-ranking';
import type {
  DesignGoals,
  DeviceParams,
  SearchResult,
  StressResult,
  TunableResult,
} from '@/lib/types';

interface DesignLabProps {
  params: DeviceParams;
  goals: DesignGoals;
  onGoalsChange: (goals: DesignGoals) => void;
  onApply: (ejGhz: number, ecGhz: number) => void;
  onMaterialsChange: (topMaterial: string, baseMaterial: string) => void;
  currentMaterials: MaterialAppearance;
  onAsk?: (id: TopicId) => void;
}

async function post<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? JSON.stringify(body.detail ?? body));
  return body as T;
}

export default function DesignLab({
  params,
  goals,
  onGoalsChange,
  onApply,
  onMaterialsChange,
  currentMaterials,
  onAsk,
}: DesignLabProps) {
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [stress, setStress] = useState<StressResult | null>(null);
  const [tunable, setTunable] = useState<TunableResult | null>(null);
  const [variation, setVariation] = useState(5);
  const [flux, setFlux] = useState(0.25);
  const [asymmetry, setAsymmetry] = useState(0.1);
  const [materialPriority, setMaterialPriority] = useState(65);
  const [substratePreference, setSubstratePreference] = useState<SubstratePreference>('any');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recommendedStack = recommendMaterialStack(materialPriority, substratePreference);

  const updateGoal = (key: keyof DesignGoals, value: number) => {
    onGoalsChange({ ...goals, [key]: value });
    setSearch(null);
  };

  const run = async (kind: 'search' | 'stress' | 'tunable') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'search') {
        setSearch(await post<SearchResult>('/api/search', {
          target_ghz: goals.target_ghz,
          max_dispersion_khz: goals.max_dispersion_khz,
          min_anharmonicity_mhz: goals.min_anharmonicity_mhz,
          points: 201,
          ncut: params.ncut,
        }));
      } else if (kind === 'stress') {
        setStress(await post<StressResult>('/api/stress', { ...params, variation_percent: variation }));
      } else {
        setTunable(await post<TunableResult>('/api/evaluate-tunable', {
          ejmax_ghz: params.ej_ghz,
          ec_ghz: params.ec_ghz,
          ng: params.ng,
          ncut: params.ncut,
          flux,
          asymmetry,
        }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="insp-section design-lab">
      <button type="button" className="insp-title myla-hit" onClick={() => onAsk?.('search')}>
        Find a complete design
      </button>
      <p className="insp-role">Choose a target speed. The app will recommend electrical settings and an evidence-backed material stack.</p>

      <div className="current-stack">
        <span>Currently using</span>
        <strong>{currentMaterials.topMaterial} on {currentMaterials.baseMaterial}</strong>
      </div>

      <div className="goal-primary" data-tour="goal-freq">
        <label className="myla-hit" onClick={() => onAsk?.('goals')}>Target operating frequency</label>
        <div><input className="num" type="number" min="3" max="8" step="0.1" value={goals.target_ghz} onChange={(e) => updateGoal('target_ghz', Number(e.target.value))} /><span>GHz</span></div>
        <input aria-label="Target operating frequency" type="range" min="3" max="8" step="0.1" value={goals.target_ghz} onChange={(e) => updateGoal('target_ghz', Number(e.target.value))} />
        <small>5 GHz is a useful starting point for this demo.</small>
      </div>

      <details className="tech goal-rules" data-tour="goal-rules">
        <summary>Change what counts as a good design</summary>
        <div className="body goal-sliders">
          <label className="scenario-field" data-tour="goal-tol">
            <span>Allowed frequency error <strong>±{num(goals.tolerance_ghz, 2)} GHz</strong></span>
            <input aria-label="Allowed frequency error" type="range" min="0.01" max="1" step="0.01" value={goals.tolerance_ghz} onChange={(e) => updateGoal('tolerance_ghz', Number(e.target.value))} />
            <small>Smaller means the final frequency must be closer to your target.</small>
          </label>
          <label className="scenario-field" data-tour="goal-alpha">
            <span>Minimum level separation <strong>{num(goals.min_anharmonicity_mhz, 0)} MHz</strong></span>
            <input aria-label="Minimum level separation" type="range" min="0" max="1000" step="10" value={goals.min_anharmonicity_mhz} onChange={(e) => updateGoal('min_anharmonicity_mhz', Number(e.target.value))} />
            <small>Higher is usually easier to control, but harder to balance with stability.</small>
          </label>
          <label className="scenario-field" data-tour="goal-disp">
            <span>Maximum charge sensitivity <strong>{num(goals.max_dispersion_khz, 2)} kHz</strong></span>
            <input aria-label="Maximum charge sensitivity" type="range" min="0.01" max="100" step="0.01" value={goals.max_dispersion_khz} onChange={(e) => updateGoal('max_dispersion_khz', Number(e.target.value))} />
            <small>Lower means the design must be less affected by stray electrical charge.</small>
          </label>
        </div>
      </details>

      <div className="material-goal">
        <button type="button" className="material-goal-title myla-hit" onClick={() => onAsk?.('materials')}>
          Material requirements
        </button>
        <label className="scenario-field" data-tour="mat-priority">
          <span>
            Ranking priority
            <strong>{materialPriority >= 60 ? 'Lower measured loss' : 'Simpler recorded process'}</strong>
          </span>
          <input aria-label="Material ranking priority" type="range" min="0" max="100" step="5" value={materialPriority} onChange={(event) => setMaterialPriority(Number(event.target.value))} />
          <span className="range-ends"><small>Simpler process</small><small>Lower loss</small></span>
        </label>
        <label className="material-picker compact-picker" data-tour="mat-base">
          <span>Required chip base</span>
          <select value={substratePreference} onChange={(event) => setSubstratePreference(event.target.value as SubstratePreference)}>
            <option value="any">Any measured substrate</option>
            <option value="Si">Silicon only</option>
            <option value="Al₂O₃ (sapphire)">Sapphire only</option>
          </select>
        </label>
      </div>

      <button type="button" className="btn primary lab-button full-button" data-tour="search-run" onClick={() => run('search')} disabled={busy !== null}>
        {busy === 'search' ? 'Searching 201 designs…' : 'Find variables + materials'}
      </button>
          {search && (
            <div className="lab-result">
              <span className={`pill ${search.selected ? 'ok' : 'no'}`}>{search.selected ? '✓ Found a design that passes' : 'No design passed these rules'}</span>
              <p>The app checked {search.evaluated_count} options; {search.feasible_count} passed every rule.</p>
              {search.selected && <>
                <div className="recommend-block">
                  <strong>Electrical settings</strong>
                  <dl className="kv"><dt>EJ / EC</dt><dd>{num(search.selected.ej_ghz, 3)} / {num(search.selected.ec_ghz, 3)} GHz</dd><dt>Operating frequency</dt><dd>{num(search.selected.f01_ghz, 3)} GHz</dd><dt>Level separation</dt><dd>{num(search.selected.anharmonicity_mhz, 1)} MHz</dd><dt>Charge sensitivity</dt><dd>≤ {num(search.selected.dispersion_upper_khz, 3)} kHz</dd></dl>
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
                  onApply(search.selected!.ej_ghz, search.selected!.ec_ghz);
                  onMaterialsChange(recommendedStack.material, recommendedStack.substrate);
                }}>Use variables + materials</button>
                <p className="combined-scope">The electrical settings pass the transmon model independently. Material ranking uses measured resonator loss plus a clearly labeled process-complexity heuristic; it is not a joint fabricated-chip prediction. <a href={BCQT_SOURCE} target="_blank" rel="noreferrer">View material data</a>.</p>
              </>}
            </div>
          )}

      <div className="section-divider" />
      <button type="button" className="insp-title small-title myla-hit" onClick={() => onAsk?.('model')}>
        Optional experiments
      </button>
      <p className="insp-role">Open one when you want to explore beyond the basic chip.</p>
      <details className="tech experiment-card" data-tour="stress">
        <summary onClick={() => onAsk?.('stress')}>How robust is this design?</summary>
        <div className="body">
          <p>Test nine cases where fabrication changes EJ and EC slightly.</p>
          <label className="scenario-field" data-tour="stress-var"><span>Possible variation <strong>±{variation}%</strong></span><input type="range" min="0.1" max="20" step="0.1" value={variation} onChange={(e) => { setVariation(Number(e.target.value)); setStress(null); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('stress')} disabled={busy !== null}>{busy === 'stress' ? 'Testing…' : 'Test robustness'}</button>
          {stress && <div className="lab-result"><dl className="kv"><dt>Frequency could be</dt><dd>{num(stress.ranges.f01_ghz.min, 3)}–{num(stress.ranges.f01_ghz.max, 3)} GHz</dd><dt>Level separation</dt><dd>{num(stress.ranges.anharmonicity_mhz.min, 1)}–{num(stress.ranges.anharmonicity_mhz.max, 1)} MHz</dd><dt>Worst charge sensitivity</dt><dd>{num(stress.ranges.dispersion_upper_khz.max, 3)} kHz</dd></dl><p>This is a sensitivity test, not a manufacturing-yield prediction.</p></div>}
        </div>
      </details>

      <details className="tech experiment-card" data-tour="tunable">
        <summary onClick={() => onAsk?.('tunable')}>What if the chip is flux-tunable?</summary>
        <div className="body">
          <p>Add a second junction so magnetic flux can tune the operating frequency.</p>
          <label className="scenario-field" data-tour="flux"><span>Magnetic flux <strong>{num(flux, 2)} Φ/Φ₀</strong></span><input type="range" min="0" max="1" step="0.01" value={flux} onChange={(e) => { setFlux(Number(e.target.value)); setTunable(null); }} /></label>
          <label className="scenario-field" data-tour="asymmetry"><span>Difference between junctions <strong>{num(asymmetry * 100, 0)}%</strong></span><input type="range" min="0" max="1" step="0.01" value={asymmetry} onChange={(e) => { setAsymmetry(Number(e.target.value)); setTunable(null); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('tunable')} disabled={busy !== null}>{busy === 'tunable' ? 'Calculating…' : 'Try flux-tunable chip'}</button>
          {tunable && <div className="lab-result"><dl className="kv"><dt>Operating frequency</dt><dd>{num(tunable.f01_ghz, 3)} GHz</dd><dt>Effective junction energy</dt><dd>{num(tunable.effective_ej_ghz, 3)} GHz</dd><dt>Level separation</dt><dd>{num(tunable.anharmonicity_mhz, 1)} MHz</dd></dl><p>This uses a separate tunable-transmon model; it does not change the main chip above.</p></div>}
        </div>
      </details>
      {error && <p className="scenario-error">{error}</p>}
    </div>
  );
}
