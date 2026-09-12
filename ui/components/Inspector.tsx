'use client';

import ParamField from './ParamField';
import { LOCK_NOTE, NG_DESIGN_NOTE } from '@/lib/design-copy';
import { num } from '@/lib/format';
import { PARAMS } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { MODELED_PARTS, PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import type { DeviceParams, DeviceResult } from '@/lib/types';

/** Position of the inspected candidate along the locked EJ/EC path, in ratio order. */
export interface DesignPath {
  index: number;
  count: number;
  onStep: (index: number) => void;
}

interface InspectorProps {
  selected: PartId | null;
  params: DeviceParams;
  result: DeviceResult | null;
  mode: 'explore' | 'design';
  /** Design mode with a searched candidate on display: EJ and EC are derived, not editable. */
  locked: boolean;
  designPath: DesignPath | null;
  onSelect: (id: PartId) => void;
  onChange: (key: ParamKey, value: number) => void;
}

function Readout({ paramKey, value, note }: { paramKey: ParamKey; value: number; note: string }) {
  const spec = PARAMS[paramKey];
  return (
    <div className="field">
      <div className="field-head">
        <span style={{ fontWeight: 600, fontSize: 12 }}>{spec.label}</span>
        <span className="sym">{spec.symbol}</span>
      </div>
      <div className="field-row">
        <span className="num readout" aria-label={`${spec.label} value`}>
          {num(value, spec.digits)}
        </span>
        <span className="unit">{spec.unit}</span>
      </div>
      <p className="field-note">{note}</p>
    </div>
  );
}

export default function Inspector({
  selected,
  params,
  result,
  mode,
  locked,
  designPath,
  onSelect,
  onChange,
}: InspectorProps) {
  const part = selected ? PART_BY_ID[selected] : null;
  const inDesign = mode === 'design';

  const renderParam = (key: ParamKey) => {
    if (!inDesign) return <ParamField paramKey={key} value={params[key]} onChange={onChange} />;
    if (key === 'ng') return <Readout paramKey={key} value={params.ng} note={NG_DESIGN_NOTE} />;
    if (locked) {
      return (
        <>
          <Readout paramKey={key} value={params[key]} note={LOCK_NOTE} />
          {designPath && (
            <div className="field">
              <div className="field-head">
                <label htmlFor="design-path">Design path</label>
                <span className="sym">EJ/EC {result ? num(result.ratio, 1) : '—'}</span>
                <span className="sym" style={{ marginLeft: 'auto' }}>
                  {designPath.index + 1}/{designPath.count}
                </span>
              </div>
              <input
                id="design-path"
                type="range"
                min={0}
                max={designPath.count - 1}
                step={1}
                value={designPath.index}
                aria-label="Walk the evaluated candidates along the locked path"
                onChange={(event) => designPath.onStep(Number(event.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <p className="field-note">
                Moves along the evaluated candidates in ratio order. Both energies change together; f01 stays at
                the target.
              </p>
            </div>
          )}
        </>
      );
    }
    return (
      <Readout
        paramKey={key}
        value={params[key]}
        note="Working device value. Find designs to compare candidates at a fixed target frequency, or switch to Explore to edit it directly."
      />
    );
  };

  return (
    <>
      <div className="panel-head">Inspector</div>

      {!part && (
        <div className="insp-section">
          <div className="insp-title">No part selected</div>
          <p className="insp-role">
            Pick a part in the tree, the 3D view or the schematic to {inDesign ? 'see' : 'edit'} what it contributes to the model.
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

      {part && (
        <div className="insp-section">
          <div className="insp-title">
            <span className="swatch" style={{ background: part.color, width: 10, height: 10, borderRadius: 2, border: '1px solid rgba(0,0,0,.35)' }} />
            {part.name}
            {inDesign && locked && part.param && part.param !== 'ng' && <span className="lock">locked</span>}
          </div>
          <p className="insp-role">{part.role}</p>

          {part.param && (
            <>
              {renderParam(part.param)}
              <details className="tech">
                <summary>Technical detail</summary>
                <div className="body">
                  <p style={{ margin: 0 }}>{PARAMS[part.param].meaning}</p>
                  <dl>
                    <dt>{PARAMS[part.param].symbol}</dt>
                    <dd>
                      {num(params[part.param], PARAMS[part.param].digits)}{' '}
                      {PARAMS[part.param].unit || '(dimensionless)'}
                    </dd>
                    <dt>range</dt>
                    <dd>
                      {PARAMS[part.param].min} … {PARAMS[part.param].max}
                    </dd>
                    {part.param !== 'ng' && result && (
                      <>
                        <dt>EJ/EC</dt>
                        <dd>{num(result.ratio, 1)}</dd>
                      </>
                    )}
                  </dl>
                  {part.param === 'ej_ghz' && !inDesign && (
                    <p style={{ margin: '6px 0 0' }}>
                      EJ and EC are independent inputs here. The transition frequency is an output of the
                      solver, not a target you set.
                    </p>
                  )}
                  {part.param === 'ej_ghz' && inDesign && (
                    <p style={{ margin: '6px 0 0' }}>
                      On the locked path EC = f* / g01(EJ/EC) and EJ = (EJ/EC) · EC, so the pair is fixed by the
                      ratio and the target frequency.
                    </p>
                  )}
                  {part.param === 'ng' && (
                    <p style={{ margin: '6px 0 0' }}>
                      Sweeping ng from 0 to 1 traces the charge-response curve in the results dock.
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

      <div className="insp-section">
        <details className="tech">
          <summary>Solver settings</summary>
          <div className="body">
            {inDesign ? (
              <p style={{ margin: 0 }}>
                Design searches use the charge basis cutoff under Requirements → Design settings. The working
                device’s own cutoff is unchanged until you apply a design.
              </p>
            ) : (
              <>
                <ParamField paramKey="ncut" value={params.ncut} onChange={onChange} />
                <p style={{ margin: '8px 0 0' }}>{PARAMS.ncut.meaning}</p>
              </>
            )}
          </div>
        </details>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '10px 0 0' }}>
          Model: isolated transmon{result ? ` (${result.model_version})` : ''}. Simplified teaching model —
          not a prediction of a fabricated device. Geometry and materials shown are illustrative and are not
          inputs to the calculation.
        </p>
      </div>
    </>
  );
}
