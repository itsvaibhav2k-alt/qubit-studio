'use client';

import { useState } from 'react';
import MathText from '@/components/MathText';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { num } from '@/lib/format';
import type { SearchCandidate } from '@/lib/types';

interface TradeoffChartProps {
  candidates: SearchCandidate[];
  selected: SearchCandidate | null;
  onSelect: (candidate: SearchCandidate) => void;
}

const WIDTH = 300;
const HEIGHT = 190;
const LEFT = 42;
const RIGHT = 14;
const TOP = 16;
const BOTTOM = 38;

function extent(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min - 0.5, max + 0.5];
  return [min, max];
}

interface ChartGraphicProps {
  candidates: SearchCandidate[];
  selected: SearchCandidate | null;
  onSelect: (candidate: SearchCandidate) => void;
  expanded?: boolean;
}

function ChartGraphic({ candidates, selected, onSelect, expanded = false }: ChartGraphicProps) {
  const logCharge = candidates.map((candidate) => Math.log10(Math.max(candidate.dispersion_upper_khz, 1e-9)));
  const separation = candidates.map((candidate) => candidate.anharmonicity_mhz);
  const [minX, maxX] = extent(logCharge);
  const [minY, maxY] = extent(separation);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (value: number) => LEFT + ((Math.log10(Math.max(value, 1e-9)) - minX) / (maxX - minX)) * plotWidth;
  const y = (value: number) => TOP + (1 - (value - minY) / (maxY - minY)) * plotHeight;
  const selectedRatio = selected?.ratio ?? null;

  return (
    <svg
      className={expanded ? 'expanded' : undefined}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Passing designs plotted by charge sensitivity and level separation"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const gridY = TOP + fraction * plotHeight;
        const value = maxY - fraction * (maxY - minY);
        return (
          <g key={`y-${fraction}`}>
            <line className="tradeoff-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={gridY} y2={gridY} />
            <foreignObject x="0" y={gridY - 8} width={LEFT - 6} height="18" className="tradeoff-tick">
              <div style={{ textAlign: 'right' }}><MathText math={num(value, 0)} /></div>
            </foreignObject>
          </g>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const gridX = LEFT + fraction * plotWidth;
        const value = 10 ** (minX + fraction * (maxX - minX));
        return (
          <g key={`x-${fraction}`}>
            <line className="tradeoff-grid" x1={gridX} x2={gridX} y1={TOP} y2={HEIGHT - BOTTOM} />
            <foreignObject x={gridX - 20} y={HEIGHT - BOTTOM + 3} width="40" height="18" className="tradeoff-tick">
              <div style={{ textAlign: 'center' }}><MathText math={num(value, value < 1 ? 2 : 1)} /></div>
            </foreignObject>
          </g>
        );
      })}
      <foreignObject x={LEFT} y={HEIGHT - 17} width={plotWidth} height="18" className="tradeoff-axis-label">
        <div style={{ textAlign: 'center' }}>Charge sensitivity (<MathText math="\mathrm{kHz}" />) · lower is better</div>
      </foreignObject>
      <foreignObject x="-55" y="64" width="140" height="18" className="tradeoff-axis-label" transform="rotate(-90 15 73)">
        <div style={{ textAlign: 'center' }}>Level separation (<MathText math="\mathrm{MHz}" />)</div>
      </foreignObject>
      {candidates.map((candidate) => {
        const isSelected = selectedRatio !== null && Math.abs(candidate.ratio - selectedRatio) < 1e-9;
        const explanation = candidate.feasible ? 'passes all goals' : candidate.violations.map(violationLabel).join(', ');
        return (
          <circle
            key={candidate.ratio}
            className={`tradeoff-point ${candidate.feasible ? 'passing' : 'failing'}${isSelected ? ' selected' : ''}`}
            cx={x(candidate.dispersion_upper_khz)}
            cy={y(candidate.anharmonicity_mhz)}
            r={isSelected ? 5 : 3.2}
            role={candidate.feasible ? 'button' : undefined}
            tabIndex={candidate.feasible ? 0 : undefined}
            aria-label={`${candidate.feasible ? 'Choose' : 'Unavailable'} design with ${num(candidate.anharmonicity_mhz, 1)} MHz level separation and ${num(candidate.dispersion_upper_khz, 3)} kHz charge sensitivity; ${explanation}`}
            onClick={() => { if (candidate.feasible) onSelect(candidate); }}
            onKeyDown={(event) => {
              if (candidate.feasible && (event.key === 'Enter' || event.key === ' ')) onSelect(candidate);
            }}
          >
            <title>{`E_J/E_C ${num(candidate.ratio, 1)} · |α| ${num(candidate.anharmonicity_mhz, 1)} MHz · charge ${num(candidate.dispersion_upper_khz, 3)} kHz · ${explanation}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function violationLabel(code: string): string {
  if (code === 'charge_budget_khz') return 'charge sensitivity is too high';
  if (code === 'anharmonicity_floor_mhz') return 'level separation is too low';
  if (code.includes('ej_')) return 'junction energy is outside the supported range';
  if (code.includes('ec_')) return 'charging energy is outside the supported range';
  return 'does not meet a design rule';
}

export default function TradeoffChart({ candidates, selected, onSelect }: TradeoffChartProps) {
  const [expanded, setExpanded] = useState(false);
  const feasible = candidates.filter((candidate) => candidate.feasible);
  if (candidates.length === 0) return null;

  return (
    <>
      <div className="tradeoff-chart">
        <div className="tradeoff-chart-head">
          <div>
            <strong>Trade-off between passing designs</strong>
            <p>Higher gives more level separation. Farther left means less charge sensitivity.</p>
          </div>
          <div className="tradeoff-chart-tools">
            <span><MathText math={`${feasible.length}/${candidates.length}`} /> pass</span>
            <button type="button" onClick={() => setExpanded(true)}>Expand graph</button>
          </div>
        </div>
        {feasible.length > 0
          ? <ChartGraphic candidates={feasible} selected={selected} onSelect={onSelect} />
          : <p className="tradeoff-chart-empty">No designs pass all three goals yet.</p>}
        {feasible.length > 0 && <div className="tradeoff-legend"><span><i className="selected-dot"/>Selected</span><span><i className="passing-dot"/>Other passing designs</span></div>}
        {selected && <div className="tradeoff-selected-readout" aria-live="polite">
          <strong>Selected values</strong>
          <span><MathText math={`E_J/E_C=${num(selected.ratio, 1)}`} /></span>
          <span>Level separation: <MathText math={`${num(selected.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></span>
          <span>Charge sensitivity: <MathText math={`${num(selected.dispersion_upper_khz, 3)}\\,\\mathrm{kHz}`} /></span>
        </div>}
        <p className="tradeoff-chart-help">Every dot shown here passes all three goals.</p>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="tradeoff-dialog" showCloseButton>
          <DialogHeader>
            <DialogTitle>Compare passing designs</DialogTitle>
            <DialogDescription>
              Select a dot to apply that design and see its exact values.
            </DialogDescription>
          </DialogHeader>
          <div className="tradeoff-chart tradeoff-chart-expanded">
            {selected ? <div className="tradeoff-expanded-summary">
              <span><small>Selected level separation</small><strong><MathText math={`${num(selected.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></strong></span>
              <span><small>Selected charge sensitivity</small><strong><MathText math={`${num(selected.dispersion_upper_khz, 3)}\\,\\mathrm{kHz}`} /></strong></span>
              <span><small>Selected <MathText math="E_J/E_C" /></small><strong><MathText math={num(selected.ratio, 1)} /></strong></span>
            </div> : <p>No option passes all three goals yet. The gray dots below show what was evaluated.</p>}
            {feasible.length > 0
              ? <ChartGraphic candidates={feasible} selected={selected} onSelect={onSelect} expanded />
              : <p className="tradeoff-chart-empty">No designs pass all three goals yet.</p>}
            {feasible.length > 0 && <div className="tradeoff-legend">
              <span><i className="selected-dot" />Selected design</span>
              <span><i className="passing-dot" />Other passing designs</span>
            </div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
