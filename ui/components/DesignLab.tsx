'use client';

import { useEffect, useState } from 'react';
import MathText from '@/components/MathText';
import RichMathText from '@/components/RichMathText';
import TradeoffChart from '@/components/TradeoffChart';
import { buildDesignReportPdf, designReportFilename } from '@/lib/design-report';
import { num } from '@/lib/format';
import { BCQT_SOURCE } from '@/lib/material-records';
import type { ResonatorMaterialRecord } from '@/lib/material-records';
import type { TopicId } from '@/lib/explain-topics';
import type { MaterialAppearance } from '@/lib/material-colors';
import {
  DEFAULT_MATERIAL_PRIORITY,
  processBurden,
  rankMaterialStacks,
  recommendMaterialStack,
} from '@/lib/material-ranking';
import type { SubstratePreference } from '@/lib/material-ranking';
import type {
  DesignGoals,
  DeviceParams,
  SearchCandidate,
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

const PLAIN_PROCESS_NAMES: Record<string, string> = {
  'tin-sapphire-gao-2021': 'heated after it was added',
  'al-si-burnett-2018': 'cleaned and shaped with liquid chemicals',
  'al-si-untreated-earnest-2018': 'used without extra cleaning',
  'al-si-clean-anneal-earnest-2018': 'cleaned, then heated',
  'nb-si-nersisyan-2019': 'several preparation methods were compared',
  'nbtin-si-barends-2010': 'prepared with hydrogen',
  'ta-si-barends-2010': 'added in a vacuum',
  'nbn-tin-si-kim-2021': 'added in a vacuum',
  're-sapphire-wang-2009': 'added in a vacuum',
  'al-sapphire-wang-2009': 'added in a vacuum',
};

function plainStackLabel(stack: ResonatorMaterialRecord): string {
  const substrate = stack.substrate === 'Si' ? 'Si' : 'Al₂O₃ (sapphire)';
  return `${stack.material} + ${substrate} — ${PLAIN_PROCESS_NAMES[stack.id] ?? 'tested in a published study'}`;
}

function makingDifficulty(stack: ResonatorMaterialRecord): string {
  const burden = processBurden(stack);
  if (burden <= 1.5) return 'Fewer steps';
  if (burden <= 2.3) return 'A moderate number of steps';
  return 'More specialized steps';
}

interface DesignPreset {
  id: string;
  label: string;
  description: string;
  goals: DesignGoals;
  materialPriority: number;
}

interface GoalPreview {
  feasibleCount: number;
  evaluatedCount: number;
  suggestion: string;
}

const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'A practical starting point',
    goals: { target_ghz: 5, tolerance_ghz: 0.25, min_anharmonicity_mhz: 200, max_dispersion_khz: 10 },
    materialPriority: 65,
  },
  {
    id: 'stable',
    label: 'Charge-stable',
    description: 'Less affected by stray charge',
    goals: { target_ghz: 5, tolerance_ghz: 0.25, min_anharmonicity_mhz: 150, max_dispersion_khz: 1 },
    materialPriority: 100,
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'A higher operating frequency',
    goals: { target_ghz: 7, tolerance_ghz: 0.25, min_anharmonicity_mhz: 180, max_dispersion_khz: 20 },
    materialPriority: 100,
  },
  {
    id: 'easy-build',
    label: 'Easier build',
    description: 'Favors fewer material steps',
    goals: { target_ghz: 5, tolerance_ghz: 0.25, min_anharmonicity_mhz: 180, max_dispersion_khz: 25 },
    materialPriority: 0,
  },
];

