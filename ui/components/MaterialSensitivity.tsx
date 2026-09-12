'use client';

import { num, signed } from '@/lib/format';
import { BCQT_SOURCE, MATERIAL_CATALOG, MATERIAL_RECORDS } from '@/lib/material-records';
import { materialColor } from '@/lib/material-colors';
import type { ExperimentSession } from '@/lib/experiment-session';
import { validDeviceResult } from '@/lib/device-snapshot';
import { sameParams } from '@/lib/params';
import type { DeviceParams, DeviceResult } from '@/lib/types';

interface MaterialSensitivityProps {
  params: DeviceParams;
  result: DeviceResult | null;
  onApply: (params: DeviceParams) => void;
  session: ExperimentSession;
  onMaterialsChange: (topMaterial: string, baseMaterial: string) => void;
  topMaterial: string;
  baseMaterial: string;
}

export default function MaterialSensitivity({ session, params, result, onApply, onMaterialsChange, topMaterial, baseMaterial }: MaterialSensitivityProps) {
  const { junctionFactor, capacitanceFactor } = session.controls;
  const comparison = session.material.result, error = session.material.error;
  const loading = session.material.status === 'pending';
  const compare = () => session.run('material');

  const matchingRecord = MATERIAL_RECORDS
    .filter((record) => record.kind === 'resonator-loss' && record.material === topMaterial && record.substrate === baseMaterial)
    .sort((a, b) => a.kind === 'resonator-loss' && b.kind === 'resonator-loss' ? a.lowPowerLossMax - b.lowPowerLossMax : 0)[0];
  const isMajoranaPair =
    (topMaterial === 'Pb' && ['InAs', 'InAsSb'].includes(baseMaterial)) ||
    (baseMaterial === 'Pb' && ['InAs', 'InAsSb'].includes(topMaterial));
  const majoranaRecord = MATERIAL_RECORDS.find((record) => record.id === 'microsoft-majorana-2-2026');

  const decayScaleUs = (loss: number) =>
    result && validDeviceResult(result) && sameParams(params, result) ? 1e6 / (2 * Math.PI * result.f01_ghz * 1e9 * loss) : null;
  const decayLow = matchingRecord?.kind === 'resonator-loss'
    ? decayScaleUs(matchingRecord.lowPowerLossMax)
    : null;
  const decayHigh = matchingRecord?.kind === 'resonator-loss'
    ? decayScaleUs(matchingRecord.lowPowerLossMin)
    : null;

  const changeMaterial = (layer: 'top' | 'base', material: string) => {
    if (!MATERIAL_CATALOG.includes(material as (typeof MATERIAL_CATALOG)[number])) return;
    onMaterialsChange(
      layer === 'top' ? material : topMaterial,
      layer === 'base' ? material : baseMaterial,
    );
  };

  return (
    <div className="insp-section material-sensitivity">
      <div className="insp-title">Film / substrate sensitivity</div>
      <p className="insp-role">
        Combine any two real materials from the verified catalog—even the same material twice.
      </p>

      <div className="sandbox-pickers">
        <label className="material-picker">
          <span>Top material</span>
          <select value={topMaterial} onChange={(event) => changeMaterial('top', event.target.value)}>
            {MATERIAL_CATALOG.map((material) => <option key={material} value={material}>{material}</option>)}
          </select>
        </label>
        <label className="material-picker">
          <span>Base material</span>
          <select value={baseMaterial} onChange={(event) => changeMaterial('base', event.target.value)}>
            {MATERIAL_CATALOG.map((material) => <option key={material} value={material}>{material}</option>)}
          </select>
        </label>
      </div>

      <div className="row-actions">
        <span className="pill material-pill">
          <i style={{ background: materialColor(topMaterial) }} /> {topMaterial}
          <i style={{ background: materialColor(baseMaterial) }} /> {baseMaterial}
        </span>
      </div>

      <p className="visual-note">Changing Top material assigns the electrodes, gate and ground; changing Base material assigns only the substrate. Use Component material to customize parts individually. Their optical appearance does not change electrical inputs.</p>

      <div className="material-record">
        {matchingRecord?.kind === 'resonator-loss' ? (
          <>
            <dl className="kv">
              <dt>Evidence</dt><dd>Matching published resonator record</dd>
              <dt>Category</dt><dd>{matchingRecord.category}</dd>
              <dt>Process</dt><dd>{matchingRecord.deposition}; {matchingRecord.treatment}</dd>
              <dt>Geometry</dt><dd>{matchingRecord.geometry}</dd>
              <dt>Measured δLP</dt>
              <dd>
                {matchingRecord.lowPowerLossMin === matchingRecord.lowPowerLossMax
                  ? matchingRecord.lowPowerLossMin.toExponential(1)
                  : `${matchingRecord.lowPowerLossMin.toExponential(1)}–${matchingRecord.lowPowerLossMax.toExponential(1)}`}
              </dd>
              {decayLow !== null && decayHigh !== null && (
                <><dt>Decay scale</dt><dd>~{num(decayLow, 1)}{decayLow !== decayHigh ? `–${num(decayHigh, 1)}` : ''} µs*</dd></>
              )}
            </dl>
            <p className="scenario-scope">
              *Equivalent resonator scale, not predicted qubit T1.{' '}
              <a href={BCQT_SOURCE} target="_blank" rel="noreferrer">Source data</a>.
            </p>
          </>
        ) : isMajoranaPair && majoranaRecord?.kind === 'device-stack' ? (
          <>
            <dl className="kv">
              <dt>Evidence</dt><dd>Part of a reported topological-device stack</dd>
              <dt>Full stack</dt><dd>{majoranaRecord.layers.join(' · ')}</dd>
            </dl>
            <p className="scenario-scope">
              No EJ/EC or comparable resonator-loss record is provided.{' '}
              <a href={majoranaRecord.sourceUrl} target="_blank" rel="noreferrer">Source data</a>.
            </p>
          </>
        ) : (
          <p className="scenario-scope">Both selections are real materials, but the imported dataset has no measurement for this exact pair. The combination is allowed; no loss or lifetime value is invented.</p>
        )}
      </div>

      <label className="scenario-field">
        <span>Junction effect <strong>{signed((junctionFactor - 1) * 100, 0)}%</strong></span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={junctionFactor}
          onChange={(event) => {
            session.setControls({ junctionFactor: Number(event.target.value) });
          }}
        />
      </label>

      <label className="scenario-field">
        <span>Total capacitance <strong>{signed((capacitanceFactor - 1) * 100, 0)}%</strong></span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={capacitanceFactor}
          onChange={(event) => {
            session.setControls({ capacitanceFactor: Number(event.target.value) });
          }}
        />
      </label>

      <div className="row-actions">
        <button type="button" className="btn primary" aria-label="Compare scenario" aria-busy={loading} onClick={compare} disabled={loading || !!session.validationError('material')}>
          <span role="status">{loading ? 'Calculating…' : 'Compare scenario'}</span>
        </button>
        <button type="button" className="btn" onClick={() => {
          session.setControls({ junctionFactor: 1, capacitanceFactor: 1 });
        }}>
          Clear effects
        </button>
      </div>

      {isMajoranaPair && (
        <p className="illus">
          The selected materials resemble part of Majorana 2, but the result below remains an isolated-transmon
          sensitivity calculation—not a topological-qubit simulation.
        </p>
      )}
      {(error || session.validationError('material')) && <p className="scenario-error" role="status">{error || session.validationError('material')}</p>}

      {comparison && (
        <div className="scenario-result" aria-live="polite">
          {!session.material.current && <p className="scenario-error" role="status">Outdated result — rerun this scenario.</p>}
          <dl className="kv">
            <dt>Scenario</dt><dd>{comparison.scenario_name}</dd>
            <dt>Frequency</dt><dd>{num(comparison.baseline.f01_ghz, 3)} → {num(comparison.modified.f01_ghz, 3)} GHz</dd>
            <dt>Change</dt><dd>{signed(comparison.deltas.f01_ghz, 3)} GHz</dd>
            <dt>Anharmonicity</dt><dd>{num(comparison.baseline.anharmonicity_mhz, 1)} → {num(comparison.modified.anharmonicity_mhz, 1)} MHz</dd>
            <dt>Dispersion bound</dt><dd>{num(comparison.baseline.dispersion_upper_khz, 3)} → {num(comparison.modified.dispersion_upper_khz, 3)} kHz</dd>
          </dl>
          <button type="button" className="btn" disabled={!session.getApply('material')} onClick={() => { const applied = session.getApply('material'); if (applied) onApply(applied); }}>
            Apply evaluated scenario
          </button>
          <p className="scenario-scope">{comparison.scope}.</p>
        </div>
      )}
    </div>
  );
}
