'use client';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Blocks, Box, ChevronDown, CircuitBoard, SlidersHorizontal } from 'lucide-react';
import { PARTS, type PartId } from '@/lib/parts';
import type Inspector from '@/components/Inspector';
import type ResultsDock from '@/components/ResultsDock';
import LayoutViewport from './LayoutViewport';
import { INITIAL_LAYOUT_VIEW, inspectPart, returnFromInspection, type PadFocus } from '@/lib/layout-inspection';
import LayoutInspector from './LayoutInspector';
import LayoutCircuit from './LayoutCircuit';
import LayoutResults from './LayoutResults';
import './layout.css';

interface Props {
  mode:'explore'|'design'; onMode:(mode:'explore'|'design')=>void;
  inspector:ComponentProps<typeof Inspector>;
  results:ComponentProps<typeof ResultsDock>;
  status:{className:string;text:string};
  hiddenParts:PartId[]; onToggleVisible:(id:PartId)=>void;
  explode:number; onExplode:(value:number)=>void; onReset3d:()=>void;
  onExport:()=>void; canExport:boolean;
  onPreset:(name:string)=>void; onResetParams:()=>void; atDefaults:boolean;
  children:ReactNode;
}
export default function LayoutWorkbench(props:Props) {
  const [view,setView]=useState<'layout'|'3d'>('layout');
  const [circuit,setCircuit]=useState(false);
  const [annotations,setAnnotations]=useState(true);
  const [layoutView,setLayoutView]=useState(INITIAL_LAYOUT_VIEW);
  const [solverOpen,setSolverOpen]=useState(false);
  const aside=useRef<HTMLElement>(null);
  const stage=useRef<HTMLElement>(null);
  const {inspector,results,mode}=props;
  const {selected,params,session}=inspector;
  const inspectionSize=()=>{const rect=stage.current?.querySelector('.layout-drawing')?.getBoundingClientRect();return {width:rect?.width||1000,height:rect?.height||620};};
  const onSelect=(part:PartId)=>{inspector.onSelect(part);aside.current?.scrollTo({top:0});if(layoutView.inspecting&&layoutView.inspecting!==part){const {width,height}=inspectionSize();setLayoutView(current=>inspectPart(current,part,width,height));}};
  const openInspection=(part:PartId,focus:PadFocus='both')=>{inspector.onSelect(part);aside.current?.scrollTo({top:0});const {width,height}=inspectionSize();setView('layout');setLayoutView(current=>inspectPart(current,part,width,height,focus));};
  const selectedCandidate=session.search.result?.selected;
  const candidate=selectedCandidate&&session.search.snapshot?{ej_ghz:selectedCandidate.ej_ghz,ec_ghz:selectedCandidate.ec_ghz,ng:0,ncut:session.search.snapshot.params.ncut}:null;
  const inspect=()=>{if(view==='layout'&&layoutView.inspecting===selected)setLayoutView(returnFromInspection(layoutView));else if(selected)openInspection(selected);};
  const openSolver=()=>{setSolverOpen(true);requestAnimationFrame(()=>{const node=aside.current?.querySelector<HTMLElement>('.layout-solver summary');node?.focus();node?.scrollIntoView({block:'nearest'});});};
  return <div className={`wave-shell${mode==='design'?' is-design':''}`}>
    <header className="wave-header"><div className="wave-brand"><Blocks size={24} strokeWidth={1.8}/>Qubit Studio</div><nav className="wave-modes" aria-label="Workspace mode">{(['explore','design'] as const).map(item=><button key={item} aria-pressed={mode===item} onClick={()=>props.onMode(item)}>{item==='explore'?'Explore':'Design'}</button>)}</nav><span className="wave-device">Transmon / 01</span><span role="status" className={props.status.className}>{props.status.text}</span>
      <details className="layout-popover device-menu"><summary>Device <ChevronDown size={14}/></summary><div><label>Demo preset<select defaultValue="" disabled={mode==='design'} onChange={e=>{if(e.target.value)props.onPreset(e.target.value);e.target.value='';}}><option value="" disabled>Choose preset…</option><option value="default">Balanced default</option><option value="reference">scqubits reference</option><option value="protected">Low charge sensitivity</option><option value="anharmonic">High anharmonicity</option></select></label><button disabled={props.atDefaults||mode==='design'} onClick={props.onResetParams}>Reset all parameters</button></div></details>
    </header>
    <div className="wave-toolbar">
      <details className="layout-popover"><summary><Box size={16}/>Components <ChevronDown size={14}/></summary><div aria-label="Component selection">{PARTS.map(part=><button key={part.id} onClick={event=>{onSelect(part.id);event.currentTarget.closest('details')?.removeAttribute('open');}} aria-pressed={selected===part.id}>{part.name}</button>)}</div></details>
      <div className="wave-view-switch" role="group" aria-label="Representation">{(['3d','layout'] as const).map(item=><button key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item==='3d'?'3D':'Layout'}</button>)}</div>
      <span className="spacer"/>
      <button className="wave-tool-button" aria-expanded={circuit} aria-controls="wave-circuit" onClick={()=>setCircuit(!circuit)}><CircuitBoard size={17}/>{circuit?'Hide circuit':'Show circuit'}</button>
      <details className="layout-popover view-options"><summary><SlidersHorizontal size={17}/>View options <ChevronDown size={14}/></summary><div><strong>{view==='layout'?'Layout':'3D'}</strong>
        {view==='layout'?<><label><input type="checkbox" checked={annotations} onChange={e=>setAnnotations(e.target.checked)}/>Annotations</label>{PARTS.map(part=><label key={part.id}><input type="checkbox" checked={!props.hiddenParts.includes(part.id)} onChange={()=>props.onToggleVisible(part.id)}/>{part.name}</label>)}</>:<><label>Assembly<input type="range" min="0" max="1" step=".01" value={props.explode} onChange={e=>props.onExplode(Number(e.target.value))}/></label><span>{props.explode?'Exploded · view only':'Assembled'}</span><button onClick={props.onReset3d}>Reset 3D view</button></>}
      </div></details>
    </div>
    <main ref={stage} className="wave-stage" aria-label={view==='layout'?'Layout workspace':'3D workspace'}>
      <div className="wave-renderer" hidden={view!=='layout'}><LayoutViewport selected={selected} hiddenParts={props.hiddenParts} onSelect={onSelect} onInspect={openInspection} annotations={annotations} viewState={layoutView} onViewState={setLayoutView}/></div>
      <div className="wave-renderer legacy-viewport" hidden={view!=='3d'}>{props.children}</div>
      {circuit&&<div id="wave-circuit"><LayoutCircuit params={params} selected={selected} onSelect={onSelect}/></div>}
    </main>
    <aside ref={aside} className="wave-inspector"><LayoutInspector {...inspector} readOnly={mode==='design'} candidate={candidate} candidateCurrent={session.search.current} inspecting={view==='layout'&&layoutView.inspecting===selected} onInspect={inspect} solverOpen={solverOpen} onSolverOpen={setSolverOpen}/></aside>
    <section className="wave-results"><LayoutResults {...results} onSolver={openSolver} onExport={props.onExport} canExport={props.canExport} design={mode==='design'}/></section>
  </div>;
}
