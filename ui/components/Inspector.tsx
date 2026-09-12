'use client';

import ParamField from './ParamField';
import { MODELED_PARTS, PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import { PARAMS } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { num } from '@/lib/format';
import type { DeviceParams, DeviceResult } from '@/lib/types';

interface InspectorProps {
  selected: PartId | null;
  params: DeviceParams;
  result: DeviceResult | null;
  onSelect: (id: PartId) => void;
  onChange: (key: ParamKey, value: number) => void;
}

export default function Inspector({ selected, params, result, onSelect, onChange }: InspectorProps) {
  const part = selected ? PART_BY_ID[selected] : null;

  return (
    <>
      <div className="panel-head">Inspector</div>

      {!part && (
        <div className="insp-section">
          <div className="insp-title">No part selected</div>
          <p className="insp-role">
            Pick a part in the tree, the 3D view or the schematic to edit what it contributes to the model.
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
                  {part.param === 'ej_ghz' && (
                    <p style={{ margin: '6px 0 0' }}>
                      EJ and EC are independent inputs here. The transition frequency is an output of the
                      solver, not a target you set.
                    </p>
                  )}
                  {part.param === 'ng' && (
                    <p style={{ margin: '6px 0 0' }}>
                      Sweeping ng from 0 to 1 traces the charge-dispersion curve in the results dock.
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
            <ParamField paramKey="ncut" value={params.ncut} onChange={onChange} />
            <p style={{ margin: '8px 0 0' }}>{PARAMS.ncut.meaning}</p>
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
