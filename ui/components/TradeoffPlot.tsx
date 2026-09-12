'use client';

import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { INFEASIBLE_SENTENCE, violationList } from '@/lib/design-copy';
import { num } from '@/lib/format';
import { logPosition } from '@/lib/log-scale';
import { nearestPoint } from '@/lib/plot-hit';
import type { PlotPoint } from '@/lib/plot-hit';
import { sameDeviceParams } from '@/lib/search-baseline';
import type { CandidateId, SearchCandidate, SearchResponse } from '@/lib/search-types';
import type { DeviceParams } from '@/lib/types';

export interface TradeoffPlotProps {
  run: SearchResponse;
  fresh: boolean;
  inspectedId: CandidateId | null;
  recommendedId: CandidateId | null;
  appliedParams: DeviceParams;
  baseline: { params: DeviceParams; assessment: SearchCandidate | null } | null;
  onInspect: (id: CandidateId) => void;
}

const W = 360;
const H = 200;
const L = 44;
const R = W - 10;
const T = 12;
const B = H - 36;
const HIT_PX = 14;
const X_PAD = 1.4; // multiplicative padding on the log axis
const FLOOR_EPS = 1e-9;

function decadeLabel(exponent: number): string {
  return exponent < 0 ? (10 ** exponent).toFixed(-exponent) : String(10 ** exponent);
}

function dispersionText(c: SearchCandidate): string {
  return c.dispersion_khz === null || c.dispersion_status === 'below_reporting_floor'
    ? `< ${num(c.dispersion_upper_khz, 3)} kHz (unresolved)`
    : `${num(c.dispersion_khz, 3)} kHz`;
}

function candidateLine(c: SearchCandidate): string {
  const verdict = c.feasible ? 'qualifies' : `rejected: ${violationList(c.violations)}`;
  return `ratio ${num(c.ratio, 1)} · A ${num(c.anharmonicity_mhz, 1)} MHz · ${dispersionText(c)} · ${verdict}`;
}

