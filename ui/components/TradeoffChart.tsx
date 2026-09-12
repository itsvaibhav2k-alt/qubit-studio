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
  selected: SearchCandidate;
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
  feasible: SearchCandidate[];
  selected: SearchCandidate;
  onSelect: (candidate: SearchCandidate) => void;
  expanded?: boolean;
}

function ChartGraphic({ feasible, selected, onSelect, expanded = false }: ChartGraphicProps) {
  const logCharge = feasible.map((candidate) => Math.log10(candidate.dispersion_upper_khz));
  const separation = feasible.map((candidate) => candidate.anharmonicity_mhz);
  const [minX, maxX] = extent(logCharge);
  const [minY, maxY] = extent(separation);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (value: number) => LEFT + ((Math.log10(value) - minX) / (maxX - minX)) * plotWidth;
  const y = (value: number) => TOP + (1 - (value - minY) / (maxY - minY)) * plotHeight;
  const selectedRatio = selected.ratio;

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
        <div style={{ textAlign: 'center' }}>Charge sensitivity (<MathText math="\\mathrm{kHz}" />) · lower is better</div>
      </foreignObject>
      <foreignObject x="-55" y="64" width="140" height="18" className="tradeoff-axis-label" transform="rotate(-90 15 73)">
        <div style={{ textAlign: 'center' }}>Level separation (<MathText math="\\mathrm{MHz}" />)</div>
      </foreignObject>
      {feasible.map((candidate) => {
        const isSelected = Math.abs(candidate.ratio - selectedRatio) < 1e-9;
        return (
          <circle
            key={candidate.ratio}
            className={`tradeoff-point${isSelected ? ' selected' : ''}`}
            cx={x(candidate.dispersion_upper_khz)}
            cy={y(candidate.anharmonicity_mhz)}
            r={isSelected ? 5 : 3.2}
            role="button"
            tabIndex={0}
            aria-label={`Choose design with ${num(candidate.anharmonicity_mhz, 1)} MHz level separation and ${num(candidate.dispersion_upper_khz, 3)} kHz charge sensitivity`}
            onClick={() => onSelect(candidate)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(candidate);
            }}
          >
            <title>{`EJ/EC ${num(candidate.ratio, 1)} · separation ${num(candidate.anharmonicity_mhz, 1)} MHz · charge ${num(candidate.dispersion_upper_khz, 3)} kHz`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export default function TradeoffChart({ candidates, selected, onSelect }: TradeoffChartProps) {
  const [expanded, setExpanded] = useState(false);
  const feasible = candidates.filter((candidate) => candidate.feasible);
  if (feasible.length === 0) return null;

  return (
    <>
      <div className="tradeoff-chart">
        <div className="tradeoff-chart-head">
          <div>
            <strong>Explore passing designs</strong>
            <p>Higher is easier to control. Farther left is less affected by charge.</p>
          </div>
          <div className="tradeoff-chart-tools">
            <span>{feasible.length} pass</span>
            <button type="button" onClick={() => setExpanded(true)}>Open large graph</button>
          </div>
        </div>
        <ChartGraphic feasible={feasible} selected={selected} onSelect={onSelect} />
        <p className="tradeoff-chart-help">Select any dot to use that passing design.</p>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="tradeoff-dialog" showCloseButton>
          <DialogHeader>
            <DialogTitle>Compare passing designs</DialogTitle>
            <DialogDescription>
              Select a dot to update the design. The highlighted dot is currently selected.
            </DialogDescription>
          </DialogHeader>
          <div className="tradeoff-chart tradeoff-chart-expanded">
            <div className="tradeoff-expanded-summary">
              <span><small>Selected level separation</small><strong><MathText math={`${num(selected.anharmonicity_mhz, 1)}\\,\\mathrm{MHz}`} /></strong></span>
              <span><small>Selected charge sensitivity</small><strong><MathText math={`${num(selected.dispersion_upper_khz, 3)}\\,\\mathrm{kHz}`} /></strong></span>
              <span><small>Selected <MathText math="E_J/E_C" /></small><strong><MathText math={num(selected.ratio, 1)} /></strong></span>
            </div>
            <ChartGraphic feasible={feasible} selected={selected} onSelect={onSelect} expanded />
            <div className="tradeoff-legend">
              <span><i className="selected-dot" />Selected design</span>
              <span><i />Other passing designs</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
