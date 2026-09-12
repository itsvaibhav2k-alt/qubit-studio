'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SavedDesigns from '@/components/SavedDesigns';
import type { ShareableDesign } from '@/lib/design-link';
import AskLlm from '@/components/AskLlm';
import LayoutWorkbench from '@/components/layout/LayoutWorkbench';
import type { ViewportHandle } from '@/components/Viewport3D';
import { topicFromPart, type TopicId } from '@/lib/explain-topics';
import { buildChipSnapshot } from '@/lib/insight-snapshot';
import { DEFAULT_PARAMS, clampParam, sameParams } from '@/lib/params';
import type { ParamKey } from '@/lib/params';
import type { PartId } from '@/lib/parts';
import { useEvaluate } from '@/lib/useEvaluate';
import { useExplain } from '@/lib/useExplain';
import type { DesignGoals, DeviceParams, DeviceResult } from '@/lib/types';
import { materialColor, materialPartColors } from '@/lib/material-colors';
import type { MaterialAppearance } from '@/lib/material-colors';
import { useExperimentSession } from '@/lib/useExperimentSession';
import { completedDevice, validDeviceParams } from '@/lib/device-snapshot';
import { buildExportReport } from '@/lib/export-report';
import { validExperimentGoals } from '@/lib/experiment-session';

const Viewport3D = dynamic(() => import('@/components/Viewport3D'), {
  ssr: false,
  loading: () => <p className="viewport-note">Starting 3D view…</p>,
});

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
  const [selected, setSelected] = useState<PartId | null>('junction');
  const [hiddenParts, setHiddenParts] = useState<PartId[]>([]);
  const [mode, setMode] = useState<'explore' | 'design'>('explore');
  const [explode, setExplode] = useState(0);
  const [baseline, setBaseline] = useState<DeviceResult | null>(null);
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
  const experiments = useExperimentSession(params, goals, materials);

  // Build a compact snapshot for the LLM
  const snapshot = useMemo(
    () =>
      buildChipSnapshot({
        params,
        result,
        baseline,
        selected,
        explode,
        stale,
        error,
        goals,
        materials,
        experiments: experiments.evidence,
      }),
    [params, result, baseline, selected, explode, stale, error, goals, materials, experiments.evidence],
  );

  const topicsArray = useMemo(() => Array.from(selectedTopics), [selectedTopics]);
  const explain = useExplain(snapshot, topicsArray);

  const restoreDesign = useCallback((design: ShareableDesign) => {
    if (!validDeviceParams(design.params) || !validExperimentGoals(design.goals)) return;
    setParams({ ...design.params }); setGoals({ ...design.goals });
    setMaterials({ topMaterial: design.topMaterial, baseMaterial: design.baseMaterial,
      topColor: materialColor(design.topMaterial), baseColor: materialColor(design.baseMaterial) });
    setMode('explore');
  }, []);

  const changeParam = useCallback((key: ParamKey, value: number) => {
    if (mode !== 'explore' || !Number.isFinite(value)) return;
    setParams((current) => ({ ...current, [key]: clampParam(key, value) }));
  }, [mode]);

  const applyMaterialScenario = useCallback((evaluated: DeviceParams) => {
    if (validDeviceParams(evaluated)) setParams({ ...evaluated });
  }, []);

  const changeMaterials = useCallback((topMaterial: string, baseMaterial: string) => {
    setMaterials({
      topMaterial,
      baseMaterial,
      topColor: materialColor(topMaterial),
      baseColor: materialColor(baseMaterial),
    });
  }, []);

  const currentMaterialColors = materials.topMaterial==='Al'&&materials.baseMaterial==='Si'?{}:materialPartColors(materials);

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
    if (selectedTopics.size === 0) setSelectedTopics(new Set(['f01']));
    setLlmOpen(true);
  }, [selectedTopics.size]);

  const selectPart = useCallback((id: PartId) => {
    setSelected(id);
    // Auto-add the part's associated topic to the selection
    const next = topicFromPart(id);
    if (next) {
      setSelectedTopics((current) => new Set(current).add(next));
    }
    setHiddenParts((current) => current.filter((part) => part !== id));
  }, []);

  const clearSelection = useCallback(() => setSelected(null), []);

  const toggleVisible = useCallback((id: PartId) => {
    setHiddenParts((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || llmOpen) return;
      if (event.target instanceof Element && event.target.closest('input, select, textarea, [role="dialog"]')) return;
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [llmOpen]);

  // Pinning is only meaningful for a completed calculation of the current parameters.
  const canPin = completedDevice(params, result, status, stale);
  const atDefaults = sameParams(params, DEFAULT_PARAMS);

  const statusBadge = error
    ? { className: 'badge err', text: 'Calculation failed' }
    : stale
      ? { className: 'badge stale', text: 'Updating…' }
      : status === 'ready'
        ? { className: 'badge live', text: 'Live result' }
        : { className: 'badge', text: 'Calculating…' };

  const exportReport = () => {
    const report = buildExportReport({ params, result, status, stale, goals, materials, baseline, experiments: experiments.evidence });
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qubit-studio-${Date.now()}.json`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Let browser download handlers consume the Blob before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <LayoutWorkbench
        designTools={<SavedDesigns design={{ params, goals, topMaterial: materials.topMaterial, baseMaterial: materials.baseMaterial }} onRestore={restoreDesign} />}
        mode={mode} onMode={setMode} status={statusBadge}
        hiddenParts={hiddenParts} onToggleVisible={toggleVisible}
        explode={explode} onExplode={setExplode} onReset3d={() => viewportRef.current?.resetView()}
        onExport={exportReport} canExport={canPin && validExperimentGoals(goals)}
        atDefaults={atDefaults}
        onPreset={(name) => { if (mode === 'explore' && PRESETS[name]) setParams(PRESETS[name]); }}
        onResetParams={() => { if (mode === 'explore') setParams(DEFAULT_PARAMS); }}
        inspector={{
          selected, params, result: canPin ? result : null, session: experiments,
          onSelect: selectPart, onChange: changeParam, onApplyMaterialScenario: applyMaterialScenario,
          goals, onGoalsChange: setGoals, onMaterialsChange: changeMaterials, materials,
          selectedTopics, onSelectTopic, onClearTopics: clearTopics, onAskLlm: triggerAskLlm,
        }}
        results={{
          result, baseline, stale, error, canPin,
          onPin: () => { if (canPin && result) setBaseline(structuredClone(result)); },
          onClearBaseline: () => setBaseline(null), onRetry: retry, goals,
          selectedTopics, onSelectTopic,
        }}
      >
        <Viewport3D selected={selected} hiddenParts={hiddenParts} explode={explode}
          onSelect={selectPart} onClearSelection={clearSelection} active
          handleRef={viewportRef} materialColors={currentMaterialColors}/>
      </LayoutWorkbench>
      <AskLlm open={llmOpen} onOpenChange={setLlmOpen} topics={topicsArray} snapshot={snapshot} explain={explain}/>
    </>
  );
}
