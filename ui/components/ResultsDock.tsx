'use client';

import type { ReactNode } from 'react';
import DesignComparison from './DesignComparison';
import TradeoffPlot from './TradeoffPlot';
import { INFEASIBLE_SENTENCE, requirementsSummary, searchRangeSummary } from '@/lib/design-copy';
import { DASH, delta, dispersionDisplay, num, paramSummary, signed } from '@/lib/format';
import { ladderY } from '@/lib/ladder';
import type {
  BaselineAssessment,
  BaselineAssessmentStatus,
  CandidateId,
  DesignComparison as DesignComparisonValue,
  FrozenBaseline,
  SearchCandidate,
  SearchResponse,
} from '@/lib/search-types';
import ParamField from './ParamField';
import { PARAMS } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import type { ChargePoint, DeviceParams, DeviceResult } from '@/lib/types';

export type WorkMode = 'explore' | 'design';

/** Everything the dock needs in Design mode. Null in Explore. */
export interface DesignDock {
  run: SearchResponse | null;
  fresh: boolean;
  inspected: SearchCandidate | null;
  candidateIndex: number | null;
  candidateCount: number;
  recommendedId: CandidateId | null;
  appliedParams: DeviceParams;
  baseline: FrozenBaseline | null;
  assessmentStatus: BaselineAssessmentStatus;
  assessment: BaselineAssessment | null;
  assessmentError: string | null;
  comparison: DesignComparisonValue;
  selectionExplanation: string | null;
  canApply: boolean;
  onInspect: (id: CandidateId) => void;
  onApply: () => void;
  onRetryAssessment: () => void;
}

interface ResultsDockProps {
  mode: WorkMode;
  result: DeviceResult | null;
  baseline: DeviceResult | null;
  stale: boolean;
  error: string | null;
  canPin: boolean;
  /** Lower row (charts / trade-off / comparison) visible. Owned by the page. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Working device, for the solver-settings cutoff field (Explore only). */
  params: DeviceParams;
  onChange: (key: ParamKey, value: number) => void;
  onPin: () => void;
  onClearBaseline: () => void;
  onRetry: () => void;
  design: DesignDock | null;
}

interface MetricProps {
  label: string;
  symbol?: string;
  badge?: string;
  value?: string;
  unit?: string;
  muted?: boolean;
  note?: string;
  deltaText?: { text: string; tone: 'up' | 'down' | 'flat' } | null;
  children?: ReactNode;
}

