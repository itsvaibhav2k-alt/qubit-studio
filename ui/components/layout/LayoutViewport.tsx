'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Hand, Maximize, Minus, MousePointer2, Plus } from 'lucide-react';
import type { PartId } from '@/lib/parts';
import { boundedCamera, layoutViewBox, type LayoutCamera } from '@/lib/layout-geometry';
import LayoutArtwork from './LayoutArtwork';
import { INITIAL_LAYOUT_VIEW, INSPECTIONS, returnFromInspection, type LayoutViewState, type InspectionLabel, type PadFocus } from '@/lib/layout-inspection';
import MathText from '@/components/MathText';

interface Props {
  selected: PartId | null;
  hiddenParts: PartId[];
  onSelect: (part: PartId) => void;
  annotations: boolean;
  onInspect: (part: PartId, focus?: PadFocus) => void;
  viewState: LayoutViewState;
  onViewState: (next: LayoutViewState) => void;
}
export default function LayoutViewport({ selected, hiddenParts, onSelect, onInspect, annotations, viewState, onViewState }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 620 });
  const [pan, setPan] = useState(false);
  const drag = useRef<{ x: number; y: number; camera: LayoutCamera; moved: boolean } | null>(null);
  const latest = useRef({ viewState, onViewState, size });
  useEffect(() => { latest.current = { viewState, onViewState, size }; }, [viewState, onViewState, size]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { viewState: current, onViewState: update, size: box } = latest.current;
      const view = layoutViewBox(box.width, box.height, current.camera);
      const bounds = element.getBoundingClientRect();
      const fx = (event.clientX - bounds.left) / Math.max(box.width,1) - .5;
      const fy = (event.clientY - bounds.top) / Math.max(box.height,1) - .5;
      const zoom = Math.max(1, Math.min(6, current.camera.zoom * Math.exp(-event.deltaY * .0015)));
      const scale = current.camera.zoom / zoom;
      update({ ...current, camera: boundedCamera({ zoom, x: current.camera.x + fx * view.width * (1-scale), y: current.camera.y + fy * view.height * (1-scale) }) });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, []);
  const { camera, beforeInspection } = viewState;
  const detail = beforeInspection !== null;
  const inspection = viewState.inspecting ? INSPECTIONS[viewState.inspecting] : null;
  const box = layoutViewBox(size.width, size.height, camera);
  const zoom = (factor: number) => onViewState({ ...viewState, camera: boundedCamera({ ...camera, zoom: camera.zoom * factor }) });
  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!pan && event.button !== 1 && !event.shiftKey) return;
    if ((event.target as Element).closest('button')) return;
    event.preventDefault();
    drag.current = { x: event.clientX, y: event.clientY, camera: { ...camera }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    drag.current.moved ||= Math.abs(dx)+Math.abs(dy)>3;
    onViewState({ ...viewState, camera: boundedCamera({ ...drag.current.camera, x: drag.current.camera.x-dx*box.width/size.width, y: drag.current.camera.y-dy*box.height/size.height }) });
  };
  const labels: InspectionLabel[] = inspection ? inspection.labels.map(label=>viewState.inspecting==='capacitor'&&viewState.padFocus==='right'&&label.text==='Stepped electrode neck'?{...label,anchor:[590,307] as [number,number],offset:[-35,75] as [number,number]}:label) : [
    {text:'C1 · Capacitor pads',part:'capacitor',anchor:[250,285],offset:[12,-85]},
    {text:'JJ1 · Josephson junction',part:'junction',anchor:[500,310],offset:[25,-80]},
    {text:'G1 · Charge gate',part:'gate',anchor:[840,310],offset:[20,-54]},
    {text:'Ground metal',part:'ground',anchor:[420,425],offset:[-135,20]},
  ];
  const projected = labels.filter(l=>!l.part||!hiddenParts.includes(l.part)).map(label=>{
    const ax=(label.anchor[0]-box.x)/box.width*size.width, ay=(label.anchor[1]-box.y)/box.height*size.height;
    const width = Math.min(size.width-20, label.text.length*6.5+20);
    return {...label, ax, ay, width, x:Math.max(10,Math.min(size.width-width-10,ax+label.offset[0])),y:Math.max(18,Math.min(size.height-40,ay+label.offset[1]))};
  }).filter(label=>label.ax>=0&&label.ax<=size.width&&label.ay>=0&&label.ay<=size.height);
  return <section className="layout-viewport" aria-label="Interactive chip layout" onKeyDown={event=>{if(event.key==='Escape'&&detail){event.preventDefault();onViewState(returnFromInspection(viewState));}}}>
    <div className="layout-canvas-toolbar">
      {detail ? <button className="layout-canvas-button" onClick={()=>onViewState(returnFromInspection(viewState))}><ArrowLeft size={16}/>Full chip</button> : <span className="layout-view-caption">TOP / TRANSMON 01</span>}
      {detail && <span className="layout-inspection-caption">{inspection?.title} · illustrative</span>}
      <div className="layout-camera-controls">
        <button aria-label="Select parts" aria-pressed={!pan} onClick={()=>setPan(false)}><MousePointer2 size={17}/></button>
        <button aria-label="Pan layout" aria-pressed={pan} onClick={()=>setPan(true)}><Hand size={17}/></button>
        <button aria-label="Zoom out" disabled={camera.zoom<=1} onClick={()=>zoom(1/1.25)}><Minus size={17}/></button>
        <output aria-label="Layout zoom"><MathText math={`${Math.round(camera.zoom*100)}\\,\\%`} /></output>
        <button aria-label="Zoom in" disabled={camera.zoom>=6} onClick={()=>zoom(1.25)}><Plus size={17}/></button>
        <button aria-label="Fit whole chip" onClick={()=>onViewState(INITIAL_LAYOUT_VIEW)}><Maximize size={17}/></button>
      </div>
    </div>
    {viewState.inspecting==='capacitor' && <div className="layout-pad-focus" role="group" aria-label="Capacitor inspection focus"><span>Inspect</span>{(['both','left','right'] as const).map(focus=><button key={focus} aria-pressed={viewState.padFocus===focus} onClick={()=>onInspect('capacitor',focus)}>{focus==='both'?'Both pads':focus==='left'?'Left pad':'Right pad'}</button>)}</div>}
    <div ref={surface} className={`layout-drawing${pan?' is-panning':''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} data-inspecting={detail}>
      <svg className="layout-scene" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} aria-label="Transmon geometry with selectable capacitor pads, junction, gate, ground and substrate">
        <LayoutArtwork selected={selected} hiddenParts={hiddenParts} onSelect={part=>{if(!pan&&!drag.current?.moved)onSelect(part);}} onInspect={part=>{if(!pan)onInspect(part);}} detail={detail}/>
      </svg>
      {annotations && size.width>510 && <div className="layout-annotations" aria-label="Component annotations">
        <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">{projected.map((l,i)=><g key={i}><path d={`M${l.ax} ${l.ay}L${l.x+12} ${l.y+13}`} stroke={l.part===selected?'#61beff':'#c4d2d9'} fill="none" strokeWidth="1"/><circle cx={l.ax} cy={l.ay} r="2.6" fill={l.part===selected?'#61beff':'#e5eaeb'}/></g>)}</svg>
        {projected.map((l,i)=><button key={i} className={l.part===selected?'selected':''} style={{left:l.x,top:l.y,maxWidth:l.width}} onClick={()=>l.part&&onSelect(l.part)}>{l.text}</button>)}
      </div>}
      {detail && <button className="layout-locator" aria-label="Return to previous full-chip view" onClick={()=>onViewState(returnFromInspection(viewState))}>
        <svg viewBox="0 0 1000 620" aria-hidden="true"><LayoutArtwork selected={selected} miniature/><rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#2499ff22" stroke="#51baff" strokeWidth="8"/></svg><span>Full-chip locator</span>
      </button>}
    </div>
    <div className="layout-canvas-status"><span>{inspection?inspection.explanation:<><span>Illustrative geometry · Double-click a part to inspect · </span><MathText math="100\\,\\%"/><span> fits the whole chip</span></>}</span><span className="layout-layer-key"><i/>Metal <i/>Junction <i/>Substrate</span></div>
  </section>;
}
