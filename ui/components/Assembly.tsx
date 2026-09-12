'use client';

import { Edges, Line, RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, ExtrudeGeometry, Path, Shape, SRGBColorSpace, TubeGeometry, Vector3, Vector2, LatheGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ANCHORS, BOARD, CHIP, FRAME, GATE, GROUND, JUNCTION, PADS, PLATE } from '@/lib/chip-geometry';
import type { PartId } from '@/lib/parts';

export const ACCENT = '#1a6fe0';

/** Illustrative appearance only. None of these values enter the calculation. */
const MAT = {
  gold: { color: '#e8b756', metalness: 1, roughness: 0.32 },
  goldDeep: { color: '#ac7e32', metalness: 1, roughness: 0.39 },
  graphite: { color: '#8b8880', metalness: 0.95, roughness: 0.40 },
  teal: { color: '#124355', metalness: 0.08, roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.45 },
  chip: { color: '#07111c', metalness: 0.0, roughness: 0.34, clearcoat: 0, clearcoatRoughness: 0.15 },
  silver: { color: '#c3c8cd', metalness: 0.98, roughness: 0.48 },
  screw: { color: '#e2b65e', metalness: 1, roughness: 0.24 },
  black: { color: '#0e1114', metalness: 0.2, roughness: 0.8 },
} as const;

type MatKind = keyof typeof MAT;

// Brushed metal microfinish, not a decorative repeating pattern. All fine marks are
// deterministic and restrained so grazing reflections reveal machining without glitter.
const finishes = new Map<string, CanvasTexture>();
function surfaceFinish(kind: MatKind) {
  if (typeof document === 'undefined') return undefined;
  const cached = finishes.get(kind); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
  ctx.fillStyle = '#bcbcbc'; ctx.fillRect(0, 0, 2048, 2048);
  for (let y = 0; y < 2048; y++) {
    const shade = Math.round(179 + 8 * Math.sin(y * 0.028) + 7 * Math.sin(y * 0.73));
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`; ctx.fillRect(0,y,2048,1);
  }
  let seed = 37;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Fine tool travel and overlapping cutter sweeps modulate the reflected light.
  for (let i = 0; i < 48000; i++) {
    const shade = 90 + random() * 150;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.15 + random() * 0.3})`;
    ctx.lineWidth = 0.5 + random();
    const x = random() * 2048, y = random() * 2048;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + random() * 100, y + random() * 0.6); ctx.stroke();
  }
  if (kind === 'gold' || kind === 'goldDeep') {
    for (let row = -1; row < 11; row++) for (let col = -1; col < 11; col++) {
      for (let ring = 0; ring < 36; ring++) {
        ctx.strokeStyle = ring % 3 === 0 ? 'rgba(75,75,75,0.11)' : 'rgba(235,235,235,0.12)';
        ctx.lineWidth = 0.85; ctx.beginPath();
        ctx.arc(col * 220 + row * 27, row * 210, 40 + ring * 3.5, -2.7, 1.2); ctx.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas); texture.anisotropy = 16;
  finishes.set(kind, texture); return texture;
}

function Material({ kind, selected }: { kind: MatKind; selected: boolean }) {
  const metal = !['teal', 'chip', 'black'].includes(kind);
  return <meshPhysicalMaterial {...MAT[kind]} envMapIntensity={kind === 'chip' ? 0.15 : kind === 'gold' || kind === 'goldDeep' ? 1.65 : 1} specularIntensity={kind === 'chip' ? 0.15 : kind === 'gold' || kind === 'goldDeep' ? 1.65 : 1}
    bumpMap={metal ? surfaceFinish(kind) : undefined}
    roughnessMap={metal ? surfaceFinish(kind) : undefined}
    bumpScale={kind === 'silver' ? 0.00012 : 0.00055}
    anisotropy={metal ? 0.45 : 0}
    emissive={selected ? ACCENT : '#000000'} emissiveIntensity={selected ? 0.045 : 0} />;
}

function roundedRect(size: number, r: number): Shape {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

function ringGeometry(outer: number, inner: number, depth: number, bevel: number, radius: number): ExtrudeGeometry {
  const shape = roundedRect(outer - 2 * bevel, radius);
  const hole = roundedRect(inner + 2 * bevel, radius * 0.5);
  shape.holes.push(hole as unknown as Path);
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // ExtrudeGeometry emits world-space cap UVs. Normalize the negative half as well,
  // otherwise clamped sampling leaves half of the metal completely untextured.
  const uv = geometry.getAttribute('uv');
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / outer + 0.5, positions.getY(i) / outer + 0.5);
  return geometry;
}

/** Extruded shape laid flat: local +z becomes world +y, `top` is the y of the upper bevel face. */
function Slab({
  geometry,
  top,
  depth,
  bevel,
  kind,
  selected,
}: {
  geometry: ExtrudeGeometry;
  top: number;
  depth: number;
  bevel: number;
  kind: MatKind;
  selected: boolean;
}) {
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={top - depth + bevel} castShadow receiveShadow>
      <Material kind={kind} selected={selected} />
      {selected && <Edges color={ACCENT} threshold={30} lineWidth={1.2} />}
    </mesh>
  );
}

