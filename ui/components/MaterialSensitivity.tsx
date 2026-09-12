'use client';

import { useState } from 'react';
import MathText from '@/components/MathText';
import RichMathText from '@/components/RichMathText';
import { num, signed } from '@/lib/format';
import { BCQT_SOURCE, MATERIAL_CATALOG, MATERIAL_RECORDS } from '@/lib/material-records';
import { materialColor } from '@/lib/material-colors';
import type { DeviceParams, DeviceResult, MaterialScenarioResult } from '@/lib/types';

interface MaterialSensitivityProps {
  params: DeviceParams;
  result: DeviceResult | null;
  onApply: (ejGhz: number, ecGhz: number) => void;
  onMaterialsChange: (topMaterial: string, baseMaterial: string) => void;
  topMaterial: string;
  baseMaterial: string;
}

export default function MaterialSensitivity({ params, result, onApply, onMaterialsChange, topMaterial, baseMaterial }: MaterialSensitivityProps) {
  const [junctionFactor, setJunctionFactor] = useState(0.9);
  const [capacitanceFactor, setCapacitanceFactor] = useState(1.1);
  const [comparison, setComparison] = useState<MaterialScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const matchingRecord = MATERIAL_RECORDS
    .filter((record) => record.kind === 'resonator-loss' && record.material === topMaterial && record.substrate === baseMaterial)
    .sort((a, b) => a.kind === 'resonator-loss' && b.kind === 'resonator-loss' ? a.lowPowerLossMax - b.lowPowerLossMax : 0)[0];
  const isMajoranaPair =
    (topMaterial === 'Pb' && ['InAs', 'InAsSb'].includes(baseMaterial)) ||
    (baseMaterial === 'Pb' && ['InAs', 'InAsSb'].includes(topMaterial));
  const majoranaRecord = MATERIAL_RECORDS.find((record) => record.id === 'microsoft-majorana-2-2026');

  const decayScaleUs = (loss: number) =>
    result ? 1e6 / (2 * Math.PI * result.f01_ghz * 1e9 * loss) : null;
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
    setComparison(null);
  };

  const compare = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/material-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_name: `${topMaterial.trim()} on ${baseMaterial.trim()}`.slice(0, 80),
          ...params,
          junction_critical_current_factor: junctionFactor,
          total_capacitance_factor: capacitanceFactor,
        }),
      });
      const body = (await response.json()) as MaterialScenarioResult | { error?: string; detail?: unknown };
      if (!response.ok) {
        const failure = body as { error?: string; detail?: unknown };
        throw new Error(failure.error ?? JSON.stringify(failure.detail ?? body));
      }
      setComparison(body as MaterialScenarioResult);
    } catch (reason) {
      setComparison(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="insp-section material-sensitivity">
      <div className="insp-title">Material sandbox</div>
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

      <p className="visual-note">The 3D chip updates immediately using representative room-light colors: metal films are silver/gray except gold-toned TiN, and the base reflects the substrate. Color is visual only.</p>

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
                <RichMathText>{matchingRecord.lowPowerLossMin === matchingRecord.lowPowerLossMax
                  ? matchingRecord.lowPowerLossMin.toExponential(1)
                  : `${matchingRecord.lowPowerLossMin.toExponential(1)}–${matchingRecord.lowPowerLossMax.toExponential(1)}`}</RichMathText>
              </dd>
              {decayLow !== null && decayHigh !== null && (
                <><dt>Decay scale</dt><dd><MathText math={`\\sim ${num(decayLow, 1)}${decayLow !== decayHigh ? `\\text{–}${num(decayHigh, 1)}` : ''}\\,\\mu\\mathrm{s}`} />*</dd></>
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
        <span>Junction effect <strong><MathText math={`${signed((junctionFactor - 1) * 100, 0)}\\,\\%`} /></strong></span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={junctionFactor}
          onChange={(event) => {
            setJunctionFactor(Number(event.target.value));
            setComparison(null);
          }}
        />
      </label>

      <label className="scenario-field">
        <span>Total capacitance <strong><MathText math={`${signed((capacitanceFactor - 1) * 100, 0)}\\,\\%`} /></strong></span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={capacitanceFactor}
          onChange={(event) => {
            setCapacitanceFactor(Number(event.target.value));
            setComparison(null);
          }}
        />
      </label>

      <div className="row-actions">
        <button type="button" className="btn primary" onClick={compare} disabled={loading}>
          {loading ? 'Calculating…' : 'Compare scenario'}
        </button>
        <button type="button" className="btn" onClick={() => {
          setJunctionFactor(1);
          setCapacitanceFactor(1);
          setComparison(null);
        }}>
          Clear effects
        </button>
      </div>

      {isMajoranaPair && (
        <p className="illus">
          The selected materials resemble part of Majorana <MathText math="2" />, but the result below remains an isolated-transmon
          sensitivity calculation—not a topological-qubit simulation.
        </p>
      )}
      {error && <p className="scenario-error">{error}</p>}

      {comparison && (
        <div className="scenario-result" aria-live="polite">
          <dl className="kv">
            <dt>Scenario</dt><dd>{topMaterial} / {baseMaterial}</dd>
            <dt>Frequency</dt><dd><MathText math={`${num(comparison.baseline.f01_ghz, 3)}\\to ${num(comparison.modified.f01_ghz, 3)}\\,\\mathrm{GHz}`} /></dd>
            <dt>Change</dt><dd><MathText math={`${signed(comparison.deltas.f01_ghz, 3)}\\,\\mathrm{GHz}`} /></dd>
            <dt>Anharmonicity</dt><dd><MathText math={`${num(comparison.baseline.anharmonicity_mhz, 1)}\\to ${num(comparison.modified.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></dd>
            <dt>Dispersion</dt><dd><MathText math={`${num(comparison.baseline.dispersion_upper_khz, 3)}\\to ${num(comparison.modified.dispersion_upper_khz, 3)}\\,\\mathrm{kHz}`} /></dd>
          </dl>
          <button type="button" className="btn" onClick={() => onApply(comparison.modified.ej_ghz, comparison.modified.ec_ghz)}>
            Apply modified <MathText math="E_J" /> and <MathText math="E_C" />
          </button>
          <p className="scenario-scope">{comparison.scope}.</p>
        </div>
      )}
    </div>
  );
}
