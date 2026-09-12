'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AskLlm from '@/components/AskLlm';
import Inspector from '@/components/Inspector';
import PartsTree from '@/components/PartsTree';
import ResultsDock from '@/components/ResultsDock';
import Schematic from '@/components/Schematic';
import type { ViewportHandle } from '@/components/Viewport3D';
import { topicFromPart, type TopicId } from '@/lib/explain-topics';
import { buildChipSnapshot } from '@/lib/insight-snapshot';
import { DEFAULT_PARAMS, clampParam, sameParams } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import { PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import { useEvaluate } from '@/lib/useEvaluate';
import { useExplain } from '@/lib/useExplain';
import type { DesignGoals, DeviceParams, DeviceResult } from '@/lib/types';
import { materialColor, materialPartColors } from '@/lib/material-colors';
import type { MaterialAppearance } from '@/lib/material-colors';

const Viewport3D = dynamic(() => import('@/components/Viewport3D'), {
  ssr: false,
  loading: () => <p className="viewport-note">Starting 3D view…</p>,
});

type ViewMode = '3d' | 'schematic' | 'split';

const DEFAULT_GOALS: DesignGoals = {
  target_ghz: 5,
  tolerance_ghz: 0.25,
  min_anharmonicity_mhz: 200,
  max_dispersion_khz: 10,
};

const PRESETS: Record<string, DeviceParams> = {
  default: DEFAULT_PARAMS,
  reference: { ej_ghz: 30, ec_ghz: 1.2, ng: 0.3, ncut: 31 },
  protected: { ej_ghz: 18, ec_ghz: 0.22, ng: 0, ncut: 30 },
  anharmonic: { ej_ghz: 10, ec_ghz: 0.4, ng: 0, ncut: 30 },
};

export default function Page() {
  const [params, setParams] = useState<DeviceParams>(DEFAULT_PARAMS);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [hiddenParts, setHiddenParts] = useState<PartId[]>([]);
  const [view, setView] = useState<ViewMode>('3d');
  const [explode, setExplode] = useState(0);
  const [baseline, setBaseline] = useState<DeviceResult | null>(null);
  const [hintOpen, setHintOpen] = useState(true);
  const [goals, setGoals] = useState<DesignGoals>(DEFAULT_GOALS);
  const [materials, setMaterials] = useState<MaterialAppearance>({
    topMaterial: 'Al',
    baseMaterial: 'Si',
    topColor: materialColor('Al'),
    baseColor: materialColor('Si'),
  });

  // AI feature state
  const [selectedTopics, setSelectedTopics] = useState<Set<TopicId>>(new Set());
  const [llmOpen, setLlmOpen] = useState(false);

  const viewportRef = useRef<ViewportHandle | null>(null);

  const evaluation = useEvaluate(params);
  const { result, error, stale, status, retry } = evaluation;

  // Build a compact snapshot for the LLM
  const snapshot = useMemo(
    () =>
      buildChipSnapshot({
        params,
        result,
        baseline,
        selected,
        stale,
        error,
      }),
    [params, result, baseline, selected, stale, error],
  );

  const topicsArray = useMemo(() => Array.from(selectedTopics), [selectedTopics]);
  const explain = useExplain(snapshot, topicsArray);

  const changeParam = useCallback((key: ParamKey, value: number) => {
    setParams((current) => ({ ...current, [key]: clampParam(key, value) }));
  }, []);

  const applyMaterialScenario = useCallback((ejGhz: number, ecGhz: number) => {
    setParams((current) => ({
      ...current,
      ej_ghz: clampParam('ej_ghz', ejGhz),
      ec_ghz: clampParam('ec_ghz', ecGhz),
    }));
  }, []);

  const changeMaterials = useCallback((topMaterial: string, baseMaterial: string) => {
    setMaterials({
      topMaterial,
      baseMaterial,
      topColor: materialColor(topMaterial),
      baseColor: materialColor(baseMaterial),
    });
  }, []);

  const currentMaterialColors = materialPartColors(materials);

  const onSelectTopic = useCallback((id: TopicId) => {
    setSelectedTopics((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearTopics = useCallback(() => {
    setSelectedTopics(new Set());
  }, []);

  const triggerAskLlm = useCallback(() => {
    if (selectedTopics.size === 0) return;
    setLlmOpen(true);
  }, [selectedTopics.size]);

  const selectPart = useCallback((id: PartId) => {
    setSelected(id);
    // Auto-add the part's associated topic to the selection
    const next = topicFromPart(id);
    if (next) {
      setSelectedTopics((current) => new Set(current).add(next));
    }
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

  const show3d = view === '3d' || view === 'split';
  const showSchematic = view === 'schematic' || view === 'split';
  // Pinning is only meaningful for a completed calculation of the current parameters.
  const canPin = status === 'ready' && !stale && result !== null;
  const atDefaults = sameParams(params, DEFAULT_PARAMS);

  const statusBadge = error
    ? { className: 'badge err', text: 'Disconnected' }
    : stale
      ? { className: 'badge stale', text: 'Updating…' }
      : status === 'ready'
        ? { className: 'badge live', text: 'Live result' }
        : { className: 'badge', text: 'Calculating…' };

  const exportReport = () => {
    const report = {
      exported_at: new Date().toISOString(),
      application: 'Qubit Studio',
      parameters: params,
      design_goals: goals,
      result,
      pinned_baseline: baseline,
      disclaimer: 'Simplified isolated-transmon calculation; not a fabricated-device prediction.',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qubit-studio-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Qubit Studio <span>transmon · simplified model</span>
        </div>
        <span className="spacer" />
        <span className={statusBadge.className}>{statusBadge.text}</span>
        <label className="preset-control">
          Demo
          <select defaultValue="" onChange={(event) => {
            if (event.target.value) setParams(PRESETS[event.target.value]);
            event.target.value = '';
          }}>
            <option value="" disabled>Choose preset…</option>
            <option value="default">Balanced default</option>
            <option value="reference">scqubits reference</option>
            <option value="protected">Low charge sensitivity</option>
            <option value="anharmonic">High anharmonicity</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={exportReport} disabled={!result}>Export report</button>
        <button
          type="button"
          className="btn"
          onClick={() => setParams(DEFAULT_PARAMS)}
          disabled={atDefaults}
          title="Return EJ, EC, ng and ncut to the model defaults"
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
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
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
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {selected ? `Selected: ${PART_BY_ID[selected].name}` : 'Nothing selected'}
          </span>
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
              materialColors={currentMaterialColors}
            />
            <div className="material-legend" aria-label="Current visual materials">
              <span><i style={{ background: materials.topColor }} /> Metal · {materials.topMaterial}</span>
              <span><i style={{ background: materials.baseColor }} /> Base · {materials.baseMaterial}</span>
            </div>
            <span className="viewport-note">Drag to orbit · right-drag to pan · scroll to zoom</span>
          </div>
          {view === 'split' && <div className="split-divider" />}
          <div className="schematic" style={{ display: showSchematic ? 'flex' : 'none' }}>
            <Schematic
              params={params}
              selected={selected}
              hiddenParts={hiddenParts}
              onSelect={selectPart}
              onClearSelection={clearSelection}
              materialColors={currentMaterialColors}
            />
          </div>
        </div>
      </main>

      <aside className="pane pane-inspector">
        <Inspector
          selected={selected}
          params={params}
          result={result}
          onSelect={selectPart}
          onChange={changeParam}
          onApplyMaterialScenario={applyMaterialScenario}
          goals={goals}
          onGoalsChange={setGoals}
          onMaterialsChange={changeMaterials}
          materials={materials}
          selectedTopics={selectedTopics}
          onSelectTopic={onSelectTopic}
          onClearTopics={clearTopics}
          onAskLlm={triggerAskLlm}
        />
      </aside>

      <section className="pane pane-dock">
        <ResultsDock
          result={result}
          baseline={baseline}
          stale={stale}
          error={error}
          canPin={canPin}
          onPin={() => result && setBaseline(result)}
          onClearBaseline={() => setBaseline(null)}
          onRetry={retry}
          goals={goals}
          selectedTopics={selectedTopics}
          onSelectTopic={onSelectTopic}
        />
      </section>

      {/* AI explanation dialog */}
      <AskLlm
        open={llmOpen}
        onOpenChange={setLlmOpen}
        topics={topicsArray}
        snapshot={snapshot}
        explain={explain}
      />
    </div>
  );
}