interface Bore { x: number; z: number; r: number }
function bore(x: number, z: number, r: number): Path {
  const hole = new Path(); hole.absarc(x, -z, r, 0, Math.PI * 2, true); return hole;
}
function roundedPanel(w: number, h: number, r: number): Shape {
  const x = w / 2, y = h / 2, shape = new Shape();
  shape.moveTo(-x + r, -y); shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r); shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y); shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r); shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y); return shape;
}
function metalExtrusion(shape: Shape, depth: number, bevel: number, w: number, h: number) {
  const geometry = new ExtrudeGeometry(shape, {depth: depth - 2 * bevel, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 40});
  const uv = geometry.getAttribute('uv'), pos = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geometry;
}

/** A real recessed hex socket, bevelled head and turned countersink. */
function Screw({ position, r = 0.056 }: { position: [number, number, number]; r?: number }) {
  const head = useMemo(() => {
    const shape = new Shape(); shape.absarc(0, 0, r * 0.78, 0, Math.PI * 2, false);
    const socket = new Path();
    for (let i = 0; i < 6; i++) {
      const a = -i * Math.PI / 3, x = Math.cos(a) * r * 0.34, y = Math.sin(a) * r * 0.34;
      if (i === 0) socket.moveTo(x, y); else socket.lineTo(x, y);
    }
    socket.closePath(); shape.holes.push(socket);
    return metalExtrusion(shape, 0.012, 0.0015, r * 2, r * 2);
  }, [r]);
  const seat = useMemo(() => new LatheGeometry([
    new Vector2(r * 1.12, -0.002), new Vector2(r * 1.12, 0.001),
    new Vector2(r, 0.005), new Vector2(r * 0.83, 0.001),
    new Vector2(r * 0.80, -0.009), new Vector2(r * 0.78, -0.013),
  ], 48), [r]);
  return <group position={position}>
    <mesh geometry={seat} receiveShadow><meshPhysicalMaterial {...MAT.screw} /></mesh>
    <mesh position-y={-0.011} rotation-x={-Math.PI / 2} geometry={head} castShadow receiveShadow>
      <Material kind="gold" selected={false} />
    </mesh>
    <mesh position-y={-0.014}><cylinderGeometry args={[r * 0.78, r * 0.78, 0.004, 32]} />
      <meshStandardMaterial color="#100c06" roughness={0.65} metalness={0.55} /></mesh>
  </group>;
}

