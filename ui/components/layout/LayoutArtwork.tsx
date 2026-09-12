'use client';

import { useId, type KeyboardEvent } from 'react';
import { planContour, SUBSTRATE_PLAN, TOP_GROUND_PLAN, GATE_PLAN, LEFT_ELECTRODE, RIGHT_ELECTRODE } from '@/lib/chip-plan';
import { CHIP, DIE_SCALE, PLATE } from '@/lib/chip-geometry';
import { BOND_COUNT, BOND_FINISH, bondPoints, bondPosition, FILM_LAUNCHES, FILM_TRANSFORM, PERFORATIONS, PLAN_TRANSFORM, INSPECTION_SCALE, inspectionWorldPoint, JUNCTION_ELECTRODE, JUNCTION_OVERLAP } from '@/lib/chip-detail';
import { DEFAULT_COMPONENT_MATERIALS, resolveMaterial, type ComponentMaterials } from '@/lib/component-materials';
import type { PartId } from '@/lib/parts';

interface Props {
  selected: PartId | null;
  hiddenParts?: PartId[];
  componentMaterials?: ComponentMaterials;
  onSelect?: (id: PartId) => void;
  onInspect?: (id: PartId) => void;
  detail?: boolean;
  miniature?: boolean;
}
const sides = [0, 1, 2, 3];
const world = INSPECTION_SCALE;
const aperture = PLATE.window / DIE_SCALE * world;
const lipOuter = (PLATE.window + .085) / DIE_SCALE * world;
const polygon = (points: number[][]) => points.map(p => p.join(',')).join(' ');
const perforations: string[] = [];
for (let y = PERFORATIONS.start; y < PERFORATIONS.end; y += PERFORATIONS.pitch)
  for (let x = PERFORATIONS.start; x < PERFORATIONS.end; x += PERFORATIONS.pitch)
    perforations.push(`M${x-1024} ${y-1024}h${PERFORATIONS.size}v${PERFORATIONS.size}h-${PERFORATIONS.size}Z`);

