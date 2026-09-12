'use client';

import { useState } from 'react';
import MathText from './MathText';
import GeometryEditor from './GeometryEditor';
import ParamField from './ParamField';
import MaterialSensitivity from './MaterialSensitivity';
import DesignLab from './DesignLab';
import { MODELED_PARTS, PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import { PARAMS } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { num } from '@/lib/format';
import type { DesignGoals, DeviceParams, DeviceResult } from '@/lib/types';
import type { MaterialAppearance } from '@/lib/material-colors';
import { TOPICS, type TopicId } from '@/lib/explain-topics';

interface InspectorProps {
  selected: PartId | null;
  params: DeviceParams;
  result: DeviceResult | null;
  onSelect: (id: PartId) => void;
  onChange: (key: ParamKey, value: number) => void;
  onApplyMaterialScenario: (ejGhz: number, ecGhz: number) => void;
  goals: DesignGoals;
  onGoalsChange: (goals: DesignGoals) => void;
  onMaterialsChange: (topMaterial: string, baseMaterial: string) => void;
  materials: MaterialAppearance;
  selectedTopics: Set<TopicId>;
  onSelectTopic: (id: TopicId) => void;
  onClearTopics: () => void;
  onAskLlm: () => void;
}

export default function Inspector({
  selected,
  params,
  result,
  onSelect,
  onChange,
  onApplyMaterialScenario,
  goals,
  onGoalsChange,
  onMaterialsChange,
  materials,
  selectedTopics,
  onSelectTopic,
  onClearTopics,
  onAskLlm,
}: InspectorProps) {
  const part = selected ? PART_BY_ID[selected] : null;
  const [tab, setTab] = useState<'edit' | 'experiment' | 'materials' | 'ask'>('edit');

  return (
    <>
      <div className="panel-head">Controls</div>
      <div className="inspector-tabs" role="tablist" aria-label="Control sections">
        {([
          ['edit', 'Edit chip'],
          ['experiment', 'Try a goal'],
          ['materials', 'Materials'],
          ['ask', `Ask AI${selectedTopics.size > 0 ? ` (${selectedTopics.size})` : ''}`],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'edit' && !part && (
        <div className="insp-section">
          <div className="insp-title">What do you want to change?</div>
          <p className="insp-role">
            Choose one chip property. The simulation updates automatically.
          </p>
          <div className="row-actions">
            {MODELED_PARTS.map((p) => (
              <button key={p.id} type="button" className="btn" onClick={() => onSelect(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'edit' && part && (
        <div className="insp-section">
          <div className="insp-title">
            <span className="swatch" style={{ background: part.color, width: 10, height: 10, borderRadius: 2, border: '1px solid rgba(0,0,0,.35)' }} />
            {part.name}
          </div>
          <p className="insp-role">{part.role}</p>

          {part.param && (
            <>
              <ParamField paramKey={part.param} value={params[part.param]} onChange={onChange} />
              <details className="tech">
                <summary>Technical detail</summary>
                <div className="body">
                  <p style={{ margin: 0 }}>{PARAMS[part.param].meaning}</p>
                  <dl>
                    <dt><MathText math={PARAMS[part.param].symbol} /></dt>
                    <dd>
                      <MathText math={`${num(params[part.param], PARAMS[part.param].digits)}${PARAMS[part.param].unit ? `\\,${PARAMS[part.param].unit === '2e' ? '2e' : `\\mathrm{${PARAMS[part.param].unit}}`}` : ''}`} />
                    </dd>
                    <dt>range</dt>
                    <dd>
                      {PARAMS[part.param].min} … {PARAMS[part.param].max}
                    </dd>
                    {part.param !== 'ng' && result && (
                      <>
                        <dt><MathText math="E_J/E_C" /></dt>
                        <dd><MathText math={num(result.ratio, 1)} /></dd>
                      </>
                    )}
                  </dl>
                  {part.param === 'ej_ghz' && (
                    <p style={{ margin: '6px 0 0' }}>
                      <MathText math="E_J" /> and <MathText math="E_C" /> are independent inputs here. The transition frequency is an output of the
                      solver, not a target you set.
                    </p>
                  )}
                  {part.param === 'ng' && (
                    <p style={{ margin: '6px 0 0' }}>
                      Sweeping <MathText math="n_g" /> from <MathText math="0" /> to <MathText math="1" /> traces the charge-dispersion curve in the results dock.
                    </p>
                  )}
                </div>
              </details>
            </>
          )}

          {!part.modeled && (
            <p className="illus">
              Drawn for context. This part has no properties in the current model — its size, thickness and
              appearance do not change any calculated value.
            </p>
          )}
        </div>
      )}

      {tab === 'experiment' && <DesignLab
          params={params}
          goals={goals}
          onGoalsChange={onGoalsChange}
          onApply={onApplyMaterialScenario}
          onMaterialsChange={onMaterialsChange}
          currentMaterials={materials}
        />}

      {tab === 'materials' && <MaterialSensitivity
          params={params}
          result={result}
          onApply={onApplyMaterialScenario}
          onMaterialsChange={onMaterialsChange}
          topMaterial={materials.topMaterial}
          baseMaterial={materials.baseMaterial}
        />}

      {tab === 'ask' && (
        <div className="insp-section ask-ai-panel">
          <div className="insp-title">Ask AI</div>
          <p className="insp-role">
            Click result metrics (or a 3D part), then ask Gemini to explain the live numbers.
          </p>

          {selectedTopics.size === 0 ? (
            <p className="ask-ai-empty">Nothing selected yet.</p>
          ) : (
            <>
              <div className="ask-ai-topics">
                {Array.from(selectedTopics).map((t) => {
                  const spec = TOPICS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      className="topic-badge"
                      title="Click to deselect"
                      onClick={() => onSelectTopic(t)}
                    >
                      <span className="topic-label">{spec?.label ?? t}</span>
                      <span className="topic-sym">{spec?.symbol ?? ''}</span>
                      <span className="topic-remove" aria-hidden>×</span>
                    </button>
                  );
                })}
              </div>
              <div className="ask-ai-actions">
                <button type="button" className="btn primary" onClick={onAskLlm}>
                  Ask Gemini
                </button>
                <button type="button" className="btn" onClick={onClearTopics}>
                  Clear all
                </button>
              </div>
            </>
          )}


        </div>
      )}

      {tab === 'edit' && <div className="insp-section quiet-section">
          <GeometryEditor key={`${params.ej_ghz}-${params.ec_ghz}`} params={params} onApply={onApplyMaterialScenario} />
          <details className="tech">
            <summary>Advanced solver setting</summary>
            <div className="body">
              <ParamField paramKey="ncut" value={params.ncut} onChange={onChange} />
              <p style={{ margin: '8px 0 0' }}>{PARAMS.ncut.meaning}</p>
            </div>
          </details>
          <p className="model-note">
            Educational transmon model{result ? ` · ${result.model_version}` : ''}. It shows trends, not the
            guaranteed behavior of a manufactured chip.
          </p>
        </div>}
    </>
  );
}