function explainCandidate(
  candidate: SearchCandidate,
  recommended: SearchCandidate,
  candidates: SearchCandidate[],
): string {
  const passing = candidates.filter((item) => item.feasible);
  const separationRank = [...passing]
    .sort((a, b) => b.anharmonicity_mhz - a.anharmonicity_mhz)
    .findIndex((item) => item.ratio === candidate.ratio) + 1;
  const stabilityRank = [...passing]
    .sort((a, b) => a.dispersion_upper_khz - b.dispersion_upper_khz)
    .findIndex((item) => item.ratio === candidate.ratio) + 1;

  if (candidate.ratio === recommended.ratio) {
    return `It passes all three goals and has the strongest level separation among the ${passing.length} passing designs. Its charge-stability rank is #${stabilityRank}.`;
  }

  if (candidate.dispersion_upper_khz < recommended.dispersion_upper_khz) {
    return `It passes all three goals. Compared with the recommended design, it lowers charge sensitivity from ${num(recommended.dispersion_upper_khz, 3)} to ${num(candidate.dispersion_upper_khz, 3)} kHz, while level separation changes from ${num(recommended.anharmonicity_mhz, 1)} to ${num(candidate.anharmonicity_mhz, 1)} MHz. It ranks #${stabilityRank} for charge stability and #${separationRank} for level separation.`;
  }

  return `It passes all three goals and ranks #${separationRank} for level separation and #${stabilityRank} for charge stability among ${passing.length} passing designs.`;
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
  const [chosenDesign, setChosenDesign] = useState<SearchCandidate | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [stress, setStress] = useState<StressResult | null>(null);
  const [tunable, setTunable] = useState<TunableResult | null>(null);
  const [variation, setVariation] = useState(5);
  const [flux, setFlux] = useState(0.25);
  const [asymmetry, setAsymmetry] = useState(0.1);
  const [materialPriority, setMaterialPriority] = useState(DEFAULT_MATERIAL_PRIORITY);
  const [substratePreference, setSubstratePreference] = useState<SubstratePreference>('any');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalPreview, setGoalPreview] = useState<GoalPreview | null>(null);
  const recommendedStack = recommendMaterialStack(materialPriority, substratePreference);
  const rankedStacks = rankMaterialStacks(materialPriority, substratePreference);
  const selectedStack = rankedStacks.find((stack) => stack.id === selectedMaterialId) ?? recommendedStack;
  const selectedStackRank = rankedStacks.findIndex((stack) => stack.id === selectedStack.id) + 1;
  const lowestMeasuredLoss = Math.min(...rankedStacks.map((stack) => stack.lowPowerLossMax));
  const relativeMeasuredLoss = selectedStack.lowPowerLossMax / lowestMeasuredLoss;
  const designExplanation = search?.selected && chosenDesign
    ? explainCandidate(chosenDesign, search.selected, search.candidates)
    : null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_ghz: goals.target_ghz,
            max_dispersion_khz: goals.max_dispersion_khz,
            min_anharmonicity_mhz: goals.min_anharmonicity_mhz,
            points: 51,
            ncut: params.ncut,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const preview = await response.json() as SearchResult;
        const chargeFailures = preview.candidates.filter((candidate) => candidate.violations.includes('charge_budget_khz')).length;
        const separationFailures = preview.candidates.filter((candidate) => candidate.violations.includes('anharmonicity_floor_mhz')).length;
        const suggestion = preview.feasible_count > 0
          ? `${preview.feasible_count} of ${preview.evaluated_count} quick samples passed. A full search is worth trying.`
          : chargeFailures >= separationFailures
            ? 'These goals may be too strict. Try allowing more charge sensitivity.'
            : 'These goals may be too strict. Try lowering the required level separation.';
        setGoalPreview({
          feasibleCount: preview.feasible_count,
          evaluatedCount: preview.evaluated_count,
          suggestion,
        });
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [goals.max_dispersion_khz, goals.min_anharmonicity_mhz, goals.target_ghz, params.ncut]);

  const updateGoal = (key: keyof DesignGoals, value: number) => {
    onGoalsChange({ ...goals, [key]: value });
    setSearch(null);
    setChosenDesign(null);
    setActivePreset(null);
  };

  const applyPreset = (preset: DesignPreset) => {
    onGoalsChange(preset.goals);
    setMaterialPriority(preset.materialPriority);
    setSelectedMaterialId(null);
    setSearch(null);
    setChosenDesign(null);
    setActivePreset(preset.id);
  };

  const exportDesignReport = async () => {
    if (!chosenDesign || !designExplanation) return;
    setError(null);
    const generatedAt = new Date().toISOString();
    try {
      const pdf = await buildDesignReportPdf({
        generatedAt,
        goals,
        design: chosenDesign,
        material: {
          name: `${selectedStack.material} + ${selectedStack.substrate}`,
          lossRange: `${selectedStack.lowPowerLossMin.toExponential(1)}–${selectedStack.lowPowerLossMax.toExponential(1)}`,
          preparation: PLAIN_PROCESS_NAMES[selectedStack.id] ?? 'Tested in a published study',
          difficulty: makingDifficulty(selectedStack),
          rank: selectedStackRank,
          total: rankedStacks.length,
          sourceUrl: BCQT_SOURCE,
        },
        explanation: designExplanation,
      });
      const url = URL.createObjectURL(new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = designReportFilename(generatedAt);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? `Could not create PDF: ${reason.message}` : 'Could not create PDF.');
    }
  };

  const run = async (kind: 'search' | 'stress' | 'tunable') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'search') {
        const nextSearch = await post<SearchResult>('/api/search', {
          target_ghz: goals.target_ghz,
          max_dispersion_khz: goals.max_dispersion_khz,
          min_anharmonicity_mhz: goals.min_anharmonicity_mhz,
          points: 201,
          ncut: params.ncut,
        });
        setSearch(nextSearch);
        setChosenDesign(nextSearch.selected);
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
      <button type="button" className="insp-title myla-hit" onClick={() => onAsk?.('search')}>Find a complete design</button>
      <p className="insp-role">Choose a target speed. The app will recommend electrical settings and an evidence-backed material stack.</p>

      <div className="current-stack">
        <span>Currently using</span>
        <strong>{currentMaterials.topMaterial} on {currentMaterials.baseMaterial}</strong>
      </div>

      <div className="design-presets">
        <div className="design-presets-head">
          <strong>Quick starts</strong>
          <span>Pick one, then adjust anything</span>
        </div>
        <div className="design-preset-grid">
          {DESIGN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={activePreset === preset.id ? 'active' : ''}
              aria-pressed={activePreset === preset.id}
              onClick={() => applyPreset(preset)}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="design-goals" aria-labelledby="design-goals-title">
        <div className="design-goals-head">
          <div>
            <span className="goal-eyebrow">Design brief</span>
            <h3 id="design-goals-title">Your three goals</h3>
          </div>
          <span className="goal-count">3 targets</span>
        </div>

        <div className="goal-card goal-card-featured" data-tour="goal-freq">
          <div className="goal-card-head">
            <MathText className="goal-symbol" math="f_{01}" />
            <div>
              <label htmlFor="goal-frequency">Operating frequency</label>
              <p>Choose the qubit&apos;s target speed.</p>
            </div>
          </div>
          <div className="goal-value">
            <input id="goal-frequency" className="num" type="number" min="3" max="8" step="0.1" value={goals.target_ghz} onChange={(e) => updateGoal('target_ghz', Number(e.target.value))} />
            <MathText math="\\mathrm{GHz}" />
          </div>
          <input aria-label="Target operating frequency slider" type="range" min="3" max="8" step="0.1" value={goals.target_ghz} onChange={(e) => updateGoal('target_ghz', Number(e.target.value))} />
          <span className="goal-range"><small><MathText math="3\\,\\mathrm{GHz}" /></small><small><MathText math="8\\,\\mathrm{GHz}" /></small></span>
        </div>

        <div className="goal-card" data-tour="goal-alpha">
          <div className="goal-card-head">
            <MathText className="goal-symbol" math="|\\alpha|" />
            <div>
              <label htmlFor="goal-separation">Level separation</label>
              <p>Keep neighboring energy levels easy to tell apart.</p>
            </div>
          </div>
          <div className="goal-value"><output><MathText math={`${num(goals.min_anharmonicity_mhz, 0)}\\,\\mathrm{MHz}`} /></output><span>minimum</span></div>
          <input id="goal-separation" aria-label="Minimum level separation" type="range" min="0" max="1000" step="10" value={goals.min_anharmonicity_mhz} onChange={(e) => updateGoal('min_anharmonicity_mhz', Number(e.target.value))} />
          <span className="goal-range"><small>More flexible</small><small>More separation</small></span>
        </div>

        <div className="goal-card" data-tour="goal-disp">
          <div className="goal-card-head">
            <MathText className="goal-symbol" math="\\delta f_{01}" />
            <div>
              <label htmlFor="goal-charge">Charge sensitivity</label>
              <p>Limit how much stray charge can affect the design.</p>
            </div>
          </div>
          <div className="goal-value"><output><MathText math={`\\le ${num(goals.max_dispersion_khz, 2)}\\,\\mathrm{kHz}`} /></output><span>maximum</span></div>
          <input id="goal-charge" aria-label="Maximum charge sensitivity" type="range" min="0.01" max="100" step="0.01" value={goals.max_dispersion_khz} onChange={(e) => updateGoal('max_dispersion_khz', Number(e.target.value))} />
          <span className="goal-range"><small>More stable</small><small>More flexible</small></span>
        </div>
      </section>

      <details className="tech goal-rules" data-tour="goal-rules">
        <summary>Fine-tune frequency accuracy</summary>
        <div className="body goal-sliders">
          <label className="scenario-field" data-tour="goal-tol">
            <span>Allowed frequency error <strong><MathText math={`\\pm ${num(goals.tolerance_ghz, 2)}\\,\\mathrm{GHz}`} /></strong></span>
            <input aria-label="Allowed frequency error" type="range" min="0.01" max="1" step="0.01" value={goals.tolerance_ghz} onChange={(e) => updateGoal('tolerance_ghz', Number(e.target.value))} />
            <small>Smaller means the final frequency must be closer to your target.</small>
          </label>
        </div>
      </details>

      {goalPreview && (
        <div className={`goal-feasibility ${goalPreview.feasibleCount > 0 ? 'possible' : 'unlikely'}`}>
          <span aria-hidden>{goalPreview.feasibleCount > 0 ? '✓' : '!'}</span>
          <div>
            <strong>{goalPreview.feasibleCount > 0 ? 'Goals look reachable' : 'Goals may conflict'}</strong>
            <p>{goalPreview.suggestion}</p>
          </div>
        </div>
      )}

      <div className="material-goal">
        <div className="material-goal-title">Material requirements</div>
        <label className="scenario-field" data-tour="mat-priority">
          <span>
            Ranking priority
            <strong>
              {materialPriority === 100
                ? 'Best measured performance'
                : materialPriority === 0
                  ? 'Simplest recorded process'
                  : <><MathText math={`${materialPriority}\\,\\%`} /> performance / <MathText math={`${100 - materialPriority}\\,\\%`} /> process</>}
            </strong>
          </span>
          <input aria-label="Material ranking priority" type="range" min="0" max="100" step="5" value={materialPriority} onChange={(event) => {
            setMaterialPriority(Number(event.target.value));
            setSelectedMaterialId(null);
            setActivePreset(null);
          }} />
          <span className="range-ends"><small>Simpler process</small><small>Lower loss</small></span>
        </label>
        <label className="material-picker compact-picker" data-tour="mat-base">
          <span>Chip material</span>
          <select value={substratePreference} onChange={(event) => {
            setSubstratePreference(event.target.value as SubstratePreference);
            setSelectedMaterialId(null);
          }}>
            <option value="any">Any tested chip material</option>
            <option value="Si">Si only</option>
            <option value="Al₂O₃ (sapphire)">Al₂O₃ (sapphire) only</option>
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
              {search.selected && chosenDesign && <>
                <TradeoffChart candidates={search.candidates} selected={chosenDesign} onSelect={setChosenDesign} />
                {designExplanation && (
                  <div className="design-why">
                    <span>Why this design?</span>
                    <strong>{chosenDesign.ratio === search.selected.ratio ? 'Recommended balance' : 'Your selected alternative'}</strong>
                    <p><RichMathText>{designExplanation}</RichMathText></p>
                  </div>
                )}
                <div className="recommend-block">
                  <strong>Electrical settings</strong>
                  <dl className="kv"><dt><MathText math="E_J/h,\ E_C/h" /></dt><dd><MathText math={`${num(chosenDesign.ej_ghz, 3)}\\,\\mathrm{GHz},\ ${num(chosenDesign.ec_ghz, 3)}\\,\\mathrm{GHz}`} /></dd><dt>Operating frequency</dt><dd><MathText math={`${num(chosenDesign.f01_ghz, 3)}\\,\\mathrm{GHz}`} /></dd><dt>Level separation</dt><dd><MathText math={`${num(chosenDesign.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></dd><dt>Charge sensitivity</dt><dd><MathText math={`\\le ${num(chosenDesign.dispersion_upper_khz, 3)}\\,\\mathrm{kHz}`} /></dd></dl>
                </div>
                <div className="recommend-block material-choice">
                  <strong>Choose material stack</strong>
                  <p className="scenario-scope">
                    Each option pairs a coating with the material underneath it. The same pair can appear more than once when it was prepared differently.
                  </p>
                  <label className="material-picker compact-picker">
                    <span>Options, best match first</span>
                    <select
                      aria-label="Material stack"
                      value={selectedStack.id}
                      onChange={(event) => setSelectedMaterialId(event.target.value)}
                    >
                      {rankedStacks.map((stack, index) => (
                        <option key={stack.id} value={stack.id}>
                          {index + 1}. {index === 0 ? 'Recommended: ' : ''}{plainStackLabel(stack)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="stack-name">{selectedStack.material} on {selectedStack.substrate}</div>
                  <dl className="kv">
                    <dt>List rank</dt><dd>#{selectedStackRank} of {rankedStacks.length}</dd>
                    <dt>Energy lost</dt><dd><RichMathText>{`${selectedStack.lowPowerLossMin.toExponential(1)}–${selectedStack.lowPowerLossMax.toExponential(1)}`}</RichMathText> (a smaller number is better)</dd>
                    <dt>Vs. best option</dt><dd>Loses <MathText math={`${num(relativeMeasuredLoss, 1)}\\times`} /> as much energy</dd>
                    <dt>Preparation</dt><dd>{PLAIN_PROCESS_NAMES[selectedStack.id] ?? 'Tested in a published study'}</dd>
                    <dt>Difficulty</dt><dd>{makingDifficulty(selectedStack)}</dd>
                  </dl>
                  <p>
                    {selectedStack.id !== recommendedStack.id
                      ? `You chose option #${selectedStackRank}. Option #1 best matches your current settings.`
                      : materialPriority === 100
                      ? 'Why #1? It lost the least energy in these tests.'
                      : 'The list balances lower energy loss with fewer preparation steps.'}
                  </p>
                  <p className="scenario-scope">
                    These tests help compare options, but they cannot predict the best finished qubit every time.
                  </p>
                  <details className="tech">
                    <summary>Show the technical manufacturing terms</summary>
                    <div className="body">
                      <p><strong>Coating method:</strong> {selectedStack.deposition}</p>
                      <p><strong>Surface preparation:</strong> {selectedStack.treatment}</p>
                    </div>
                  </details>
                </div>
                <div className="design-result-actions">
                  <button type="button" className="btn primary" onClick={() => {
                    onApply(chosenDesign.ej_ghz, chosenDesign.ec_ghz);
                    onMaterialsChange(selectedStack.material, selectedStack.substrate);
                  }}>Use this design</button>
                  <button type="button" className="btn" onClick={exportDesignReport}>Export PDF</button>
                </div>
                <p className="combined-scope">The electrical settings pass the transmon model independently. Material ranking uses measured resonator loss plus a clearly labeled process-complexity heuristic; it is not a joint fabricated-chip prediction. <a href={BCQT_SOURCE} target="_blank" rel="noreferrer">View material data</a>.</p>
              </>}
            </div>
          )}

      <div className="section-divider" />
      <button type="button" className="insp-title small-title myla-hit" onClick={() => onAsk?.('model')}>Optional experiments</button>
      <p className="insp-role">Open one when you want to explore beyond the basic chip.</p>
      <details className="tech experiment-card" data-tour="stress">
        <summary onClick={() => onAsk?.('stress')}>How robust is this design?</summary>
        <div className="body">
          <p>Test nine cases where fabrication changes <MathText math="E_J" /> and <MathText math="E_C" /> slightly.</p>
          <label className="scenario-field" data-tour="stress-var"><span>Possible variation <strong><MathText math={`\\pm ${variation}\\,\\%`} /></strong></span><input type="range" min="0.1" max="20" step="0.1" value={variation} onChange={(e) => { setVariation(Number(e.target.value)); setStress(null); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('stress')} disabled={busy !== null}>{busy === 'stress' ? 'Testing…' : 'Test robustness'}</button>
          {stress && <div className="lab-result"><dl className="kv"><dt>Frequency could be</dt><dd><MathText math={`${num(stress.ranges.f01_ghz.min, 3)}\\text{–}${num(stress.ranges.f01_ghz.max, 3)}\\,\\mathrm{GHz}`} /></dd><dt>Level separation</dt><dd><MathText math={`${num(stress.ranges.anharmonicity_mhz.min, 1)}\\text{–}${num(stress.ranges.anharmonicity_mhz.max, 1)}\\,\\mathrm{MHz}`} /></dd><dt>Worst charge sensitivity</dt><dd><MathText math={`${num(stress.ranges.dispersion_upper_khz.max, 3)}\\,\\mathrm{kHz}`} /></dd></dl><p>This is a sensitivity test, not a manufacturing-yield prediction.</p></div>}
        </div>
      </details>

      <details className="tech experiment-card" data-tour="tunable">
        <summary onClick={() => onAsk?.('tunable')}>What if the chip is flux-tunable?</summary>
        <div className="body">
          <p>Add a second junction so magnetic flux can tune the operating frequency.</p>
          <label className="scenario-field" data-tour="flux"><span>Magnetic flux <strong><MathText math={`${num(flux, 2)}\\,\\Phi/\\Phi_0`} /></strong></span><input type="range" min="0" max="1" step="0.01" value={flux} onChange={(e) => { setFlux(Number(e.target.value)); setTunable(null); }} /></label>
          <label className="scenario-field" data-tour="asymmetry"><span>Difference between junctions <strong><MathText math={`${num(asymmetry * 100, 0)}\\,\\%`} /></strong></span><input type="range" min="0" max="1" step="0.01" value={asymmetry} onChange={(e) => { setAsymmetry(Number(e.target.value)); setTunable(null); }} /></label>
          <button type="button" className="btn lab-button" onClick={() => run('tunable')} disabled={busy !== null}>{busy === 'tunable' ? 'Calculating…' : 'Try flux-tunable chip'}</button>
          {tunable && <div className="lab-result"><dl className="kv"><dt>Operating frequency</dt><dd><MathText math={`${num(tunable.f01_ghz, 3)}\\,\\mathrm{GHz}`} /></dd><dt>Effective junction energy</dt><dd><MathText math={`E_{J,\\mathrm{eff}}/h=${num(tunable.effective_ej_ghz, 3)}\\,\\mathrm{GHz}`} /></dd><dt>Level separation</dt><dd><MathText math={`${num(tunable.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></dd></dl><p>This uses a separate tunable-transmon model; it does not change the main chip above.</p></div>}
        </div>
      </details>
      {error && <p className="scenario-error">{error}</p>}
    </div>
  );
}