function Metric({ label, symbol, badge, value, unit, muted, note, deltaText, children }: MetricProps) {
  return (
    <div className="metric">
      <div className="k">
        {label}
        {badge && <span className="lock">{badge}</span>}
      </div>
      {symbol && (
        <div className="sym" title={symbol}>
          {symbol}
        </div>
      )}
      {children ?? (
        <div className={`v${muted ? ' none' : ''}`}>
          {value}
          {unit && <span className="u">{unit}</span>}
        </div>
      )}
      {deltaText && <div className={`d ${deltaText.tone}`}>{deltaText.text}</div>}
      {note && <div className="note">{note}</div>}
    </div>
  );
}

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function PinIcon() {
  return (
    <svg {...ICON}>
      <path d="M5 2h6M6 2v4l-2.5 3h9L10 6V2M8 9v5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...ICON}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  );
}

function ExpandIcon({ open }: { open: boolean }) {
  return open ? (
    <svg {...ICON}>
      <path d="M13 3L9 7M9 7V4M9 7h3M3 13l4-4M7 9v3M7 9H4" />
    </svg>
  ) : (
    <svg {...ICON}>
      <path d="M9 3h4v4M13 3L8.5 7.5M7 13H3V9M3 13l4.5-4.5" />
    </svg>
  );
}

const LEVEL_W = 320;
const LEVEL_H = 96;
const LEVEL_PAD = 8;

function EnergyLevels({ result, baseline }: { result: DeviceResult; baseline: DeviceResult | null }) {
  const levels = result.levels_ghz;
  const baseLevels = baseline?.levels_ghz ?? [];
  // One scale for both ladders so the dashed baseline overlays honestly.
  const ys = ladderY([...levels, ...baseLevels], LEVEL_H, LEVEL_PAD);
  const y = ys.slice(0, levels.length);
  const by = ys.slice(levels.length);
  const x1 = 36;
  const x2 = LEVEL_W - 56;

  return (
    <svg
      className="ladder"
      viewBox={`0 0 ${LEVEL_W} ${LEVEL_H}`}
      role="img"
      aria-label="Energy levels relative to the ground state"
    >
      {by.map((value, index) => (
        <line
          key={`b-${index}`}
          x1={x1}
          x2={x2}
          y1={value}
          y2={value}
          stroke="var(--text-3)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      ))}
      {levels.map((value, index) => (
        <g key={index}>
          <text x="4" y={y[index] + 4} fontSize="12" fill="var(--text-2)">
            |{index}⟩
          </text>
          <line
            x1={x1}
            x2={x2}
            y1={y[index]}
            y2={y[index]}
            stroke={index === 1 ? 'var(--accent)' : 'var(--text-2)'}
            strokeWidth={index === 1 ? 2 : 1.2}
          />
          <text x={LEVEL_W} y={y[index] + 4} fontSize="12" textAnchor="end" fill="var(--text)">
            {num(value, 3)}
          </text>
        </g>
      ))}
    </svg>
  );
}

const CHART_W = 900;
const CHART_H = 120;

function ChargeResponse({ result, baseline }: { result: DeviceResult; baseline: DeviceResult | null }) {
  const points = result.charge_response;
  if (points.length === 0) return <p className="empty">The backend returned no charge-response points.</p>;

  // The dispersion is a few kHz on a ~5 GHz line: plot the shift, not the absolute.
  const reference = points.reduce((a, b) => (b.ng < a.ng ? b : a)).f01_ghz;
  const basePoints = baseline?.charge_response ?? [];
  const baseReference = basePoints.length
    ? basePoints.reduce((a, b) => (b.ng < a.ng ? b : a)).f01_ghz
    : null;
  const shiftKhz = (f01: number, ref: number) => (f01 - ref) * 1e6;

  const values = [
    ...points.map((p) => shiftKhz(p.f01_ghz, reference)),
    ...(baseReference === null ? [] : basePoints.map((p) => shiftKhz(p.f01_ghz, baseReference))),
  ];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span === 0 ? 1 : 0;
  const x = (ng: number) => 60 + ng * (CHART_W - 76);
  const y = (khz: number) => CHART_H - 24 - ((khz - lo + pad) / (span + 2 * pad)) * (CHART_H - 42);
  const path = (data: ChargePoint[], ref: number) =>
    data.map((p) => `${x(p.ng)},${y(shiftKhz(p.f01_ghz, ref))}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label="Transition frequency shift versus offset charge"
    >
      <line x1="60" x2={CHART_W - 16} y1={CHART_H - 24} y2={CHART_H - 24} stroke="var(--line-strong)" />
      <line x1="60" x2="60" y1="10" y2={CHART_H - 24} stroke="var(--line-strong)" />
      {baseReference !== null && (
        <polyline
          points={path(basePoints, baseReference)}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />
      )}
      <polyline points={path(points, reference)} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(result.ng)} cy={y(shiftKhz(result.f01_ghz, reference))} r="4" fill="var(--accent)" />
      <text x="60" y={CHART_H - 8} fontSize="11" fill="var(--text-3)">
        ng 0
      </text>
      <text x={CHART_W - 16} y={CHART_H - 8} fontSize="11" textAnchor="end" fill="var(--text-3)">
        1
      </text>
      <text x="54" y="14" fontSize="11" textAnchor="end" fill="var(--text-3)">
        {signed(hi, 3)}
      </text>
      <text x="54" y={CHART_H - 26} fontSize="11" textAnchor="end" fill="var(--text-3)">
        {signed(lo, 3)}
      </text>
    </svg>
  );
}

function TradeoffSlot({ design }: { design: DesignDock }) {
  const { run } = design;
  if (!run) {
    return (
      <div className="chart">
        <h4>Trade-off</h4>
        <p className="empty">Set requirements, then Find designs. Every evaluated candidate will appear here.</p>
      </div>
    );
  }
  const baselinePlot = design.baseline
    ? { params: design.baseline.params, assessment: design.assessment?.assessment ?? null }
    : null;
  return (
    <div className="chart">
      <h4>Trade-off</h4>
      <p className="cap">
        Each point is one EJ/EC ratio on the locked path at {num(run.request.target_ghz, 3)} GHz.
        {!design.fresh && ' Requirements changed since this search — Find designs to refresh.'}
      </p>
      <TradeoffPlot
        run={run}
        fresh={design.fresh}
        inspectedId={design.inspected?.candidate_id ?? null}
        recommendedId={design.recommendedId}
        appliedParams={design.appliedParams}
        baseline={baselinePlot}
        onInspect={design.onInspect}
      />
      {design.selectionExplanation && <p className="explain">{design.selectionExplanation}</p>}
      {run.status === 'infeasible' && !design.selectionExplanation && (
        <p className="explain">{INFEASIBLE_SENTENCE}</p>
      )}
      <details className="tech">
        <summary>Search range and settings</summary>
        <div className="body">
          <p style={{ margin: 0 }}>{searchRangeSummary(run.request)}</p>
          <p style={{ margin: '4px 0 0' }}>
            Selection rule: {run.selection_rule}. Optimality: {run.optimality_scope}. Dispersion reporting
            floor {num(run.dispersion_resolution_khz, 3)} kHz.
          </p>
        </div>
      </details>
    </div>
  );
}

export default function ResultsDock({
  mode,
  result,
  baseline,
  stale,
  error,
  canPin,
  expanded,
  onToggleExpanded,
  params,
  onChange,
  onPin,
  onClearBaseline,
  onRetry,
  design,
}: ResultsDockProps) {
  const dispersion = dispersionDisplay(result);
  const baselineDispersion = baseline ? dispersionDisplay(baseline) : null;
  const inDesign = mode === 'design' && design !== null;
  const locked = inDesign && design.inspected !== null;

  const headline = () => {
    if (locked && design.run) {
      const idx = (design.candidateIndex ?? 0) + 1;
      return `candidate ${idx}/${design.candidateCount} · for ${requirementsSummary(design.run.request)}`;
    }
    if (result) return `${paramSummary(result)} · EJ/EC ${num(result.ratio, 1)}`;
    return error ? 'no completed calculation' : 'waiting for first result';
  };

  return (
    <>
      <div className="dock-head">
        <span className="dock-title">Results</span>
        <span className="dock-sep" aria-hidden />
        <span className="dock-sub">Illustrative values</span>
        <details className="dock-context"><summary>Calculation details</summary><div className="dock-pop">{headline()}</div></details>
        <span className="spacer" />
        {baseline && !inDesign && (
          <span className="pill" title={paramSummary(baseline)}>
            baseline: {paramSummary(baseline)}
          </span>
        )}
        {baseline && (
          <button type="button" className="dock-act" onClick={onClearBaseline}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="dock-act"
          onClick={onPin}
          disabled={!canPin}
          title={canPin ? 'Freeze the current completed result for comparison' : 'Available once a calculation has completed'}
        >
          <PinIcon />
          Pin baseline
        </button>
        <details className="dock-solver">
          <summary className="dock-act">
            <GearIcon />
            Solver settings
          </summary>
          <div className="dock-pop">
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
        {inDesign && (
          <button
            type="button"
            className="btn primary"
            onClick={design.onApply}
            disabled={!design.canApply}
            title={
              design.canApply
                ? 'Copy this candidate’s EJ and EC into the working device'
                : 'Available for a qualifying candidate from a fresh search'
            }
          >
            Apply qualifying design
          </button>
        )}
        <button
          type="button"
          className="dock-act"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          title={expanded ? 'Hide the charts, keep the metrics' : 'Show the charts'}
        >
          <ExpandIcon open={expanded} />
          {expanded ? 'Collapse results' : 'Expand results'}
        </button>
      </div>

      {error && (
        <div className="errbox">
          <strong>No result.</strong> {error}
          <div style={{ marginTop: 7 }}>
            <button type="button" className="btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="dock-grid">
        <Metric
          label="Transition frequency"
          symbol="f01"
          badge={locked ? 'locked' : undefined}
          value={result ? num(result.f01_ghz, 3) : DASH}
          unit={result ? 'GHz' : undefined}
          muted={!result}
          deltaText={delta(result?.f01_ghz, baseline?.f01_ghz, 4, 'GHz')}
        />
        <Metric
          label="Transition-spacing difference A"
          symbol="A = f01 − f12"
          value={result ? signed(result.anharmonicity_mhz, 1) : DASH}
          unit={result ? 'MHz' : undefined}
          muted={!result}
          note={result ? `α = f12 − f01 = ${signed(result.alpha_mhz, 1)} MHz` : undefined}
          deltaText={delta(result?.anharmonicity_mhz, baseline?.anharmonicity_mhz, 1, 'MHz')}
        />
        <Metric
          label="Charge dispersion"
          symbol="Peak-to-peak variation · |f01(½) − f01(0)|"
          value={dispersion.resolved ? num(result?.dispersion_khz, 3) : dispersion.text}
          unit={dispersion.resolved ? 'kHz' : undefined}
          muted={!result || !dispersion.resolved}
          note={dispersion.note}
          deltaText={
            dispersion.resolved && baselineDispersion?.resolved
              ? delta(result?.dispersion_khz, baseline?.dispersion_khz, 3, 'kHz')
              : null
          }
        />
        <Metric label="Energy levels" symbol="Relative to ground · GHz">
          {result ? (
            <EnergyLevels result={result} baseline={baseline} />
          ) : (
            <div className="v none">
              {error ? 'No levels — the last calculation did not complete.' : 'Waiting for the calculation…'}
            </div>
          )}
        </Metric>
      </div>

      {expanded && (
        <div className={`dock-lower${inDesign ? ' design' : ''}`}>
          {inDesign ? (
            <>
              <TradeoffSlot design={design} />
              {design.baseline && (
                <DesignComparison
                  comparison={design.comparison}
                  baseline={design.baseline}
                  assessmentStatus={design.assessmentStatus}
                  assessment={design.assessment}
                  assessmentError={design.assessmentError}
                  onRetryAssessment={design.onRetryAssessment}
                />
              )}
            </>
          ) : (
            <div className="chart">
              <h4>Charge response</h4>
              <p className="cap">
                Shift of f01 in kHz from its own value at ng 0
                {result
                  ? ` (${num(result.charge_response[0]?.f01_ghz ?? Number.NaN, 6)} GHz, ${result.charge_response.length} solver points)`
                  : ''}
                . Dashed = pinned baseline, against its own ng 0.
              </p>
              {result ? (
                <ChargeResponse result={result} baseline={baseline} />
              ) : (
                <p className="empty">
                  {error ? 'No curve — nothing is interpolated locally.' : 'Waiting for the first calculation…'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {stale && result && (
        <p className="dock-stale">
          Updating — the values above still describe {result ? paramSummary(result) : 'the previous parameters'}.
        </p>
      )}
    </>
  );
}
