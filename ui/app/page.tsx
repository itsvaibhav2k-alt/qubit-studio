'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Inspector from '@/components/Inspector';
import PartsTree from '@/components/PartsTree';
import RequirementsPanel from '@/components/RequirementsPanel';
import ResultsDock from '@/components/ResultsDock';
import type { DesignDock, WorkMode } from '@/components/ResultsDock';
import Schematic from '@/components/Schematic';
import type { ViewportHandle } from '@/components/Viewport3D';
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
  loading: () => <p className="viewport-note">Starting 3D view…</p>,
});

type ViewMode = '3d' | 'schematic' | 'split';

export default function Page() {
  // The working device. Only Explore edits and "Apply qualifying design" change it.
  const [applied, setApplied] = useState<AppliedDevice>({ params: DEFAULT_PARAMS, source: null });
  const design = useDesignSearch({ applied, onApply: setApplied });
  const mode: WorkMode = design.mode;
  const inDesign = mode === 'design';
  const params = applied.params;

  const [selected, setSelected] = useState<PartId | null>(null);
  const [hiddenParts, setHiddenParts] = useState<PartId[]>([]);
  const [view, setView] = useState<ViewMode>('3d');
  const [explode, setExplode] = useState(0);
  const [hintOpen, setHintOpen] = useState(true);
  const viewportRef = useRef<ViewportHandle | null>(null);

  // One evaluate stream: the working device in Explore, the inspected candidate in Design.
  const evaluation = useEvaluate(design.displayParams);
  const guarded = design.getDisplayEvaluation(evaluation);
  // Explore keeps the previous numbers on screen while a newer edit is in flight (labelled
  // Updating). Design never shows one candidate's numbers under another candidate's name.
  const exploreMatches = evaluation.result !== null && sameDeviceParams(evaluation.result, params);
  const shown = inDesign
    ? guarded
    : {
        result: evaluation.result,
        status: evaluation.status,
        // A result for other parameters (e.g. the candidate just inspected in Design) is stale
        // until the working device's own evaluation lands; the dock header names its params.
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

  const selectPart = useCallback((id: PartId) => {
    setSelected(id);
    setHintOpen(false);
  }, []);

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

  // Candidates in ratio order: the search variable, not incidental array order.
  const candidates = useMemo(
    () => (design.lastRun ? [...design.lastRun.candidates].sort((a, b) => a.ratio - b.ratio) : []),
    [design.lastRun],
  );
  const inspected = design.inspectedCandidate;
  const candidateIndex = inspected
    ? candidates.findIndex((c) => c.candidate_id === inspected.candidate_id)
    : -1;
  const locked = inDesign && inspected !== null;

  const show3d = view === '3d' || view === 'split';
  const showSchematic = view === 'schematic' || view === 'split';
  const atDefaults = sameParams(params, DEFAULT_PARAMS);

  const statusBadge = error
    ? { className: 'badge err', text: 'Disconnected' }
    : stale
      ? { className: 'badge stale', text: 'Updating…' }
      : status === 'ready'
        ? { className: 'badge live', text: 'Live result' }
        : { className: 'badge', text: 'Calculating…' };

  const stageLabel = inDesign
    ? locked && design.lastRun
      ? `Inspecting candidate ${candidateIndex + 1}/${candidates.length} · f01 locked at ${num(design.lastRun.request.target_ghz, 3)} GHz`
      : design.lastRun
        ? 'Working design — pick a candidate on the plot to inspect it'
        : 'Working design — no candidates generated yet'
    : selected
      ? `Selected: ${PART_BY_ID[selected].name}`
      : 'Nothing selected';

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
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Qubit Studio <span>transmon · simplified model</span>
        </div>
        <div className="seg" role="group" aria-label="Work mode">
          <button type="button" aria-pressed={!inDesign} onClick={design.exitDesign}>
            Explore
          </button>
          <button type="button" aria-pressed={inDesign} onClick={design.enterDesign}>
            Design
          </button>
        </div>
        <span className="spacer" />
        <span className={statusBadge.className}>{statusBadge.text}</span>
        <button
          type="button"
          className="btn"
          onClick={() => setApplied({ params: DEFAULT_PARAMS, source: null })}
          disabled={atDefaults || inDesign}
          title={
            inDesign
              ? 'Switch to Explore to reset the working device; Design only changes it through Apply'
              : 'Return EJ, EC, ng and ncut of the working device to the model defaults'
          }
        >
          Reset parameters
        </button>
      </header>

      <aside className="pane pane-tree">
        <div className="panel-head">Parts</div>
        {hintOpen && (
          <div className="hint">
            <span>
              Select the <strong>Josephson junction</strong>, then drag its tunnelling strength. Every number
              below is recalculated by the solver.
              <br />
              <button type="button" onClick={() => selectPart('junction')}>
                Select it for me
              </button>
            </span>
            <button type="button" aria-label="Dismiss hint" onClick={() => setHintOpen(false)}>
              ✕
            </button>
          </div>
        )}
        <PartsTree
          selected={selected}
          hiddenParts={hiddenParts}
          onSelect={selectPart}
          onToggleVisible={toggleVisible}
        />
      </aside>

      <main className="pane pane-stage">
        <div className="stage-toolbar">
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
          <button
            type="button"
            className="btn"
            onClick={() => viewportRef.current?.resetView()}
            disabled={!show3d}
            title="Return the camera to its starting position"
          >
            Reset view
          </button>
          <label className="scrub" title="Separates the parts for inspection. Does not change any calculated value.">
            Assembly
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explode}
              disabled={!show3d}
              aria-label="Assembled to exploded"
              onChange={(event) => setExplode(Number(event.target.value))}
            />
            {explode === 0 ? 'assembled' : 'exploded (view only)'}
          </label>
          <span className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{stageLabel}</span>
        </div>

        <div className="stage-body">
          <div className="viewport" style={{ display: show3d ? 'flex' : 'none' }}>
            <div className="badge-row">
              {selected && <span className="badge live">{PART_BY_ID[selected].name}</span>}
            </div>
            <Viewport3D
              selected={selected}
              hiddenParts={hiddenParts}
              explode={explode}
              onSelect={selectPart}
              onClearSelection={clearSelection}
              handleRef={viewportRef}
            />
            <span className="viewport-note">Drag to orbit · right-drag to pan · scroll to zoom</span>
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
      </main>

      <aside className="pane pane-inspector">
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
          onSelect={selectPart}
          onChange={changeParam}
        />
      </aside>

      <section className="pane pane-dock">
        <ResultsDock
          mode={mode}
          result={result}
          baseline={design.baseline?.result ?? null}
          stale={stale}
          error={error}
          canPin={shown.canPin}
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