function ThreadedPort({ position, r = 0.035 }: { position: [number, number, number]; r?: number }) {
  const geometry = useMemo(() => new LatheGeometry([
    new Vector2(r * 1.25, 0), new Vector2(r * 1.06, 0.004), new Vector2(r * 0.84, -0.003),
    new Vector2(r * 0.80, -0.029), new Vector2(r * 0.93, -0.032), new Vector2(r * 1.18, -0.002),
  ], 40), [r]);
  return <group position={position}>
    <mesh geometry={geometry} castShadow receiveShadow><meshPhysicalMaterial {...MAT.screw} /></mesh>
    {[0, 1, 2].map(i => <mesh key={i} position-y={-0.008 - i * 0.006} rotation-x={-Math.PI / 2}>
      <torusGeometry args={[r * 0.8, 0.0013, 5, 32]} /><meshPhysicalMaterial {...MAT.goldDeep} />
    </mesh>)}
    <mesh position-y={-0.033}><cylinderGeometry args={[r * 0.81, r * 0.81, 0.002, 32]} />
      <meshStandardMaterial color="#080705" roughness={0.75} /></mesh>
  </group>;
}

function RailMark({ sign }: { sign: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 96;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.clearRect(0, 0, 1024, 96); ctx.fillStyle = '#3f3b32'; ctx.font = '32px monospace';
    ctx.textAlign = 'center'; ctx.fillText(sign > 0 ? 'QUBIT STUDIO  /  01' : 'TRANSMON  /  ILLUSTRATIVE', 512, 60);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 8; return map;
  }, [sign]);
  return <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
    <planeGeometry args={[0.9, 0.075]} /><meshStandardMaterial color="#686051" map={texture ?? undefined}
      transparent depthWrite={false} roughness={0.85} polygonOffset polygonOffsetFactor={-1} />
  </mesh>;
}

/** Lithographic fan-outs and perimeter bond pads. Decorative, not solver geometry. */
function useGroundTexture(): CanvasTexture | null {
  return useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 2048);
    ctx.translate(1024, 1024); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
    for (let side = 0; side < 4; side++) {
      ctx.save(); ctx.rotate(side * Math.PI / 2);
      for (let i = 0; i < 64; i++) {
        const t = (i / 63 - 0.5), x = t * 1740;
        ctx.fillRect(x - 4.5, 936, 9, 38);
        ctx.fillRect(x - 3, 904, 6, 14);
        // Parallel launch, 45-degree shoulder, then a tapered inner fan.
        const shoulder = 760 - Math.abs(t) * 200;
        const innerX = t * 910, innerY = 405 + Math.abs(t) * 90;
        ctx.lineWidth = i % 8 === 0 ? 2.5 : 1.7;
        ctx.beginPath(); ctx.moveTo(x, 931); ctx.lineTo(x, shoulder);
        ctx.lineTo(innerX, innerY); ctx.lineTo(innerX, innerY - 32); ctx.stroke();
      }
      ctx.lineWidth = 2; ctx.strokeRect(-895, 890, 1790, 101);
      ctx.restore();
    }
    // Discrete structures in the open corners, with registration crosses.
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      ctx.lineWidth = 2; ctx.strokeRect(x * 795 - 17, y * 795 - 17, 34, 34);
      ctx.beginPath(); ctx.moveTo(x * 690 - 13,y * 690); ctx.lineTo(x * 690 + 13,y * 690);
      ctx.moveTo(x * 690,y * 690 - 13); ctx.lineTo(x * 690,y * 690 + 13); ctx.stroke();
    }
    const texture = new CanvasTexture(canvas); texture.anisotropy = 16; return texture;
  }, []);
}

export interface PartProps {
  id: PartId;
  selected: boolean;
  hidden: boolean;
  /** Smoothed 0..1 separation. */
  explode: number;
  onSelect?: (id: PartId) => void;
  /** Explode guides are drawn only in the main scene. */
  guides?: boolean;
}

function PartGroup({
  id,
  explodeY,
  explode,
  hidden,
  onSelect,
  guides,
  children,
}: {
  id: PartId;
  explodeY: number;
  explode: number;
  hidden: boolean;
  onSelect?: (id: PartId) => void;
  guides?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  const anchor = ANCHORS[id].point;
  const y = explodeY * explode;
  return (
    <>
      <group
        position-y={y}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!onSelect || event.delta > 4) return;
          event.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(event) => {
          if (!onSelect) return;
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (onSelect) document.body.style.cursor = '';
        }}
      >
        {children}
      </group>
      {guides && Math.abs(y) > 0.002 && (
        <Line
          points={[
            [anchor[0], anchor[1], anchor[2]],
            [anchor[0], anchor[1] + y, anchor[2]],
          ]}
          color="#7c8792"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.02}
        />
      )}
    </>
  );
}

