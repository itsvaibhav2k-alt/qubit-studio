'use client';

import { useState } from 'react';
import MathText from '@/components/MathText';
import { num } from '@/lib/format';
import { mathValue } from '@/lib/math-format';
import {
  capacitorAreaFromEc,
  DEFAULT_GEOMETRY_ASSUMPTIONS,
  ecFromCapacitorArea,
  ejFromJunctionArea,
  junctionAreaFromEj,
} from '@/lib/geometry-model';
import type { DeviceParams } from '@/lib/types';

interface GeometryEditorProps {
  params: DeviceParams;
  onApply: (ejGhz: number, ecGhz: number) => void;
}

export default function GeometryEditor({ params, onApply }: GeometryEditorProps) {
  const [junctionArea, setJunctionArea] = useState(() =>
    junctionAreaFromEj(params.ej_ghz, DEFAULT_GEOMETRY_ASSUMPTIONS.criticalCurrentDensityAcm2),
  );
  const [capacitorArea, setCapacitorArea] = useState(() =>
    capacitorAreaFromEc(params.ec_ghz, DEFAULT_GEOMETRY_ASSUMPTIONS.capacitanceDensityFfUm2),
  );

  const nextEj = ejFromJunctionArea(junctionArea, DEFAULT_GEOMETRY_ASSUMPTIONS.criticalCurrentDensityAcm2);
  const nextEc = ecFromCapacitorArea(capacitorArea, DEFAULT_GEOMETRY_ASSUMPTIONS.capacitanceDensityFfUm2);
  const junctionVisualScale = Math.min(1.6, Math.max(0.55, Math.sqrt(junctionArea / 0.06)));
  const capacitorVisualScale = Math.min(1.35, Math.max(0.7, Math.sqrt(capacitorArea / 810)));

  return (
    <details className="tech geometry-editor">
      <summary>Shape the junction and capacitor</summary>
      <div className="body">
        <p className="geometry-intro">Explore how physical size could affect <MathText math="E_J" /> and <MathText math="E_C" /> using two stated assumptions.</p>

        <label className="geometry-field">
          <span><strong>Junction area</strong><output><MathText math={mathValue(junctionArea, 3, 'um2')} /></output></span>
          <input type="range" min="0.001" max="0.2" step="0.001" value={junctionArea} onChange={(event) => setJunctionArea(Number(event.target.value))} />
          <small>Shown as roughly <MathText math={`${mathValue(Math.sqrt(junctionArea), 3, 'um')}\\times ${mathValue(Math.sqrt(junctionArea), 3, 'um')}`} /> if square.</small>
        </label>

        <div className="geometry-shape-stage">
          <span>Live shape preview</span>
          <div className="geometry-shape-assembly" aria-label="Preview of the capacitor pads and junction shape">
            <i className="geometry-pad" style={{ transform: `scale(${capacitorVisualScale})` }} />
            <i className="geometry-junction" style={{ transform: `scale(${junctionVisualScale})` }} />
            <i className="geometry-pad" style={{ transform: `scale(${capacitorVisualScale})` }} />
          </div>
          <small>Apply the values to reshape these parts in the 3D chip.</small>
        </div>

        <label className="geometry-field">
          <span><strong>Capacitor area</strong><output><MathText math={mathValue(capacitorArea, 0, 'um2')} /></output></span>
          <input type="range" min="100" max="3000" step="10" value={capacitorArea} onChange={(event) => setCapacitorArea(Number(event.target.value))} />
          <small>A larger capacitor lowers <MathText math="E_C" /> in this simplified conversion.</small>
        </label>

        <div className="geometry-preview">
          <span><small>Estimated <MathText math="E_J/h" /></small><strong><MathText math={mathValue(nextEj, 2, 'GHz')} /></strong></span>
          <span><small>Estimated <MathText math="E_C/h" /></small><strong><MathText math={mathValue(nextEc, 3, 'GHz')} /></strong></span>
          <span><small><MathText math="E_J/E_C" /></small><strong><MathText math={num(nextEj / nextEc, 1)} /></strong></span>
        </div>

        <button type="button" className="btn primary full-button" onClick={() => onApply(nextEj, nextEc)}>Apply values + reshape 3D chip</button>

        <details className="geometry-assumptions">
          <summary>Assumptions used</summary>
          <p>Critical-current density: <MathText math={mathValue(DEFAULT_GEOMETRY_ASSUMPTIONS.criticalCurrentDensityAcm2, 0, 'Acm2')} />.</p>
          <p>Capacitance per area: <MathText math={mathValue(DEFAULT_GEOMETRY_ASSUMPTIONS.capacitanceDensityFfUm2, 0, 'fFum2')} />.</p>
          <p>These fixed teaching values ignore fringe fields, wiring, material-specific processing, and fabrication variation. The 3D shapes scale for comparison, not as a fabrication drawing.</p>
        </details>
      </div>
    </details>
  );
}