export default function TradeoffPlot({
  run,
  fresh,
  inspectedId,
  recommendedId,
  appliedParams,
  baseline,
  onInspect,
}: TradeoffPlotProps) {
  const [hoverId, setHoverId] = useState<CandidateId | null>(null);
  const { request, candidates } = run;
  const assessment = baseline?.assessment ?? null;

  const scale = useMemo(() => {
    const extra = assessment ? [assessment] : [];
    const xs = [...candidates, ...extra].map((c) => c.dispersion_upper_khz);
    const ys = [...candidates, ...extra].map((c) => c.anharmonicity_mhz);
    const xLo = Math.max(Math.min(...xs) / X_PAD, FLOOR_EPS);
    const xHi = Math.max(...xs, request.max_dispersion_khz) * X_PAD;
    const yMin = Math.min(...ys, request.min_anharmonicity_mhz);
    const yMax = Math.max(...ys, request.min_anharmonicity_mhz);
    const yPad = (yMax - yMin || 1) * 0.08;
    const yLo = yMin - yPad;
    const yHi = yMax + yPad;
    const sx = (khz: number) => L + logPosition(khz, xLo, xHi) * (R - L);
    const sy = (mhz: number) => B - ((mhz - yLo) / (yHi - yLo)) * (B - T);
    const floors = candidates
      .filter((c) => c.dispersion_status === 'below_reporting_floor')
      .map((c) => c.dispersion_upper_khz);
    const floor = floors.length ? Math.min(...floors) : null;
    const ticks: { v: number; label: string }[] = [];
    for (let e = Math.ceil(Math.log10(xLo)); e <= Math.floor(Math.log10(xHi)); e += 1) {
      const v = 10 ** e;
      if (floor === null || Math.abs(v - floor) > FLOOR_EPS) ticks.push({ v, label: decadeLabel(e) });
    }
    if (floor !== null) ticks.push({ v: floor, label: '≤ floor' });
    return { sx, sy, yLo, yHi, ticks };
  }, [candidates, assessment, request.max_dispersion_khz, request.min_anharmonicity_mhz]);

  const points: PlotPoint[] = useMemo(
    () => candidates.map((c) => ({ id: c.candidate_id, x: scale.sx(c.dispersion_upper_khz), y: scale.sy(c.anharmonicity_mhz) })),
    [candidates, scale],
  );
  const byRatio = useMemo(() => [...candidates].sort((a, b) => a.ratio - b.ratio), [candidates]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.candidate_id, c])), [candidates]);

  const inspected = inspectedId ? byId.get(inspectedId) ?? null : null;
  const recommended = recommendedId ? byId.get(recommendedId) ?? null : null;
  const applied = candidates.find((c) => sameDeviceParams(c, appliedParams)) ?? null;
  const hovered = hoverId ? byId.get(hoverId) ?? null : null;

  // Pointer → viewBox units. The SVG keeps its aspect (xMidYMid meet), so one scale plus centring offsets suffice.
  const hitAt = (event: { clientX: number; clientY: number; currentTarget: SVGSVGElement }): CandidateId | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const k = Math.min(rect.width / W, rect.height / H);
    if (!k) return null;
    const vx = (event.clientX - rect.left - (rect.width - W * k) / 2) / k;
    const vy = (event.clientY - rect.top - (rect.height - H * k) / 2) / k;
    return nearestPoint(points, vx, vy, HIT_PX / k);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!fresh || byRatio.length === 0) return;
    const index = byRatio.findIndex((c) => c.candidate_id === inspectedId);
    const last = byRatio.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index < 0 ? 0 : Math.min(last, index + 1);
    else if (event.key === 'ArrowLeft') next = index < 0 ? last : Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    if (next !== index) onInspect(byRatio[next].candidate_id);
  };

  const { sx, sy, yLo, yHi, ticks } = scale;
  const limitX = sx(request.max_dispersion_khz);
  const minY = sy(request.min_anharmonicity_mhz);
  const labelRight = inspected ? sx(inspected.dispersion_upper_khz) < R - 80 : true;
  const ariaLabel = `Trade-off plot: ${candidates.length} evaluated candidates, charge variation in kHz on a log x axis against separation A in MHz. ${run.feasible_count} qualify.`
    + (fresh ? ' Arrow keys move the inspected candidate in ratio order; Home and End jump to the ends.' : ' Requirements changed since this run; inspection is disabled until it is run again.');

  const glyph = (c: SearchCandidate, key: string) => {
    const x = sx(c.dispersion_upper_khz);
    const y = sy(c.anharmonicity_mhz);
    const stroke = c.feasible ? 'var(--text-2)' : 'var(--line-strong)';
    if (c.dispersion_status === 'below_reporting_floor') {
      return <polygon key={key} points={`${x},${y - 3.2} ${x + 3},${y + 2.2} ${x - 3},${y + 2.2}`} fill="none" stroke={stroke} strokeWidth="1" />;
    }
    return c.feasible
      ? <circle key={key} cx={x} cy={y} r="2.5" fill="var(--text-2)" />
      : <circle key={key} cx={x} cy={y} r="2.5" fill="none" stroke="var(--line-strong)" strokeWidth="1" />;
  };

  return (
    <div className={`tradeoff${fresh ? '' : ' stale'}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label={ariaLabel}
        aria-disabled={!fresh}
        tabIndex={fresh ? 0 : -1}
        onPointerMove={(e) => setHoverId(hitAt(e))}
        onPointerLeave={() => setHoverId(null)}
        onClick={(e) => {
          const id = hitAt(e);
          if (id) onInspect(id);
        }}
        onKeyDown={onKeyDown}
      >
        {/* qualifying region: left of the limit and above the minimum */}
        <rect x={L} y={T} width={Math.max(0, limitX - L)} height={Math.max(0, minY - T)} fill="var(--accent-soft)" opacity="0.7" />

        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--line)" />
        <line x1={L} x2={L} y1={T} y2={B} stroke="var(--line)" />
        {ticks.map((t) => (
          <g key={t.label}>
            <line x1={sx(t.v)} x2={sx(t.v)} y1={B} y2={B + 3} stroke="var(--line-strong)" />
            <text x={sx(t.v)} y={B + 13} fontSize="9" textAnchor="middle" fill="var(--text-3)">{t.label}</text>
          </g>
        ))}
        <text x={L - 4} y={T + 4} fontSize="9" textAnchor="end" fill="var(--text-3)">{num(yHi, 0)}</text>
        <text x={L - 4} y={B} fontSize="9" textAnchor="end" fill="var(--text-3)">{num(yLo, 0)}</text>
        <text x={(L + R) / 2} y={H - 3} fontSize="9" textAnchor="middle" fill="var(--text-3)">
          charge variation |f01(½) − f01(0)|, kHz (log)
        </text>
        <text x={9} y={(T + B) / 2} fontSize="9" textAnchor="middle" fill="var(--text-3)" transform={`rotate(-90 9 ${(T + B) / 2})`}>
          separation A, MHz
        </text>

        <line x1={limitX} x2={limitX} y1={T} y2={B} stroke="var(--text-3)" strokeDasharray="3 3" />
        <text x={limitX + 3} y={T + 8} fontSize="9" fill="var(--text-2)">limit {num(request.max_dispersion_khz, 3)}</text>
        <line x1={L} x2={R} y1={minY} y2={minY} stroke="var(--text-3)" strokeDasharray="3 3" />
        <text x={R} y={minY - 3} fontSize="9" textAnchor="end" fill="var(--text-2)">minimum {num(request.min_anharmonicity_mhz, 0)}</text>

        {candidates.map((c) => glyph(c, c.candidate_id))}

        {applied && (
          <rect x={sx(applied.dispersion_upper_khz) - 5} y={sy(applied.anharmonicity_mhz) - 5} width="10" height="10" fill="none" stroke="var(--text)" strokeWidth="1" />
        )}
        {assessment && (() => {
          const x = sx(assessment.dispersion_upper_khz);
          const y = sy(assessment.anharmonicity_mhz);
          return <polygon points={`${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}`} fill="none" stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 2" />;
        })()}
        {recommended && (
          <circle cx={sx(recommended.dispersion_upper_khz)} cy={sy(recommended.anharmonicity_mhz)} r="6" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
        )}
        {hovered && fresh && hovered.candidate_id !== inspectedId && (
          <circle cx={sx(hovered.dispersion_upper_khz)} cy={sy(hovered.anharmonicity_mhz)} r="7" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
        )}
        {inspected && (() => {
          const x = sx(inspected.dispersion_upper_khz);
          const y = sy(inspected.anharmonicity_mhz);
          const dir = labelRight ? 1 : -1;
          return (
            <g>
              <line x1={x} y1={y} x2={x + dir * 10} y2={y - 8} stroke="var(--accent)" strokeWidth="1" />
              <circle cx={x} cy={y} r="4" fill="var(--accent)" />
              <text x={x + dir * 12} y={y - 10} fontSize="9" textAnchor={labelRight ? 'start' : 'end'} fill="var(--accent)">inspected</text>
            </g>
          );
        })()}
      </svg>
      <p className="cap">● qualifies · ○ rejected · △ ≤ floor · ◎ recommended · □ applied · ◇ baseline</p>

      {/* ponytail: no hidden per-candidate <ul>; the read-out plus aria-label cover screen readers. */}
      <div className="tradeoff-readout">
        {!fresh && <div className="stale-note">Requirements changed since this run. Run again to inspect candidates.</div>}
        <div><span className="k">Inspected:</span> <span className="v">{inspected ? candidateLine(inspected) : 'none'}</span></div>
        <div>
          <span className="k">Recommended:</span>{' '}
          <span className="v">{recommended ? `ratio ${num(recommended.ratio, 1)}` : `none — ${INFEASIBLE_SENTENCE}`}</span>
        </div>
        <div><span className="k">Applied to device:</span> <span className="v">{applied ? `ratio ${num(applied.ratio, 1)}` : 'none'}</span></div>
        <div>
          <span className="k">Baseline:</span>{' '}
          <span className="v">
            {!baseline ? 'none' : !assessment ? 'assessing…' : `ratio ${num(assessment.ratio, 1)} · ${assessment.feasible ? 'qualifies' : 'fails'}`}
          </span>
        </div>
        {fresh && recommendedId !== null && inspectedId !== recommendedId && (
          <button type="button" className="btn" onClick={() => onInspect(recommendedId)}>
            Back to recommended
          </button>
        )}
      </div>
    </div>
  );
}