const BEVEL = 0.014;
const FRAME_BORES: Bore[] = [
  ...[-1, 1].flatMap(x => [-1, 1].map(z => ({x: x * 1.095, z: z * 1.095, r: 0.082}))),
  ...[-1, 1].flatMap(side => [-0.52, 0.52].flatMap(t => [
    {x: t, z: side * 1.169, r: 0.046}, {x: side * 1.169, z: t, r: 0.046},
  ])),
];

export function Package({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  const frame = useMemo(() => {
    const shape = roundedRect(FRAME.outer - 2 * BEVEL, 0.18);
    shape.holes.push(roundedRect(FRAME.inner + 2 * BEVEL, 0.23));
    FRAME_BORES.forEach(p => shape.holes.push(bore(p.x, p.z, p.r + BEVEL)));
    return metalExtrusion(shape, 0.14, BEVEL, FRAME.outer, FRAME.outer);
  }, []);
  const seam = useMemo(() => ringGeometry(2.458, 2.13, 0.010, 0.002, 0.18), []);
  const lowerRim = useMemo(() => ringGeometry(2.49, 2.13, 0.072, 0.008, 0.18), []);
  const innerStep = useMemo(() => ringGeometry(2.18, 2.095, 0.02, 0.004, 0.22), []);
  const plate = useMemo(() => {
    const shape = roundedRect(PLATE.size - 0.014, 0.045);
    shape.holes.push(roundedRect(PLATE.window + 0.014, 0.05));
    // Auxiliary milled pockets: recess walls are geometry, their floors are below the lid.
    const pocket = roundedPanel(0.20, 0.31, 0.035);
    const path = new Path(pocket.getPoints().map(p => p.add(new Vector2(0.755, 0.27))));
    shape.holes.push(path);
    const small = roundedPanel(0.12, 0.20, 0.024);
    shape.holes.push(new Path(small.getPoints().map(p => p.add(new Vector2(-0.77, -0.26)))));
    for (const x of [-0.84, 0.84]) for (const z of [-0.66, 0.66]) shape.holes.push(bore(x, z, 0.030));
    return metalExtrusion(shape, PLATE.depth, 0.007, PLATE.size, PLATE.size);
  }, []);
  const lip = useMemo(() => ringGeometry(PLATE.window + 0.085, PLATE.window - 0.035, 0.027, 0.003, 0.05), []);
  const rail = useMemo(() => {
    const shape = roundedPanel(1.78, 0.225, 0.06);
    for (const x of [-0.70, 0.70]) shape.holes.push(bore(x, 0, 0.076));
    return metalExtrusion(shape, 0.042, 0.006, 1.78, 0.225);
  }, []);
  const railY = PLATE.top + 0.049;
  const railOffset = PLATE.size / 2 - 0.12;
  return <>
    <PartGroup id="package" explodeY={FRAME.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      <Slab geometry={frame} top={FRAME.top} depth={0.14} bevel={BEVEL} kind="gold" selected={selected} />
      <Slab geometry={seam} top={FRAME.top - 0.14} depth={0.010} bevel={0.002} kind="black" selected={false} />
      <Slab geometry={lowerRim} top={FRAME.top - 0.148} depth={0.072} bevel={0.008} kind="goldDeep" selected={selected} />
      <Slab geometry={innerStep} top={FRAME.top - 0.028} depth={0.02} bevel={0.004} kind="goldDeep" selected={selected} />
      {FRAME_BORES.map((p, i) => i < 4
        ? <Screw key={i} position={[p.x, FRAME.top - 0.002, p.z]} r={0.074} />
        : <ThreadedPort key={i} position={[p.x, FRAME.top - 0.001, p.z]} r={0.042} />)}
    </PartGroup>
    <PartGroup id="package" explodeY={PLATE.explodeY} explode={explode} hidden={hidden} onSelect={onSelect}>
      <Slab geometry={lip} top={PLATE.top - 0.016} depth={0.027} bevel={0.003} kind="goldDeep" selected={false} />
      <LidDetails />
      <Slab geometry={plate} top={PLATE.top} depth={PLATE.depth} bevel={0.007} kind="graphite" selected={selected} />
      {[-1, 1].map(sign => <group key={sign} position={[0, railY, sign * railOffset]}>
        <RoundedBox args={[1.72, 0.018, 0.198]} position-y={-0.053} radius={0.012} smoothness={4} castShadow>
          <meshPhysicalMaterial color="#4d493e" metalness={0.8} roughness={0.48} />
        </RoundedBox>
        <Slab geometry={rail} top={0} depth={0.042} bevel={0.006} kind="gold" selected={selected} />
        {[-0.70, 0.70].map(x => <Screw key={x} position={[x, -0.001, 0]} r={0.061} />)}
        <RailMark sign={sign} />
      </group>)}
      {[-0.84, 0.84].flatMap(x => [-0.66, 0.66].map(z => <ThreadedPort key={`${x},${z}`} position={[x, PLATE.top, z]} r={0.020} />))}
      {/* Dark ceramic inserts below the machined top edges, with asymmetric contact pads. */}
      {[[0.755, -0.27, 0.19, 0.30], [-0.77, 0.26, 0.115, 0.195]].map(([x, z, w, d]) => <group key={x} position={[x, PLATE.top - 0.027, z]}>
        <RoundedBox args={[w, 0.018, d]} radius={0.016} smoothness={4} receiveShadow><meshPhysicalMaterial {...MAT.black} /></RoundedBox>
        <RoundedBox args={[w * 0.54, 0.008, d * 0.42]} position-y={0.012} radius={0.004} smoothness={3}>
          <meshPhysicalMaterial color="#67717a" metalness={0.9} roughness={0.33} />
        </RoundedBox>
        {[-1, 1].map(sign => <mesh key={sign} position={[0, 0.012, sign * d * 0.37]}>
          <boxGeometry args={[w * 0.32, 0.006, 0.016]} /><meshPhysicalMaterial {...MAT.goldDeep} />
        </mesh>)}
      </group>)}
    </PartGroup>
  </>;
}

function LidDetails() {
  const lands = useMemo(() => {
    const pieces = [];
    for (let side = 0; side < 4; side++) for (let i = 0; i < 46; i++) {
      const pad = new BoxGeometry(0.009, 0.002, 0.043);
      pad.translate((-0.47 + i * 0.94 / 45) * 1.05, PLATE.top + 0.001, PLATE.window / 2 + 0.040);
      pad.rotateY(side * Math.PI / 2); pieces.push(pad);
    }
    const geometry = mergeGeometries(pieces); pieces.forEach(g => g.dispose()); return geometry;
  }, []);
  const engraving = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.clearRect(0,0,2048,2048); ctx.strokeStyle = '#454943'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.roundRect(342,342,1364,1364,65); ctx.stroke();
    ctx.strokeStyle = '#b8b6ac'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(345,345,1358,1358,63); ctx.stroke();
    ctx.fillStyle = '#42443d'; ctx.font = '15px monospace';
    ctx.save(); ctx.translate(230,1090); ctx.rotate(-Math.PI/2); ctx.fillText('SHIELD 01   /   Al 6061   /   QS',0,0); ctx.restore();
    ctx.save(); ctx.translate(1805,770); ctx.rotate(Math.PI/2); ctx.fillText('CRYOGENIC PACKAGE   •   ILLUSTRATIVE',0,0); ctx.restore();
    for (const x of [275,1773]) for (const y of [440,1608]) {
      ctx.fillRect(x-9,y,18,1.5); ctx.fillRect(x,y-9,1.5,18);
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 16; return map;
  }, []);
  return <>
    <mesh geometry={lands}><meshPhysicalMaterial color="#d4b373" roughness={0.3} metalness={1}/></mesh>
    <mesh position-y={PLATE.top + 0.0003} rotation-x={-Math.PI/2}>
      <planeGeometry args={[PLATE.size,PLATE.size]}/><meshStandardMaterial map={engraving} transparent depthWrite={false} roughness={0.65} polygonOffset polygonOffsetFactor={-1}/>
    </mesh>
  </>;
}

export function Board({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  const pads = useMemo(() => {
    const pieces = [];
    const ring = BOARD.size / 2 - 0.075;
    for (let side = 0; side < 4; side++) for (let i = 0; i < 44; i++) {
      const pad = new BoxGeometry(0.08, 0.004, 0.010);
      pad.translate(ring, BOARD.top + 0.003, -0.76 + i * 1.52 / 43);
      pad.rotateY(side * Math.PI / 2); pieces.push(pad);
    }
    const geometry = mergeGeometries(pieces); pieces.forEach(p => p.dispose()); return geometry;
  }, []);
  return (
    <PartGroup id="board" explodeY={BOARD.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      <mesh castShadow receiveShadow position-y={BOARD.top - BOARD.thickness / 2}>
        <boxGeometry args={[BOARD.size, BOARD.thickness, BOARD.size]} />
        <Material kind="teal" selected={selected} />
        {selected && <Edges color={ACCENT} lineWidth={1.2} />}
      </mesh>
      <BoardContacts />
      <mesh geometry={pads} receiveShadow><meshPhysicalMaterial {...MAT.goldDeep} /></mesh>
      <BoardHardware />
      <BoardArtwork />

    </PartGroup>
  );
}

function BoardArtwork() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#103b46'; ctx.fillRect(0, 0, 2048, 2048); ctx.translate(1024, 1024);
    for (let side = 0; side < 4; side++) {
      ctx.save(); ctx.rotate(side * Math.PI / 2);
      for (let i = 0; i < 72; i++) {
        const x = -850 + i * 1700 / 71, inner = x * 0.57;
        ctx.strokeStyle = i % 5 === 0 ? '#476455' : '#27505a'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(x, 972); ctx.lineTo(x, 805 - Math.abs(x) * 0.16);
        ctx.lineTo(inner, 530); ctx.lineTo(inner, 450); ctx.stroke();
        ctx.fillStyle = '#b39c60'; ctx.fillRect(x - 3, 935, 6, 20);
        for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x, 890 - j * 21, 3, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = '#acb8ad'; ctx.font = '15px monospace'; ctx.fillText('QS-01   •   RF / DC    REV A', -190, 967);
      for (const x of [-810, 810]) { ctx.lineWidth = 2; ctx.strokeStyle = '#93a89c';
        ctx.strokeRect(x - 22, 810, 44, 55); ctx.fillText('+',x - 5, 887); }
      ctx.restore();
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 16; return map;
  }, []);
  const components = useMemo(() => {
    const bodies = [], terminals = [];
    for (let side = 0; side < 4; side++) for (let i = 0; i < 24; i++) {
      const t = -0.80 + i * 1.60 / 23;
      const body = new BoxGeometry(0.026, 0.016, 0.012);
      body.translate(1.009, BOARD.top + 0.013, t); body.rotateY(side * Math.PI / 2); bodies.push(body);
      for (const end of [-1,1]) { const terminal = new BoxGeometry(0.007,0.018,0.014);
        terminal.translate(1.009 + end * 0.013, BOARD.top + 0.013, t);
        terminal.rotateY(side * Math.PI / 2); terminals.push(terminal); }
    }
    const body = mergeGeometries(bodies), terminal = mergeGeometries(terminals);
    [...bodies,...terminals].forEach(g => g.dispose()); return {body,terminal};
  }, []);
  return <>
    <mesh position-y={BOARD.top + 0.0006} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[BOARD.size,BOARD.size]} /><meshPhysicalMaterial map={texture} roughness={0.56} metalness={0.1} />
    </mesh>
    <mesh geometry={components.body} castShadow><meshPhysicalMaterial color="#292c29" roughness={0.6} /></mesh>
    <mesh geometry={components.terminal}><meshPhysicalMaterial color="#aab0b2" metalness={0.95} roughness={0.25} /></mesh>
  </>;
}

function BoardHardware() {
  const vias = useMemo(() => {
    const rings = [];
    for (let side = 0; side < 4; side++) for (let i = 0; i < 26; i++) {
      const ring = new TorusGeometry(0.008, 0.002, 5, 12);
      ring.rotateX(-Math.PI / 2); ring.translate(1.045, BOARD.top + 0.003, -0.74 + i * 1.48 / 25);
      ring.rotateY(side * Math.PI / 2); rings.push(ring);
    }
    const geometry = mergeGeometries(rings); rings.forEach(g => g.dispose()); return geometry;
  }, []);
  return <>
    <mesh geometry={vias}><meshPhysicalMaterial {...MAT.gold} /></mesh>
    {[-1, 1].flatMap(x => [-1, 1].map(z => <group key={`${x},${z}`} position={[x * 0.974, BOARD.top + 0.013, z * 0.974]}>
      <ThreadedPort position={[0, 0, 0]} r={0.025} />
      <mesh rotation-x={-Math.PI / 2} position={[x * -0.025, -0.009, z * -0.050]}>
        <planeGeometry args={[0.056, 0.002]} /><meshBasicMaterial color="#9baeb6" />
      </mesh>
    </group>))}
  </>;
}

export function Substrate({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  return (
    <PartGroup id="substrate" explodeY={CHIP.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      <mesh castShadow receiveShadow position-y={-CHIP.thickness / 2}>
        <boxGeometry args={[CHIP.size, CHIP.thickness, CHIP.size]} />
        <Material kind="chip" selected={selected} />
        {selected && <Edges color={ACCENT} lineWidth={1.2} />}
      </mesh>
    </PartGroup>
  );
}

function BondWires() {
  const geometry = useMemo(() => {
    const wires = [];
    for (let side = 0; side < 4; side++) for (let i = 0; i < 46; i++) {
      const t = -0.47 + i * 0.94 / 45;
      const curve = new CatmullRomCurve3([
        new Vector3(t, 0.008, CHIP.size / 2 - 0.022),
        new Vector3(t * 1.015, 0.081 + (i % 3) * 0.003, CHIP.size / 2 + 0.026),
        new Vector3(t * 1.05, PLATE.top + 0.003, PLATE.window / 2 + 0.028),
      ]);
      const wire = new TubeGeometry(curve, 12, 0.0021, 6, false);
      wire.rotateY(side * Math.PI / 2); wires.push(wire);
    }
    const merged = mergeGeometries(wires); wires.forEach(g => g.dispose()); return merged;
  }, []);
  return <mesh geometry={geometry} castShadow><meshPhysicalMaterial color="#e8c57b" metalness={1} roughness={0.24} /></mesh>;
}

function BoardContacts() {
  const geometry = useMemo(() => {
    const pieces = [];
    for (let side = 0; side < 4; side++) for (let row = 0; row < 3; row++) for (let i = 0; i < 28; i++) {
      const piece = new BoxGeometry(0.013, 0.006, 0.018);
      piece.translate(-0.56 + i * 0.042, BOARD.top + 0.007, 1.014 + row * 0.021);
      piece.rotateY(side * Math.PI / 2); pieces.push(piece);
    }
    const merged = mergeGeometries(pieces); pieces.forEach(g => g.dispose()); return merged;
  }, []);
  return <mesh geometry={geometry}><meshPhysicalMaterial {...MAT.gold} /></mesh>;
}

export function Ground({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  const texture = useGroundTexture();
  return (
    <PartGroup id="ground" explodeY={GROUND.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      <BondWires />
      <mesh rotation-x={-Math.PI / 2} position-y={0.0015} receiveShadow>
        <planeGeometry args={[GROUND.size, GROUND.size]} />
        <meshPhysicalMaterial
          color="#c9ae6b"
          alphaMap={texture ?? undefined}
          transparent
          alphaTest={0.08}
          metalness={0.96}
          roughness={0.32}
          emissive={selected ? ACCENT : '#000000'}
          emissiveIntensity={selected ? 0.1 : 0}
        />
      </mesh>
    </PartGroup>
  );
}

export function Capacitor({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  return (
    <PartGroup id="capacitor" explodeY={PADS.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox
            args={[PADS.width, PADS.height, PADS.depth]}
            radius={0.006}
            smoothness={3}
            position={[s * PADS.offsetX, PADS.height / 2, 0]}
            castShadow
            receiveShadow
          >
            <Material kind="silver" selected={selected} />
            {selected && <Edges color={ACCENT} threshold={40} lineWidth={1.2} />}
          </RoundedBox>
          <mesh position={[s * 0.062, 0.004, 0]} castShadow>
            <boxGeometry args={[0.05, 0.008, 0.03]} />
            <Material kind="silver" selected={selected} />
          </mesh>
        </group>
      ))}
    </PartGroup>
  );
}

function electrodeGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.034, -0.011); shape.lineTo(-0.003, -0.011);
  shape.lineTo(-0.003, -0.005); shape.lineTo(0.013, -0.005);
  shape.lineTo(0.013, 0.007); shape.lineTo(-0.034, 0.007); shape.closePath();
  return new ExtrudeGeometry(shape, {depth:0.005, bevelEnabled:true, bevelSize:0.0004, bevelThickness:0.0004, bevelSegments:2});
}

export function Junction({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  const electrode = useMemo(() => electrodeGeometry(), []);
  return (
    <PartGroup id="junction" explodeY={JUNCTION.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      {/* two overlapping electrodes with the thin barrier reading as a gold seam */}
      <mesh geometry={electrode} rotation-x={-Math.PI / 2} position={[0, 0.009, 0]} castShadow>
        <Material kind="silver" selected={selected} />
        {selected && <Edges color={ACCENT} lineWidth={1.2} />}
      </mesh>
      <mesh position={[0, 0.0145, 0.002]}>
        <boxGeometry args={[0.024, 0.0014, 0.022]} />
        <Material kind="gold" selected={selected} />
      </mesh>
      <mesh geometry={electrode} rotation={[-Math.PI / 2, 0, Math.PI]} position={[0, 0.016, 0.003]} castShadow>
        <Material kind="silver" selected={selected} />
        {selected && <Edges color={ACCENT} lineWidth={1.2} />}
      </mesh>
      {/* Invisible hit volume so the tiny junction can be clicked. Excluded from framing bounds. */}
      <mesh position={[0, 0.03, 0]} userData={{ hit: true }}>
        <boxGeometry args={[0.16, 0.06, 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </PartGroup>
  );
}

export function Gate({ selected, hidden, explode, onSelect, guides }: Omit<PartProps, 'id'>) {
  const length = GATE.to - GATE.from;
  return (
    <PartGroup id="gate" explodeY={GATE.explodeY} explode={explode} hidden={hidden} onSelect={onSelect} guides={guides}>
      <mesh position={[(GATE.from + GATE.to) / 2, 0.004, 0]} castShadow>
        <boxGeometry args={[length, 0.008, 0.03]} />
        <Material kind="gold" selected={selected} />
        {selected && <Edges color={ACCENT} lineWidth={1.2} />}
      </mesh>
      <mesh position={[GATE.to - 0.006, 0.004, 0]} castShadow>
        <boxGeometry args={[0.012, 0.008, 0.14]} />
        <Material kind="gold" selected={selected} />
      </mesh>
      {/* Hit volume for the thin trace. */}
      <mesh position={[(GATE.from + GATE.to) / 2, 0.02, 0]} userData={{ hit: true }}>
        <boxGeometry args={[length + 0.04, 0.05, 0.16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </PartGroup>
  );
}

const BUILDERS: Record<PartId, (p: Omit<PartProps, 'id'>) => React.JSX.Element> = {
  package: Package,
  board: Board,
  substrate: Substrate,
  ground: Ground,
  capacitor: Capacitor,
  junction: Junction,
  gate: Gate,
};

export const PART_ORDER: PartId[] = ['package', 'board', 'substrate', 'ground', 'capacitor', 'junction', 'gate'];

/** One part's meshes; shared by the main scene and the inspector detail preview. */
export function PartMeshes(props: PartProps) {
  const Builder = BUILDERS[props.id];
  return <Builder {...props} />;
}
