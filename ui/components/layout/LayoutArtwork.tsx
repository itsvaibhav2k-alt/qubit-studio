'use client';

import { useId, type KeyboardEvent } from 'react';
import { SUBSTRATE_PLAN, GATE_PLAN } from '@/lib/chip-plan';
import type { PartId } from '@/lib/parts';
import { GROUND_BOUNDARY, LEFT_ELECTRODE, METAL_OPENING, RIGHT_ELECTRODE } from '@/lib/layout-geometry';

interface Props {
  selected: PartId | null;
  hiddenParts?: PartId[];
  onSelect?: (id: PartId) => void;
  onInspect?: (id: PartId) => void;
  detail?: boolean;
  miniature?: boolean;
}

/** Vector artwork, shared by overview, magnification and locator. No screenshot textures. */
export default function LayoutArtwork({ selected, hiddenParts = [], onSelect, onInspect, detail, miniature }: Props) {
  const prefix = useId().replaceAll(':', '');
  const id = (name: string) => `${prefix}-${name}`;
  const fill = (name: string) => `url(#${id(name)})`;
  const visible = (part: PartId) => !hiddenParts.includes(part);
  const pick = (part: PartId, label: string) => ({
    className: `layout-pick${selected === part ? ' is-selected' : ''}`,
    'data-part': part,
    'aria-label': label,
    'aria-pressed': selected === part,
    'aria-keyshortcuts': onInspect ? 'I' : undefined,
    onDoubleClick: onInspect ? () => onInspect(part) : undefined,
    role: onSelect ? 'button' : undefined,
    tabIndex: onSelect && !miniature ? 0 : undefined,
    onClick: onSelect ? () => onSelect(part) : undefined,
    onKeyDown: onSelect ? (event: KeyboardEvent<SVGGElement>) => {
      if (event.key.toLowerCase() === 'i' && onInspect) { event.preventDefault(); onInspect(part); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(part); }
    } : undefined,
  });
  return <g className="layout-artwork">
    <defs>
      <linearGradient id={id('gold')} x1="0" y1="0" x2="0.7" y2="1"><stop stopColor="#f7dca1"/><stop offset=".3" stopColor="#e8c385"/><stop offset=".65" stopColor="#d0a45e"/><stop offset="1" stopColor="#efd293"/></linearGradient>
      <linearGradient id={id('silver')} x2="1" y2="1"><stop stopColor="#d1d7d7"/><stop offset=".45" stopColor="#aebbc2"/><stop offset="1" stopColor="#ccd2d2"/></linearGradient>
      <linearGradient id={id('navy')} x2=".7" y2="1"><stop stopColor="#103c50"/><stop offset="1" stopColor="#09232f"/></linearGradient>
      <radialGradient id={id('hole')}><stop stopColor="#031923"/><stop offset=".63" stopColor="#0c2933"/><stop offset=".67" stopColor="#213f49"/><stop offset="1" stopColor="#071e29"/></radialGradient>
      <pattern id={id('engraving')} width="22" height="22" patternUnits="userSpaceOnUse">
        <path d="M11 1C15 5 20 4 21 11C17 15 18 20 11 21C7 17 2 18 1 11C5 7 4 2 11 1Z M11 5C14 8 16 7 17 11C14 14 15 16 11 17C8 14 6 15 5 11C8 8 7 6 11 5Z M11 8L14 11L11 14L8 11Z" fill="none" stroke="#e5e7df" strokeWidth=".45" opacity=".65"/>
        <path d="M0 0L3 3M22 0L19 3M0 22L3 19M22 22L19 19" stroke="#677e89" strokeWidth=".4" opacity=".5"/>
      </pattern>
      <pattern id={id('gold-grain')} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M8 0Q8 8 0 8Q8 8 8 16Q8 8 16 8Q8 8 8 0Z M2 2L4 4M12 12L14 14" fill="none" stroke="#ffe1a5" strokeWidth=".6" opacity=".48"/><circle cx="8" cy="8" r="2.5" fill="none" stroke="#947143" strokeWidth=".35" opacity=".4"/></pattern>
      <pattern id={id('hatch')} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 7L7 0M6 8L8 6" stroke="#c1cbd0" strokeWidth=".6" opacity=".36"/></pattern>
      <clipPath id={id('pads')}><path d={LEFT_ELECTRODE}/><path d={RIGHT_ELECTRODE}/></clipPath>
    </defs>
    {/* Carrier: artwork context only, never an extra circuit element. */}
    {visible('package') && <g {...pick('package','Package & clamps — mechanical context')}>
      <rect className="part-outline" x="80" y="58" width="840" height="514" rx="39" fill="#061c26" opacity=".5"/>
      <rect x="80" y="48" width="840" height="514" rx="39" fill={fill('gold')} stroke="#987443" strokeWidth="2"/>
      <rect x="84" y="52" width="832" height="506" rx="36" fill={fill('gold-grain')} stroke="#ffe1a4" strokeWidth="1.1"/>
      <rect className="part-outline" x="112" y="82" width="776" height="446" rx="9" fill="#182b32" stroke="#a78750" strokeWidth="2"/>

      {[115,885].flatMap(x => [83,527].map(y => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="30" fill={fill('gold')} stroke="#ffe6ad"/><circle cx={x} cy={y} r="17.5" fill={fill('hole')} stroke="#917145" strokeWidth="1.8"/><path d={`M${x-11} ${y-11}A15 15 0 0 1 ${x+13} ${y-8}`} fill="none" stroke="#89a0a7" strokeWidth=".65"/></g>))}
      {[280,350,650,720].flatMap(x=>[64,546].map(y=><path key={`${x}-${y}`} d={`M${x-7} ${y-15}V${y+15}M${x+7} ${y-15}V${y+15}`} stroke="#846637" strokeWidth="1"/>))}
    </g>}
    {visible('board') && <g {...pick('board','Carrier board — chip support')}><path className="part-outline" d="M134 91H866L877 102V508L866 519H134L123 508V102Z" fill={fill('navy')} stroke="#71848b"/></g>}
    <g aria-hidden="true">
      {[141,859].flatMap(x=>Array.from({length:23},(_,i)=><g key={`${x}-${i}`}><rect x={x-8} y={151+i*13} width="5" height="6" rx=".7" fill={fill('gold')}/><rect x={x+2} y={151+i*13} width="5" height="6" rx=".7" fill="#e5bd79"/></g>))}
    </g>
    {visible('substrate') && <g {...pick('substrate','Substrate — continuous chip base')}><path className="part-outline" d={SUBSTRATE_PLAN} fill={fill('navy')} stroke="#5995b5" strokeWidth="1.2"/><path d="M182 121H818L843 146V464L818 489H182L157 464V146Z" fill="none" stroke="#1175ac" strokeWidth="1"/></g>}
    {visible('ground') && <g {...pick('ground','Ground metal — openings expose the substrate')}><path className="part-outline" d={`${GROUND_BOUNDARY} ${METAL_OPENING}`} fill="#526772" fillRule="evenodd" stroke="#bdcdd5" strokeWidth="1.5"/><path d={`${GROUND_BOUNDARY} ${METAL_OPENING}`} fill={fill('hatch')} fillRule="evenodd"/><path d="M224 151H775L795 172M224 469H775L795 448" fill="none" stroke="#f0eee1" strokeWidth=".7"/></g>}
    <g aria-hidden="true">
      {[285,355,645,715].flatMap(x=>[0,1].map(bottom=><g key={`${x}-${bottom}`} transform={bottom?'translate(0 610) scale(1 -1)':undefined}>
        {Array.from({length:4},(_,i)=><g key={i} transform={`translate(${x+i*15-22} 0)`}><rect x="-6" y="47" width="12" height="47" rx="2" fill="#8a693a" stroke="#efcf8c"/><rect x="-4" y="48" width="8" height="45" rx="2" fill={fill('gold')}/><rect x="-4" y="121" width="8" height="25" fill={fill('gold')}/><path d="M0 66C-2 79 3 100 0 134" stroke="#664b26" strokeWidth="4" fill="none"/><path d="M-1 64C-3 79 2 99-1 133" stroke="#f1d699" strokeWidth="2.5" fill="none"/><circle cx="-1" cy="64" r="2.5" fill="#fcdf9c"/><circle cx="-1" cy="133" r="2.5" fill="#e7bd70"/></g>)}
      </g>))}
      {[185,815].flatMap(x=>[305,337].map(y=><g key={`${x}-${y}`}><rect x={x-9} y={y-9} width="18" height="18" fill="#d9b16d" stroke="#ffdf99"/><rect x={x-6} y={y-6} width="12" height="12" fill="#9f834f"/><rect x={x-12} y={y-12} width="24" height="24" fill="none" stroke="#1777ac" strokeWidth=".8"/></g>))}
      {[189,811].flatMap(x=>[135,475].map(y=><g key={`${x}-${y}`} stroke="#a5c3d3" fill="none" strokeWidth=".8"><rect x={x-4} y={y-4} width="8" height="8"/><path d={`M${x-2} ${y}H${x+2}M${x} ${y-2}V${y+2}`}/></g>))}
    </g>
    {visible('capacitor') && <>
      {[['left',LEFT_ELECTRODE],['right',RIGHT_ELECTRODE]].map(([side,path])=><g key={side} {...pick('capacitor',`${side === 'left'?'Left':'Right'} capacitor pad — charging energy`)} data-side={side}>
        <path d={path} fill="none" stroke="#142730" strokeWidth="8"/>
        <path className="part-outline" d={path} fill={fill('silver')} stroke="#f1f0df" strokeWidth="1.5"/>
        <path d={path} fill={fill('engraving')}/>
        <path d={path} fill="none" stroke="#73858d" strokeWidth=".6" transform={`translate(${side==='left'?1:-1} 1)`}/>
      </g>)}
      <g clipPath={fill('pads')} pointerEvents="none" stroke="#7e919c" strokeWidth=".6">{[350,375,397,417,436,451,465].flatMap(x=>[x,1000-x].map(v=><g key={v}><line x1={v} x2={v} y1="225" y2="397"/><line x1={v-2} x2={v-2} y1="225" y2="397" stroke="#e2e4dc"/></g>))}</g>
    </>}
    {visible('gate') && <g {...pick('gate','Charge gate — offset charge')}><path d="M730 299H940V321H730Z" fill="#1b3441" stroke="#247aa0" strokeWidth="1"/><path className="part-outline" d={GATE_PLAN} fill={fill('gold')} stroke="#f6d797"/><path d="M736 306H940" stroke="#ffedbc" strokeWidth=".7"/><path d="M735 312H939" stroke="#ad854b" strokeWidth=".7"/><path d="M735 310H942" stroke="transparent" strokeWidth="36"/><rect x="750" y="299" width="180" height="22" fill={fill('gold-grain')} pointerEvents="none"/></g>}
    {visible('junction') && <g {...pick('junction','Josephson junction — Josephson energy')}>
      <rect x="487" y="306" width="13" height="8" fill={fill('silver')} stroke="#f3ead4" strokeWidth=".8"/><rect x="500" y="306" width="13" height="8" fill={fill('silver')} stroke="#f3ead4" strokeWidth=".8"/>
      <rect x="498" y="305" width="4" height="10" fill="#ecd08c" stroke="#f9e8b3" strokeWidth=".5"/>
      <rect className="junction-selection" x="483" y="294" width="34" height="32" fill="#0783ff16" stroke={selected==='junction'?'#2c9cff':'transparent'} strokeWidth="1.5"/>
      {detail && <path d="M498 304V316M502 304V316" stroke="#7dccff" strokeWidth=".4"/>}
      <rect x="479" y="288" width="42" height="44" fill="transparent"/>
    </g>}
  </g>;
}
