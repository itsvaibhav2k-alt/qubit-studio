'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Connector from '@/components/Connector';
import Inspector from '@/components/Inspector';
import PartsTree from '@/components/PartsTree';
import RequirementsPanel from '@/components/RequirementsPanel';
import ResultsDock from '@/components/ResultsDock';
import type { DesignDock, WorkMode } from '@/components/ResultsDock';
import Schematic from '@/components/Schematic';
import type { ViewportHandle } from '@/components/Viewport3D';
import { freeRegion } from '@/lib/camera-fit';
import type { Rect } from '@/lib/camera-fit';
import type { Projected } from '@/lib/connector';
import { statusLabel } from '@/lib/evaluate-state';
import { num } from '@/lib/format';
import { DEFAULT_PARAMS, clampParam, sameParams } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import { sameDeviceParams } from '@/lib/search-baseline';
import type { AppliedDevice } from '@/lib/search-types';
import { useDesignSearch } from '@/lib/useDesignSearch';
import { useEvaluate } from '@/lib/useEvaluate';

const Viewport3D = dynamic(() => import('@/components/Viewport3D'), {
  ssr: false,
  loading: () => <p className="viewport-loading">Starting 3D view…</p>,
});

type ViewMode = '3d' | 'schematic' | 'split';

const sameRect = (a: Rect | null, b: Rect) =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function BrandMark() {
  return (
    <svg viewBox="0 0 28 24" fill="none" aria-hidden="true">
      <path d="M2 9l6-3 6 3v7l-6 3-6-3z" fill="#1b2027" />
      <path d="M8 6v10M2 9l6 3 6-3" stroke="#f2f3f5" strokeWidth="1.2" />
      <path d="M15 4h11v11h-3V7h-8z" fill="#8a929d" />
      <path d="M11 17h11v4H11z" fill="#c3c9d1" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 11v8M13 7.5v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 9a5.5 5.5 0 1 0 1.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 3.5v3.2h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AxisTriad() {
  return (
    <svg className="triad" viewBox="0 0 70 62" fill="none" aria-hidden="true">
      <path d="M35 34V8M35 34L12 48M35 34l23 14" stroke="currentColor" strokeWidth="1.3" />
      <text x="31" y="7" fontSize="11" fill="currentColor">z</text>
      <text x="3" y="55" fontSize="11" fill="currentColor">x</text>
      <text x="61" y="55" fontSize="11" fill="currentColor">y</text>
    </svg>
  );
}

export default function Page() {
  // The working device. Only Explore edits and "Apply qualifying design" change it.
  const [applied, setApplied] = useState<AppliedDevice>({ params: DEFAULT_PARAMS, source: null });
  const design = useDesignSearch({ applied, onApply: setApplied });
  const mode: WorkMode = design.mode;
  const inDesign = mode === 'design';
  const params = applied.params;

  const [selected, setSelected] = useState<PartId | null>('junction');
  const [hiddenParts, setHiddenParts] = useState<PartId[]>([]);
  const [view, setView] = useState<ViewMode>('3d');
  const [exploded, setExploded] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [region, setRegion] = useState<Rect | null>(null);
  const viewportRef = useRef<ViewportHandle | null>(null);
  const anchorRef = useRef<Projected | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const badgeRef = useRef<HTMLElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // One evaluate stream: the working device in Explore, the inspected candidate in Design.
  const evaluation = useEvaluate(design.displayParams);
  const guarded = design.getDisplayEvaluation(evaluation);
  const exploreMatches = evaluation.result !== null && sameDeviceParams(evaluation.result, params);
  const shown = inDesign
    ? guarded
    : {
        result: evaluation.result,
        status: evaluation.status,
        stale: evaluation.stale || (evaluation.result !== null && !exploreMatches),
        error: evaluation.error,
        canPin: evaluation.status === 'ready' && !evaluation.stale && exploreMatches,
        canApply: false,
      };
  const { result, error, stale, status } = shown;

  const changeParam = useCallback((key: ParamKey, value: number) => {
    setApplied((current) => ({
      ...current,
      params: { ...current.params, [key]: clampParam(key, value) },
    }));
  }, []);

  const selectPart = useCallback((id: PartId) => setSelected(id), []);
  const clearSelection = useCallback(() => setSelected(null), []);
  const toggleVisible = useCallback((id: PartId) => {
    setHiddenParts((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const show3d = view === '3d' || view === 'split';
  const showSchematic = view === 'schematic' || view === 'split';
  const cardOpen = inDesign || selected !== null;
  const atDefaults = sameParams(params, DEFAULT_PARAMS);

  // Free region of the canvas: everything the floating chrome does not cover.
  const measure = useCallback(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const v = wrap.getBoundingClientRect();
    if (v.width < 2 || v.height < 2) return;
    const rel = (el: HTMLElement | null): Rect | null => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.left - v.left, y: r.top - v.top, width: r.width, height: r.height };
    };
    // The view-control row is a full-width band; the components list trims the left edge.
    const controls = rel(topRef.current);
    const list = rel(listRef.current);
    const band = controls ? { x: 0, y: 0, width: v.width, height: Math.max(controls.y + controls.height,
      view === 'split' && list ? list.y + Math.min(list.height, 84) : 0) } : null;
    const overlays = [band, view === 'split' ? null : list, view === 'split' ? rel(bottomRef.current) : null, rel(cardRef.current)].filter(
      (r): r is Rect => r !== null,
    );
    const next = freeRegion({ x: 0, y: 0, width: v.width, height: v.height }, overlays);
    // The corner captions sit outside the diamond silhouette; leave a small lower margin
    // instead of reserving their full width across the centre of the hardware.
    next.height = Math.max(0, next.height - 16);
    setRegion((prev) => (sameRect(prev, next) ? prev : next));
  }, [view]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(() => measure());
    [stageRef.current, cardRef.current, topRef.current, listRef.current, bottomRef.current, canvasWrapRef.current].forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [measure, cardOpen, view, inDesign, resultsExpanded]);

  // Candidates in ratio order: the search variable, not incidental array order.
  const candidates = useMemo(
    () => (design.lastRun ? [...design.lastRun.candidates].sort((a, b) => a.ratio - b.ratio) : []),
    [design.lastRun],
  );
  const inspected = design.inspectedCandidate;
  const candidateIndex = inspected ? candidates.findIndex((c) => c.candidate_id === inspected.candidate_id) : -1;
  const locked = inDesign && inspected !== null;

  // Before the first result there is nothing stale to describe; that is 'Calculating…'.
  const pill = statusLabel(status, stale && result !== null, error);

  const crumb = inDesign
    ? locked && design.lastRun
      ? `Inspecting candidate ${candidateIndex + 1}/${candidates.length} · f01 locked at ${num(design.lastRun.request.target_ghz, 3)} GHz`
      : design.lastRun
        ? 'Working design — pick a candidate on the plot to inspect it'
        : 'Working design — no candidates generated yet'
    : null;

  const designDock: DesignDock | null = inDesign
    ? {
        run: design.lastRun,
        fresh: design.candidateResultsFresh,
        inspected,
        candidateIndex: candidateIndex >= 0 ? candidateIndex : null,
        candidateCount: candidates.length,
        recommendedId: design.recommendedCandidate?.candidate_id ?? null,
        appliedParams: params,
        baseline: design.baseline,
        assessmentStatus: design.baselineAssessmentStatus,
        assessment: design.baselineAssessment,
        assessmentError: design.baselineAssessmentError,
        comparison: design.comparison,
        selectionExplanation: design.selectionExplanation,
        canApply: shown.canApply,
        onInspect: design.inspectCandidate,
        onApply: () => {
          design.applyInspected(evaluation);
        },
        onRetryAssessment: design.retryBaselineAssessment,
      }
    : null;

  return (
    <div className={`shell ${inDesign ? 'design-mode' : 'explore-mode'} view-${view} ${view === 'split' ? 'split-mode' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          Qubit Studio
        </div>
        <nav className="modes" role="group" aria-label="Work mode">
          <button type="button" aria-pressed={!inDesign} onClick={design.exitDesign}>
            Explore
          </button>
          <button
            type="button"
            aria-pressed={inDesign}
            onClick={() => {
              // The trade-off plot and comparison live in the expanded results: open them on entry.
              design.enterDesign();
              setResultsExpanded(true);
            }}
          >
            Design
          </button>
        </nav>
        <div className={`crumb${crumb ? ' info' : ''}`} aria-live="polite">
          {crumb ?? (
            <>
              Transmon <b>/</b> {selected ? PART_BY_ID[selected].number : '—'}
            </>
          )}
        </div>
        <span className="spacer" />
        <span className={`badge ${pill.className}`} title={pill.title}>
          <i className="dot" />
          {pill.text}
        </span>
        <details className="help">
          <summary aria-label="About this model">?</summary>
          <div className="pop">
            <p>
              <strong>Simplified transmon model.</strong> Every number is recalculated by the solver from EJ, EC,
              ng and the charge-basis cutoff. Nothing here predicts a fabricated device, and nothing is connected
              to hardware.
            </p>
            <p>Geometry and materials in the 3D view are illustrative and are not inputs to the calculation.</p>
            <p>Drag to orbit · Shift-drag to pan · Scroll to zoom · Esc clears the selection.</p>
          </div>
        </details>
      </header>

      <main className="stage" ref={stageRef}>
        <div className="ov ov-top">
          <div className="ov-left" ref={listRef}>
            <PartsTree
              compact={view === 'split'}
              selected={selected}
              hiddenParts={hiddenParts}
              onSelect={selectPart}
              onToggleVisible={toggleVisible}
            />
          </div>
          <div className="ov-view" ref={topRef}>
            <div className="seg" role="group" aria-label="View mode">
              {(
                [
                  ['3d', '3D'],
                  ['schematic', 'Schematic'],
                  ['split', 'Split'],
                ] as Array<[ViewMode, string]>
              ).map(([m, label]) => (
                <button key={m} type="button" aria-pressed={view === m} onClick={() => setView(m)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="ov-asm">
            <div className="seg" role="group" aria-label="Assembly state" title="Separates the parts for inspection. Does not change any calculated value.">
              <button type="button" aria-pressed={!exploded} disabled={!show3d} onClick={() => setExploded(false)}>
                Assembled
              </button>
              <button type="button" aria-pressed={exploded} disabled={!show3d} onClick={() => setExploded(true)}>
                Exploded
              </button>
            </div>
            <button
              type="button"
              className="link"
              onClick={() => viewportRef.current?.resetView()}
              disabled={!show3d}
              title="Return the camera to its starting position"
            >
              <ResetIcon />
              Reset view
            </button>
          </div>
        </div>

        <div className="stage-body">
          <div className="viewport" ref={canvasWrapRef} style={{ display: show3d ? 'block' : 'none' }}>
            <Viewport3D
              selected={selected}
              hiddenParts={hiddenParts}
              explode={exploded ? 1 : 0}
              region={region}
              onSelect={selectPart}
              active={show3d}
              onClearSelection={clearSelection}
              handleRef={viewportRef}
              anchorRef={anchorRef}
              wrapperRef={canvasWrapRef}
            />
          </div>
          {view === 'split' && <div className="split-divider" />}
          <div className="schematic" style={{ display: showSchematic ? 'flex' : 'none' }}>
            <Schematic
              params={design.displayParams}
              locked={locked}
              selected={selected}
              hiddenParts={hiddenParts}
              onSelect={selectPart}
              onClearSelection={clearSelection}
            />
          </div>
        </div>

        <div className="ov ov-bottom" ref={bottomRef}>
          <div className="ov-note">
            <InfoIcon />
            <div>
              <b>Illustrative simplified model.</b>
              <span>Geometry and materials are not fabrication-calibrated.</span>
            </div>
          </div>
          <div className="ov-hint">
            <AxisTriad />
            <span className="sep" />
            <span>Drag to orbit · Shift-drag to pan · Scroll to zoom</span>
          </div>
        </div>

        <Connector
          anchorRef={anchorRef}
          stageRef={stageRef}
          canvasRef={canvasWrapRef}
          badgeRef={badgeRef}
          active={show3d && cardOpen && selected !== null && !hiddenParts.includes(selected)}
        />

        <aside className="card" ref={cardRef} hidden={!cardOpen} aria-label="Inspector">
          {inDesign && (
            <RequirementsPanel
              draft={design.draft}
              status={design.status}
              fresh={design.candidateResultsFresh}
              error={design.error}
              fieldErrors={design.fieldErrors}
              lastRun={design.lastRun}
              onChange={design.setRequirements}
              onSearch={() => {
                void design.search();
              }}
            />
          )}
          <Inspector
            selected={selected}
            params={design.displayParams}
            result={result}
            mode={mode}
            locked={locked}
            designPath={
              locked && candidates.length > 0
                ? {
                    index: Math.max(0, candidateIndex),
                    count: candidates.length,
                    onStep: (index) => design.inspectCandidate(candidates[index].candidate_id),
                  }
                : null
            }
            badgeRef={badgeRef}
            atDefaults={atDefaults}
            onSelect={selectPart}
            onChange={changeParam}
            onClose={clearSelection}
            onResetAll={() => setApplied({ params: DEFAULT_PARAMS, source: null })}
          />
        </aside>
      </main>

      <section className="dock">
        <ResultsDock
          mode={mode}
          result={result}
          baseline={design.baseline?.result ?? null}
          stale={stale}
          error={error}
          canPin={shown.canPin}
          expanded={resultsExpanded}
          onToggleExpanded={() => setResultsExpanded((open) => !open)}
          params={params}
          onChange={changeParam}
          onPin={() => {
            design.pinBaseline(evaluation);
          }}
          onClearBaseline={design.clearBaseline}
          onRetry={evaluation.retry}
          design={designDock}
        />
      </section>
    </div>
  );
}
