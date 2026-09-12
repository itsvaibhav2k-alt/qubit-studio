'use client';

import dynamic from 'next/dynamic';
import ParamField from './ParamField';
import { LOCK_NOTE, NG_DESIGN_NOTE } from '@/lib/design-copy';
import { num } from '@/lib/format';
import { PARAMS } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { MODELED_PARTS, PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import type { DeviceParams, DeviceResult } from '@/lib/types';

const PartDetail = dynamic(() => import('./PartDetail'), { ssr: false });

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
  /** Element the selection callout line ends at. */
  badgeRef: React.RefObject<HTMLElement | null>;
  atDefaults: boolean;
  onSelect: (id: PartId) => void;
  onChange: (key: ParamKey, value: number) => void;
  /** Clears the component selection only; Design requirements stay. */
  onClose: () => void;
  /** Explore only: returns every working-device parameter to the model defaults. */
  onResetAll: () => void;
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 9a5.5 5.5 0 1 0 1.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 3.5v3.2h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  badgeRef,
  atDefaults,
  onSelect,
  onChange,
  onClose,
  onResetAll,
}: InspectorProps) {
  const part = selected ? PART_BY_ID[selected] : null;
  const inDesign = mode === 'design';

  const renderParam = (key: ParamKey) => {
    if (!inDesign) {
      return <ParamField paramKey={key} value={params[key]} onChange={onChange} size="large" />;
    }
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

  const paramAtDefault = part?.param ? params[part.param] === PARAMS[part.param].fallback : true;

  const disclaimer = (
    <p className="insp-model">
      Isolated transmon{result ? ` (${result.model_version})` : ''} · simplified model, not a prediction of a
      fabricated device. Geometry and materials are illustrative, not inputs to the calculation.
    </p>
  );

  if (!part) {
    return (
      <div className="insp-empty">
        <h2>Select a component</h2>
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
        {disclaimer}
      </div>
    );
  }

  return (
    <>
      <header className="insp-head">
        <span className="card-num" ref={badgeRef as React.RefObject<HTMLSpanElement | null>}>{part.number}</span>
        <h2>{part.name}</h2>
        {inDesign && locked && part.param && part.param !== 'ng' && <span className="lock">locked</span>}
        <button type="button" className="insp-close" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>

      <div className="insp-body">
        {part.param ? renderParam(part.param) : <p className="insp-role">{part.role}</p>}

        {!part.modeled && (
          <p className="illus">
            Drawn for context. This part has no properties in the current model — its size, thickness and
            appearance do not change any calculated value.
          </p>
        )}

        <div className="insp-detail">
          <div className="insp-detail-view">
            <PartDetail id={part.id} />
          </div>
          <div className="insp-caption">
            <b>{part.name}</b> detail · illustrative
          </div>
        </div>

        {part.param && (
          <details className="tech">
            <summary>Technical detail</summary>
            <div className="body">
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
              {disclaimer}
              {inDesign && <p style={{ margin: '6px 0 0' }}>{PARAMS[part.param].meaning}</p>}
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
        )}

        {!part.param && disclaimer}
      </div>

        {!inDesign && (
          <div className="insp-foot">
            <button type="button" className="quiet" onClick={onResetAll} disabled={atDefaults}>
              Reset all parameters
            </button>
            {part.param && (
              <button
                type="button"
                className="link"
                onClick={() => onChange(part.param as ParamKey, PARAMS[part.param as ParamKey].fallback)}
                disabled={paramAtDefault}
              >
                <ResetIcon />
                Reset parameter
              </button>
            )}
          </div>
        )}

    </>
  );
}
