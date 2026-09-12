'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AskLlm from '@/components/AskLlm';
import GuidedTour from '@/components/GuidedTour';
import Inspector from '@/components/Inspector';
import PartsTree from '@/components/PartsTree';
import ResultsDock from '@/components/ResultsDock';
import RichMathText from '@/components/RichMathText';
import Schematic from '@/components/Schematic';
import type { ViewportHandle } from '@/components/Viewport3D';
import { createDesignShareUrl, parseDesignShareUrl } from '@/lib/design-link';
import { num } from '@/lib/format';
import { topicFromPart, type TopicId } from '@/lib/explain-topics';
import { TOUR_STEPS, type InspectorTab } from '@/lib/guided-tour';
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

interface DesignSnapshot {
  id: string;
  savedAt: string;
  params: DeviceParams;
  goals: DesignGoals;
  topMaterial: string;
  baseMaterial: string;
}

const HISTORY_KEY = 'qubit-studio-saved-designs-v2';

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

  const [focusTopic, setFocusTopic] = useState<TopicId | null>(null);
  const [mylaOpen, setMylaOpen] = useState(false);
  const [mylaAnchor, setMylaAnchor] = useState({ x: 24, y: 72 });
  const lastClick = useRef({ x: 24, y: 72 });
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [guidedIndex, setGuidedIndex] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('edit');
  const [history, setHistory] = useState<DesignSnapshot[]>([]);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

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
        context: {
          top_material: materials.topMaterial,
          base_material: materials.baseMaterial,
          explode,
          target_ghz: goals.target_ghz,
          min_anharmonicity_mhz: goals.min_anharmonicity_mhz,
          max_dispersion_khz: goals.max_dispersion_khz,
        },
      }),
    [params, result, baseline, selected, stale, error, materials, explode, goals],
  );

  const explain = useExplain(snapshot, focusTopic);

  const changeParam = useCallback((key: ParamKey, value: number) => {
    setParams((current) => ({ ...current, [key]: clampParam(key, value) }));
  }, []);

  const saveCurrentDesign = useCallback(() => {
    const item: DesignSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: new Date().toISOString(),
      params,
      goals,
      topMaterial: materials.topMaterial,
      baseMaterial: materials.baseMaterial,
    };
    setHistory((current) => {
      const signature = JSON.stringify({ ...item, id: '', savedAt: '' });
      const next = [
        item,
        ...current.filter((entry) => JSON.stringify({ ...entry, id: '', savedAt: '' }) !== signature),
      ].slice(0, 10);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
    setShareStatus('Design saved');
    window.setTimeout(() => setShareStatus(null), 2000);
  }, [goals, materials.baseMaterial, materials.topMaterial, params]);

  const restoreSnapshot = useCallback((item: DesignSnapshot) => {
    setParams(item.params);
    setGoals(item.goals);
    setMaterials({
      topMaterial: item.topMaterial,
      baseMaterial: item.baseMaterial,
      topColor: materialColor(item.topMaterial),
      baseColor: materialColor(item.baseMaterial),
    });
    setShareStatus('Saved design restored');
    window.setTimeout(() => setShareStatus(null), 2000);
  }, []);

  const restoreLatestDesign = useCallback(() => {
    if (history[0]) restoreSnapshot(history[0]);
  }, [history, restoreSnapshot]);

  const copyShareLink = useCallback(async () => {
    const url = createDesignShareUrl({
      params,
      goals,
      topMaterial: materials.topMaterial,
      baseMaterial: materials.baseMaterial,
    }, window.location.href);
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Link added to address bar');
    }
    window.setTimeout(() => setShareStatus(null), 2500);
  }, [goals, materials.baseMaterial, materials.topMaterial, params]);

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

  useEffect(() => {
    const track = (event: PointerEvent) => {
      lastClick.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointerdown', track, true);
    return () => window.removeEventListener('pointerdown', track, true);
  }, []);

  const askAbout = useCallback((id: TopicId) => {
    if (guidedOpen) return;
    setFocusTopic(id);
    setMylaAnchor(lastClick.current);
    setMylaOpen(true);
    setHintOpen(false);
  }, [guidedOpen]);

  const selectPart = useCallback((id: PartId) => {
    setSelected(id);
    const next = topicFromPart(id);
    if (next && !guidedOpen) askAbout(next);
    else setHintOpen(false);
  }, [askAbout, guidedOpen]);

  const startTour = useCallback(() => {
    setMylaOpen(false);
    setHintOpen(false);
    setGuidedIndex(0);
    setGuidedOpen(true);
  }, []);

  const stopTour = useCallback(() => {
    setGuidedOpen(false);
    setGuidedIndex(0);
  }, []);

  useEffect(() => {
    if (!guidedOpen) return;
    const step = TOUR_STEPS[guidedIndex];
    if (!step) return;
    if (step.tab) setInspectorTab(step.tab);
    if (step.view) setView(step.view);
    if (step.part !== undefined) setSelected(step.part);
  }, [guidedOpen, guidedIndex]);

  const clearSelection = useCallback(() => setSelected(null), []);

  const toggleVisible = useCallback((id: PartId) => {
    setHiddenParts((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(HISTORY_KEY);
        if (stored) setHistory((JSON.parse(stored) as DesignSnapshot[]).slice(0, 10));
      } catch {
        window.localStorage.removeItem(HISTORY_KEY);
      }
      const shared = parseDesignShareUrl(window.location.href);
      if (shared) {
        setParams(shared.params);
        setGoals(shared.goals);
        setMaterials({
          topMaterial: shared.topMaterial,
          baseMaterial: shared.baseMaterial,
          topColor: materialColor(shared.topMaterial),
          baseColor: materialColor(shared.baseMaterial),
        });
        setShareStatus('Shared design loaded');
        window.setTimeout(() => setShareStatus(null), 2500);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (guidedOpen) {
          setGuidedOpen(false);
          return;
        }
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guidedOpen]);

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
        <button type="button" className="brand myla-hit" data-tour="brand" onClick={() => askAbout('model')}>
          Qubit Studio <span>transmon · click anything for Myla</span>
        </button>
        <span className="spacer" />
        <span className={statusBadge.className} data-tour="status">{statusBadge.text}</span>
        <button
          type="button"
          className={`btn${guidedOpen ? ' primary' : ''}`}
          onClick={guidedOpen ? stopTour : startTour}
        >
          {guidedOpen ? 'Exit tour' : 'Guided learning'}
        </button>
        {shareStatus && <span className="share-status">{shareStatus}</span>}
        <button type="button" className="btn" data-tour="share-link" onClick={copyShareLink}>Copy link</button>
        <button type="button" className="btn primary" data-tour="save-design" onClick={saveCurrentDesign}>Save</button>
        <button type="button" className="btn" data-tour="restore-latest" onClick={restoreLatestDesign} disabled={history.length === 0}>Restore</button>
        <details className="history-menu" data-tour="history">
          <summary>Saved ({history.length})</summary>
          <div className="history-popover">
            <strong>Saved designs</strong>
            {history.length === 0 ? <p>Save a design to keep it here.</p> : history.map((item) => (
              <button key={item.id} type="button" onClick={() => restoreSnapshot(item)}>
                <span><RichMathText>{`f01 ${num(item.goals.target_ghz, 1)} GHz · EJ ${num(item.params.ej_ghz, 2)} GHz · EC ${num(item.params.ec_ghz, 3)} GHz`}</RichMathText></span>
                <small>{item.topMaterial} + {item.baseMaterial} · {new Date(item.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
              </button>
            ))}
          </div>
        </details>
        <label className="preset-control" data-tour="presets">
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
        <button type="button" className="btn" data-tour="export" onClick={exportReport} disabled={!result}>Export report</button>
        <button
          type="button"
          className="btn"
          data-tour="reset-params"
          onClick={() => setParams(DEFAULT_PARAMS)}
          disabled={atDefaults}
          title="Return E_J, E_C, n_g and ncut to the model defaults"
        >
          Reset parameters
        </button>
      </header>

      <aside className="pane pane-tree">
        <div className="panel-head">Parts</div>
        {hintOpen && (
          <div className="hint">
            <span>
              Click anything on the chip or results — <strong>Myla</strong> will explain it.
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
                data-tour={`view-${mode}`}
                onClick={() => setView(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            data-tour="reset-view"
            onClick={() => viewportRef.current?.resetView()}
            disabled={!show3d}
            title="Return the camera to its starting position"
          >
            Reset view
          </button>
          <label className="scrub" data-tour="assembly" title="View only — does not change the calculation. Click the word Assembly for Myla.">
            <span className="myla-hit" onClick={() => askAbout('assembly')}>Assembly</span>
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
              params={params}
              selected={selected}
              hiddenParts={hiddenParts}
              explode={explode}
              onSelect={selectPart}
              onClearSelection={clearSelection}
              handleRef={viewportRef}
              materialColors={currentMaterialColors}
            />
            <button type="button" className="material-legend myla-hit" data-tour="legend" aria-label="Current visual materials" onClick={() => askAbout('materials')}>
              <span><i style={{ background: materials.topColor }} /> Metal · {materials.topMaterial}</span>
              <span><i style={{ background: materials.baseColor }} /> Base · {materials.baseMaterial}</span>
            </button>
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
          onAsk={askAbout}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
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
          selectedTopics={focusTopic ? new Set([focusTopic]) : new Set()}
          onSelectTopic={askAbout}
        />
      </section>

      {/* AI explanation dialog */}
      <AskLlm
        open={mylaOpen}
        onOpenChange={setMylaOpen}
        topics={focusTopic ? [focusTopic] : []}
        snapshot={snapshot}
        explain={explain}
        anchor={mylaAnchor}
      />
      {guidedOpen && (
        <GuidedTour
          index={guidedIndex}
          sceneKey={`${inspectorTab}-${view}-${selected ?? 'none'}`}
          onIndex={setGuidedIndex}
          onClose={stopTour}
        />
      )}
    </div>
  );
}
