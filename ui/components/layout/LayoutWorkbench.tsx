'use client';
import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Blocks, Box, ChevronDown, CircuitBoard, Columns2, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import GuidedTour from '@/components/GuidedTour';
import MylaIcon from '@/components/MylaIcon';
import { TOUR_STEPS } from '@/lib/guided-tour';
import { PARTS, type PartId } from '@/lib/parts';
import type Inspector from '@/components/Inspector';
import type ResultsDock from '@/components/ResultsDock';
import LayoutViewport from './LayoutViewport';
import { INITIAL_LAYOUT_VIEW, inspectPart, returnFromInspection, type PadFocus } from '@/lib/layout-inspection';
import LayoutInspector from './LayoutInspector';
import LayoutCircuit from './LayoutCircuit';
import LayoutResults from './LayoutResults';
import { HardwareContext } from './HardwareContext';
import { resolveMaterial, type ComponentMaterials } from '@/lib/component-materials';
import './layout.css';
import './product.css';

interface Props {
  mode:'explore'|'design'; onMode:(mode:'explore'|'design')=>void;
  inspector:ComponentProps<typeof Inspector>; results:ComponentProps<typeof ResultsDock>;
  status:{className:string;text:string}; hiddenParts:PartId[]; onToggleVisible:(id:PartId)=>void;
  explode:number; onExplode:(value:number)=>void; onReset3d:()=>void;
  onExport:()=>void; canExport:boolean; onPreset:(name:string)=>void; onResetParams:()=>void; atDefaults:boolean;
  children:ReactNode; designTools?:ReactNode;
  componentMaterials:ComponentMaterials; onComponentMaterialChange:(part:PartId,material:string)=>void;
  renderQuality:'balanced'|'high'; onRenderQuality:(quality:'balanced'|'high')=>void;
}
export default function LayoutWorkbench(props:Props) {
  const [tour,setTour]=useState<number|null>(null);
  const closeTour=useCallback(()=>setTour(null),[]);
  const [view,setView]=useState<'layout'|'3d'>('3d');
  const [split,setSplit]=useState(false);
  const [ratio,setRatio]=useState(50);
  const [circuit,setCircuit]=useState(false);
  const [annotations,setAnnotations]=useState(true);
  const [layoutView,setLayoutView]=useState(INITIAL_LAYOUT_VIEW);
  const [solverOpen,setSolverOpen]=useState(false);
  const aside=useRef<HTMLElement>(null),stage=useRef<HTMLElement>(null),panes=useRef<HTMLDivElement>(null);
  const {inspector,results,mode}=props;
  const {selected,params,session}=inspector;
  const show3d=split||view==='3d',showLayout=split||view==='layout';
  const filmIds = new Set([props.componentMaterials.capacitor, props.componentMaterials.junction, props.componentMaterials.gate, props.componentMaterials.ground]);
  const filmLabel = filmIds.size === 1 ? resolveMaterial(props.componentMaterials.capacitor).formula : 'Mixed films';
  const inspectionSize=()=>{const rect=stage.current?.querySelector('.layout-drawing')?.getBoundingClientRect();return {width:rect?.width||500,height:rect?.height||500};};
  const onSelect=(part:PartId)=>{
    inspector.onSelect(part);aside.current?.scrollTo({top:0});
    if(layoutView.inspecting&&layoutView.inspecting!==part){const {width,height}=inspectionSize();setLayoutView(current=>inspectPart(current,part,width,height));}
  };
  const openInspection=(part:PartId,focus:PadFocus='both')=>{
    // The fit needs the revealed pane's dimensions. Commit this layout change
    // before measuring instead of waiting behind a potentially expensive GPU frame.
    if(!showLayout)flushSync(()=>setSplit(true));
    inspector.onSelect(part);aside.current?.scrollTo({top:0});
    const {width,height}=inspectionSize();setLayoutView(current=>inspectPart(current,part,width,height,focus));
  };
  const goTour=(index:number)=>{
    const step=TOUR_STEPS[index]; if(!step)return;
    setTour(index); props.onMode(step.tab==='experiment'?'design':'explore');
    if(index===0)document.querySelector('.learning-menu')?.removeAttribute('open');
    if(step.part)inspector.onSelect(step.part);
    if(step.view==='3d'){setView('3d');setSplit(false);}
    if(step.view==='schematic'){setView('layout');setSplit(false);setCircuit(true);}
    if(step.view==='split')setSplit(true);
  };
  const candidateSource=session.chosenCandidate;
  const candidate=candidateSource&&session.search.snapshot?{ej_ghz:candidateSource.ej_ghz,ec_ghz:candidateSource.ec_ghz,ng:0,ncut:session.search.snapshot.params.ncut}:null;
  const inspect=()=>{if(showLayout&&layoutView.inspecting===selected)setLayoutView(returnFromInspection(layoutView));else if(selected)openInspection(selected);};
  const openSolver=()=>{setSolverOpen(true);requestAnimationFrame(()=>{const node=aside.current?.querySelector<HTMLElement>('.layout-solver summary');node?.focus();node?.scrollIntoView({block:'nearest'});});};
  const resize=(clientX:number)=>{const rect=panes.current?.getBoundingClientRect();if(rect)setRatio(Math.max(35,Math.min(65,(clientX-rect.left)/rect.width*100)));};
  const selectView=(next:'layout'|'3d')=>{setView(next);setSplit(false);};
  return <div className={`wave-shell product-shell${mode==='design'?' is-design':''}${split?' has-split':''}`}>
    <header className="wave-header">
      <div className="wave-brand"><Blocks size={24} strokeWidth={1.8}/>Qubit Studio</div>
      <nav className="wave-modes" aria-label="Workspace mode">{(['explore','design'] as const).map(item=><button key={item} aria-pressed={mode===item} onClick={()=>props.onMode(item)}>{item==='explore'?'Explore':'Design'}</button>)}</nav>
      <details className="layout-popover learning-menu"><summary>Design tools</summary><div>{props.designTools}<button type="button" onClick={()=>goTour(0)}>Guided learning</button></div></details>
      <span className="wave-device">Transmon / 01</span><span role="status" className={props.status.className}>{props.status.text}</span>
      <button className="wave-tool-button" onClick={()=>goTour(0)}>Learn with Myla</button>
      <button className="wave-tool-button" onClick={inspector.onAskLlm}><MylaIcon size={22}/>Ask Myla{inspector.selectedTopics.size>0?` (${inspector.selectedTopics.size})`:''}</button>
      <details className="layout-popover device-menu"><summary>Device <ChevronDown size={14}/></summary><div><label>Demo preset<select defaultValue="" disabled={mode==='design'} onChange={e=>{if(e.target.value)props.onPreset(e.target.value);e.target.value='';}}><option value="" disabled>Choose preset…</option><option value="default">Balanced default</option><option value="reference">scqubits reference</option><option value="protected">Low charge sensitivity</option><option value="anharmonic">High anharmonicity</option></select></label><button disabled={props.atDefaults||mode==='design'} onClick={props.onResetParams}>Reset all parameters</button></div></details>
    </header>
    <div className="wave-toolbar">
      <details className="layout-popover components-menu"><summary><Box size={16}/>Components <ChevronDown size={14}/></summary><div aria-label="Component selection">{[...PARTS.filter(p=>p.modeled),...PARTS.filter(p=>!p.modeled)].map(part=><button key={part.id} onClick={event=>{onSelect(part.id);event.currentTarget.closest('details')?.removeAttribute('open');}} aria-pressed={selected===part.id}><span>{part.name}</span><small>{resolveMaterial(props.componentMaterials[part.id]).formula}</small></button>)}</div></details>
      <div className="wave-view-switch" role="group" aria-label="Representation">{(['3d','layout'] as const).map(item=><button key={item} aria-pressed={!split&&view===item} onClick={()=>selectView(item)}>{item==='3d'?'3D':'Layout'}</button>)}</div>
      <button className="wave-tool-button split-toggle" aria-pressed={split} onClick={()=>setSplit(!split)}><Columns2 size={17}/>Split view</button>
      <span className="spacer"/>
      <button className="wave-tool-button" aria-expanded={circuit} aria-controls="wave-circuit" onClick={()=>setCircuit(!circuit)}><CircuitBoard size={17}/>{circuit?'Hide circuit':'Show circuit'}</button>
      <details className="layout-popover view-options"><summary><SlidersHorizontal size={17}/>View options <ChevronDown size={14}/></summary><div><strong>{split?'3D + Layout':showLayout?'Layout':'3D'}</strong>
        {showLayout&&<label><input type="checkbox" checked={annotations} onChange={e=>setAnnotations(e.target.checked)}/>Annotations</label>}
        <span className="options-hint">Visible components · shared across views</span>
        {PARTS.map(part=><label key={part.id}><input type="checkbox" checked={!props.hiddenParts.includes(part.id)} onChange={()=>props.onToggleVisible(part.id)}/>{part.name}</label>)}
      </div></details>
    </div>
    <main ref={stage} className="wave-stage" aria-label={split?'Linked 3D and Layout workspace':showLayout?'Layout workspace':'3D workspace'}>
      <div ref={panes} className={`product-panes${split?' is-split':''}`} style={split?{gridTemplateColumns:`minmax(0,${ratio}fr) 8px minmax(0,${100-ratio}fr)`}:undefined}>
        <section className="product-hardware" hidden={!show3d} aria-label="3D chip pane">
          <div className="hardware-toolbar"><span>Device assembly</span><button className="hardware-quality" aria-label="High detail rendering" aria-pressed={props.renderQuality==='high'} title={props.renderQuality==='high'?'High detail: supersampled canvas and sharper lighting. Click for balanced performance.':'Balanced rendering. Click for high detail.'} onClick={()=>props.onRenderQuality(props.renderQuality==='high'?'balanced':'high')}><Sparkles size={12}/><span>High detail</span></button><div role="group" aria-label="Assembly state"><button aria-pressed={props.explode===0} onClick={()=>props.onExplode(0)}>Assembled</button><button aria-pressed={props.explode===1} onClick={()=>props.onExplode(1)}>Exploded</button></div><button className="hardware-reset" aria-label="Reset 3D view" title="Reset 3D view" onClick={props.onReset3d}><RotateCcw size={16}/></button></div>
          <div className="hardware-surface">
            <HardwareContext.Provider value={{active:show3d,onSelect}}>{props.children}</HardwareContext.Provider>
            <div className="hardware-caption"><span>QS–01</span><strong>Transmon</strong><small>{filmLabel} / {resolveMaterial(props.componentMaterials.substrate).formula} · {props.explode===1?'Layer separation':'Packaged device'}</small></div>
          </div>
          {props.explode===1&&<div className="hardware-layer-materials" role="group" aria-label="Exploded component materials">{(['package','board','substrate','ground','capacitor','junction','gate'] as PartId[]).map(id=>{const material=resolveMaterial(props.componentMaterials[id]);return <button key={id} aria-pressed={selected===id} onClick={()=>onSelect(id)} title={`${PARTS.find(part=>part.id===id)?.name} · ${material.name}`}><i style={{backgroundColor:material.color}}/><span>{id==='capacitor'?'Pads':id==='package'?'Package':id==='board'?'Carrier':id[0].toUpperCase()+id.slice(1)}</span><strong>{material.formula}</strong></button>;})}</div>}
          <div className="hardware-status">Drag to orbit · scroll to zoom <span>Illustrative assembly</span></div>
        </section>
        {split&&<div className="product-divider" role="separator" tabIndex={0} aria-label="Resize 3D and Layout panes" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={65} aria-valuenow={Math.round(ratio)} onDoubleClick={()=>setRatio(50)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setRatio(current=>Math.max(35,Math.min(65,current+(event.key==='ArrowLeft'?-5:5))));}}} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);resize(event.clientX);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resize(event.clientX);}} onPointerUp={event=>event.currentTarget.releasePointerCapture(event.pointerId)}/>}
        <section className="wave-renderer product-layout" hidden={!showLayout} aria-label="Planar layout pane"><LayoutViewport componentMaterials={props.componentMaterials} selected={selected} hiddenParts={props.hiddenParts} onSelect={onSelect} onInspect={openInspection} annotations={annotations} viewState={layoutView} onViewState={setLayoutView}/></section>
      </div>
      {circuit&&<div id="wave-circuit"><LayoutCircuit params={params} selected={selected} onSelect={onSelect}/></div>}
    </main>
    <aside ref={aside} className="wave-inspector"><LayoutInspector {...inspector} componentMaterials={props.componentMaterials} onComponentMaterialChange={props.onComponentMaterialChange} readOnly={mode==='design'} candidate={candidate} candidateCurrent={session.search.current} inspecting={showLayout&&layoutView.inspecting===selected} onInspect={inspect} solverOpen={solverOpen} onSolverOpen={setSolverOpen}/></aside>
    <section className="wave-results"><LayoutResults {...results} tourExpanded={tour!==null} onSolver={openSolver} onExport={props.onExport} canExport={props.canExport} design={mode==='design'}/></section>
    {tour!==null&&<GuidedTour index={tour} sceneKey={`${mode}-${view}-${selected}`} onIndex={goTour} onClose={closeTour}/>}
  </div>;
}