/** The same die and nearby package aperture as Assembly, in an undistorted top projection. */
export default function LayoutArtwork({ selected, hiddenParts = [], componentMaterials = DEFAULT_COMPONENT_MATERIALS, onSelect, onInspect, detail, miniature }: Props) {
  const prefix = useId().replaceAll(':', '');
  const id = (name: string) => `${prefix}-${name}`;
  const fill = (name: string) => `url(#${id(name)})`;
  const visible = (part: PartId) => !hiddenParts.includes(part);
  const material = (part: PartId) => resolveMaterial(componentMaterials[part]);
  // Package Au retains the separate neutral shield used in the main assembly.
  const color = (part: PartId) => part === 'package' && material(part).id === 'Au' ? '#959993' : material(part).color;
  const pick = (part: PartId, label: string) => ({
    className: `layout-pick${selected === part ? ' is-selected' : ''}`,
    'data-part': part, 'data-material': material(part).id, 'data-finish': material(part).finish,
    'aria-label': label, 'aria-pressed': selected === part,
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
  const finish = (part: PartId) => fill(material(part).finish);
  const groundRegions = (props: React.SVGProps<SVGPathElement> = {}) => <g>
    {[-1,1].map(sign=><path key={sign} d={planContour(TOP_GROUND_PLAN).map(([x,z],i)=>`${i?'L':'M'}${inspectionWorldPoint(x,sign*z).join(' ')}`).join('')+'Z'} {...props}/>)}
  </g>;
  return <g className="layout-artwork">
    <defs>
      {(['package','board','substrate','ground','capacitor','junction','gate'] as PartId[]).map(part => <linearGradient key={part} id={id(part)} x1="0" y1="0" x2="0.2" y2="1">
        <stop stopColor={color(part)}/><stop offset=".48" stopColor={color(part)}/><stop offset="1" stopColor={color(part)}/>
      </linearGradient>)}
      {/* Restrained microfinish: circuit detail comes from lithography, not ornamental engraving. */}
      <pattern id={id('brushed')} width="51" height="3.8" patternUnits="userSpaceOnUse"><path d="M0 .5H51M6 2H25M34 3H49" stroke="#fff" strokeWidth=".25" opacity=".18"/><path d="M0 1.2H38" stroke="#17202a" strokeWidth=".25" opacity=".13"/></pattern>
      <pattern id={id('ceramic')} width="8" height="7" patternUnits="userSpaceOnUse"><path d="M1 2h.5M6 5h.5M3 6h.4" stroke="#fff" strokeWidth=".5" opacity=".12"/></pattern>
      <linearGradient id={id('polished')} x2=".3" y2="1"><stop stopColor="#fff" stopOpacity=".09"/><stop offset=".5" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#142332" stopOpacity=".09"/></linearGradient>
      <linearGradient id={id('crystalline')} x2=".5" y2="1"><stop stopColor="#c3c9df" stopOpacity=".12"/><stop offset=".55" stopColor="#354b72" stopOpacity=".03"/><stop offset="1" stopColor="#030c19" stopOpacity=".08"/></linearGradient>
      <clipPath id={id('substrate-clip')}><path d={SUBSTRATE_PLAN} transform={PLAN_TRANSFORM}/></clipPath>
      <clipPath id={id('region')}><rect x="237" y="47" width="526" height="526" rx="20"/></clipPath>
      <mask id={id('perforations')} maskUnits="userSpaceOnUse" x="290" y="90" width="420" height="440">
        <rect x="290" y="90" width="420" height="440" fill="white"/>
        <path d={perforations.join('')} transform={FILM_TRANSFORM} fill="black"/>
        {groundRegions({fill:'none',stroke:'white',strokeWidth:PERFORATIONS.border * CHIP.size * world / 2048})}
      </mask>
    </defs>
    {visible('board') && <g {...pick('board','Carrier board — chip support')} clipPath={fill('region')}>
      <rect className="part-outline" x="237" y="47" width="526" height="526" rx="20" fill={fill('board')} stroke="#747b7d"/>
      <rect x="237" y="47" width="526" height="526" rx="20" fill={finish('board')}/>
      <rect x={500-.445/DIE_SCALE*world} y={310-.445/DIE_SCALE*world} width={.89/DIE_SCALE*world} height={.89/DIE_SCALE*world} rx="2" fill="#b18136"/>
    </g>}
    {visible('package') && <g {...pick('package','Package aperture — surrounding shield detail')}>
      <path className="part-outline" d={`M257 47H743Q763 47 763 67V553Q763 573 743 573H257Q237 573 237 553V67Q237 47 257 47Z M${500-aperture/2+12} ${310-aperture/2}h${aperture-24}q12 0 12 12v${aperture-24}q0 12 -12 12h-${aperture-24}q-12 0 -12 -12v-${aperture-24}q0 -12 12 -12Z`} fill={fill('package')} fillRule="evenodd" stroke="#d0d1c8" strokeWidth=".8"/>
      <path d={`M237 47H763V573H237Z M${500-aperture/2} ${310-aperture/2}h${aperture}v${aperture}h-${aperture}Z`} fill={finish('package')} fillRule="evenodd"/>
      <rect x={500-lipOuter/2} y={310-lipOuter/2} width={lipOuter} height={lipOuter} rx="20" fill="none" stroke="#444940" strokeOpacity=".5" strokeWidth="1.1"/>
      <rect x={500-aperture/2-2} y={310-aperture/2-2} width={aperture+4} height={aperture+4} rx="13" fill="none" stroke={color('package')} strokeWidth="3"/>
      {sides.map(side=><g key={side} transform={`rotate(${side*90} 500 310)`} fill={BOND_FINISH.land}>
        {Array.from({length:BOND_COUNT},(_,i)=><rect key={i} x={500+bondPosition(i)*1.05*world-.009/DIE_SCALE*world/2} y={310+(PLATE.window/2+.040)/DIE_SCALE*world-.043/DIE_SCALE*world/2} width={.009/DIE_SCALE*world} height={.043/DIE_SCALE*world}/>)}
      </g>)}
      <g fill="#303a36" fontFamily="monospace" fontSize="5.5" letterSpacing=".6"><text x="500" y="63" textAnchor="middle">QS–01 / SHIELD APERTURE</text><text x="500" y="562" textAnchor="middle">TRANSMON · REV A</text></g>
    </g>}
    {visible('substrate') && <g {...pick('substrate','Substrate — continuous chip base')} transform={PLAN_TRANSFORM}>
      <path className="part-outline" d={SUBSTRATE_PLAN} fill={fill('substrate')} stroke="#657387" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>
      <path d={SUBSTRATE_PLAN} fill={finish('substrate')}/>
    </g>}
    {visible('ground') && <g {...pick('ground','Ground metal — openings expose the substrate')}>
      <g mask={fill('perforations')} data-detail="ground-perforations">
        {groundRegions({className:'part-outline',fill:fill('ground'),stroke:'#d7dce0',strokeWidth:.65,vectorEffect:'non-scaling-stroke'})}
        {groundRegions({fill:finish('ground')})}
      </g>
      <g clipPath={fill('substrate-clip')} data-detail="film-fanouts" fill={color('ground')} stroke={color('ground')}>
        <g transform={FILM_TRANSFORM}>
          {sides.map(side=><g key={side} transform={`rotate(${side*90})`}>
            {FILM_LAUNCHES.map((launch,i)=><g key={i}><rect x={launch.x-4.5} y="936" width="9" height="38" stroke="none"/><rect x={launch.x-3} y="904" width="6" height="14" stroke="none"/><polyline points={polygon(launch.points)} fill="none" strokeWidth={launch.width}/></g>)}
            <rect x="-895" y="890" width="1790" height="101" fill="none" strokeWidth="2"/>
          </g>)}
          {[-1,1].flatMap(x=>[-1,1].map(y=><g key={`${x},${y}`} fill="none" strokeWidth="2"><rect x={x*795-17} y={y*795-17} width="34" height="34"/><path d={`M${x*690-13} ${y*690}h26M${x*690} ${y*690-13}v26`}/></g>))}
        </g>
      </g>
      <g data-detail="bond-contacts" fill={BOND_FINISH.foot}>
        {sides.map(side=><g key={side} transform={`rotate(${-side*90} 500 310)`}>
          {Array.from({length:BOND_COUNT},(_,i)=>{const points=bondPoints(i,side).map(([x,,z])=>inspectionWorldPoint(x,z));return <g key={i}><polyline points={polygon(points)} fill="none" stroke={BOND_FINISH.wire} strokeWidth={.0023*world} strokeLinejoin="round"/>{[points[0],points[2]].map(([x,y],j)=><ellipse key={j} cx={x} cy={y} rx={.0032*world} ry={.0062*world}/>)}</g>;})}
        </g>)}
      </g>
    </g>}
    {visible('capacitor') && <g transform={PLAN_TRANSFORM}>
      {[['left',LEFT_ELECTRODE],['right',RIGHT_ELECTRODE]].map(([side,path])=><g key={side} {...pick('capacitor',`${side==='left'?'Left':'Right'} capacitor pad — charging energy`)} data-side={side}>
        <path className="part-outline" d={path} fill={fill('capacitor')} stroke="#e0e5e8" strokeWidth=".8" vectorEffect="non-scaling-stroke"/>
        <path d={path} fill={finish('capacitor')}/>
      </g>)}
    </g>}
    {visible('gate') && <g {...pick('gate','Charge gate — offset charge')} transform={PLAN_TRANSFORM}>
      <path className="part-outline" d={GATE_PLAN} fill={fill('gate')} stroke="#e0e4e6" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>
      <path d={GATE_PLAN} fill={finish('gate')}/><path d="M733 310H942" stroke="transparent" strokeWidth="28"/>
    </g>}
    {visible('junction') && <g {...pick('junction','Josephson junction — Josephson energy')} data-detail="junction-overlap">
      <polygon className="part-outline" points={polygon(JUNCTION_ELECTRODE.map(([x,y])=>inspectionWorldPoint(x,-y)))} fill={fill('junction')} stroke="#e6e8e9" strokeWidth=".45"/>
      <rect x={500-JUNCTION_OVERLAP.width*world/2} y={310+(JUNCTION_OVERLAP.z-JUNCTION_OVERLAP.depth/2)*world} width={JUNCTION_OVERLAP.width*world} height={JUNCTION_OVERLAP.depth*world} fill={JUNCTION_OVERLAP.color}/>
      <polygon className="part-outline" points={polygon(JUNCTION_ELECTRODE.map(([x,y])=>inspectionWorldPoint(-x,y+JUNCTION_OVERLAP.upperZ)))} fill={fill('junction')} stroke="#eef0f2" strokeWidth=".45"/>
      {detail&&<path d={`M${500-JUNCTION_OVERLAP.width*world/2} ${310+(JUNCTION_OVERLAP.z-JUNCTION_OVERLAP.depth/2)*world}h${JUNCTION_OVERLAP.width*world}`} stroke={JUNCTION_OVERLAP.color} strokeWidth=".7"/>}
      <rect className="junction-selection" x="482" y="298" width="36" height="26" rx="2" fill="none" stroke={selected==='junction'?'#2c9cff':'transparent'} strokeWidth=".8"/>
      <rect x="479" y="288" width="42" height="44" fill="transparent"/>
    </g>}
  </g>;
}
