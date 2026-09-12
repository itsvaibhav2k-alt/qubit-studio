'use client';

import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, Line, OrbitControls } from '@react-three/drei';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';
import {
  capacitorAreaFromEc,
  DEFAULT_GEOMETRY_ASSUMPTIONS,
  junctionAreaFromEj,
} from '@/lib/geometry-model';
import { DEFAULT_PARAMS } from '@/lib/params';
import type { DeviceParams } from '@/lib/types';

export interface ViewportHandle {
  resetView: () => void;
}

interface SolidProps {
  id: PartId;
  size: [number, number, number];
  position: [number, number, number];
  explodeY: number;
  explode: number;
  selected: boolean;
  hidden: boolean;
  metal: boolean;
  onSelect: (id: PartId) => void;
  color?: string;
}

const ACCENT = '#1a6fe0';

function Solid({
  id,
  size,
  position,
  explodeY,
  explode,
  selected,
  hidden,
  metal,
  onSelect,
  color,
}: SolidProps) {
  const part = PART_BY_ID[id];
  const y = position[1] + explodeY * explode;

  if (hidden) return null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(id);
  };

  return (
    <group>
      <mesh
        position={[position[0], y, position[2]]}
        onClick={handleClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={selected ? '#cfe0f8' : (color ?? part.color)}
          metalness={metal ? 0.55 : 0.05}
          roughness={metal ? 0.35 : 0.85}
          emissive={selected ? ACCENT : '#000000'}
          emissiveIntensity={selected ? 0.22 : 0}
        />
        <Edges
          linewidth={selected ? 2.4 : 1}
          threshold={18}
          color={selected ? ACCENT : '#4a545f'}
        />
      </mesh>
      {explode > 0.001 && (
        <Line
          points={[
            [position[0], position[1], position[2]],
            [position[0], y, position[2]],
          ]}
          color="#8b96a3"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.02}
        />
      )}
    </group>
  );
}

/** Radius of a sphere containing the assembled chip, with margin for exploded parts. */
const SCENE_RADIUS = 1.2;

/**
 * Keeps the whole chip framed when the canvas changes size — switching to Split
 * halves the width, and a frustum sized for the full width clips the object.
 * Only the camera distance changes, so the current orbit orientation survives.
 */
function FitToViewport() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    if (size.width < 2 || size.height < 2 || !('isPerspectiveCamera' in camera)) return;
    const aspect = size.width / size.height;
    const vertical = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distance = SCENE_RADIUS / Math.sin(Math.min(vertical, horizontal) / 2);
    const target = controls?.target ?? new Vector3();
    const direction = camera.position.clone().sub(target);
    if (direction.lengthSq() === 0) return;
    camera.position.copy(target).add(direction.setLength(distance));
    camera.updateProjectionMatrix();
    controls?.update();
  }, [size.width, size.height, camera, controls]);

  return null;
}

interface SceneProps {
  params: DeviceParams;
  selected: PartId | null;
  hiddenParts: PartId[];
  explode: number;
  onSelect: (id: PartId) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  materialColors: Partial<Record<PartId, string>>;
}

/** Illustrative chip geometry. Dimensions are exaggerated for legibility. */
function Scene({ params, selected, hiddenParts, explode, onSelect, controlsRef, materialColors }: SceneProps) {
  const hidden = (id: PartId) => hiddenParts.includes(id);
  const common = { explode, onSelect, selected: false, hidden: false, metal: true };
  const referenceJunctionArea = junctionAreaFromEj(
    DEFAULT_PARAMS.ej_ghz,
    DEFAULT_GEOMETRY_ASSUMPTIONS.criticalCurrentDensityAcm2,
  );
  const junctionArea = junctionAreaFromEj(
    params.ej_ghz,
    DEFAULT_GEOMETRY_ASSUMPTIONS.criticalCurrentDensityAcm2,
  );
  const junctionScale = Math.min(1.8, Math.max(0.55, Math.sqrt(junctionArea / referenceJunctionArea)));
  const referenceCapacitorArea = capacitorAreaFromEc(
    DEFAULT_PARAMS.ec_ghz,
    DEFAULT_GEOMETRY_ASSUMPTIONS.capacitanceDensityFfUm2,
  );
  const capacitorArea = capacitorAreaFromEc(
    params.ec_ghz,
    DEFAULT_GEOMETRY_ASSUMPTIONS.capacitanceDensityFfUm2,
  );
  const capacitorScale = Math.min(1.35, Math.max(0.7, Math.sqrt(capacitorArea / referenceCapacitorArea)));
  const padWidth = 0.34 * capacitorScale;
  const padPosition = padWidth / 2 + 0.03;

  const groundBars: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [1.42, 0.02, 0.18], position: [0, -0.012, -0.44] },
    { size: [1.42, 0.02, 0.18], position: [0, -0.012, 0.44] },
    { size: [0.28, 0.02, 0.28], position: [-0.57, -0.012, 0.21] },
    { size: [0.28, 0.02, 0.28], position: [-0.57, -0.012, -0.21] },
    { size: [0.28, 0.02, 0.62], position: [0.57, -0.012, 0] },
  ];

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[2.5, 3.5, 2]} intensity={1.5} />
      <directionalLight position={[-2, 1.5, -2.5]} intensity={0.5} />

      <Solid
        {...common}
        id="substrate"
        size={[1.62, 0.07, 1.18]}
        position={[0, -0.058, 0]}
        explodeY={-0.16}
        metal={false}
        selected={selected === 'substrate'}
        hidden={hidden('substrate')}
        color={materialColors.substrate}
      />

      {groundBars.map((bar, index) => (
        <Solid
          {...common}
          key={`ground-${index}`}
          id="ground"
          size={bar.size}
          position={bar.position}
          explodeY={0.1}
          selected={selected === 'ground'}
          hidden={hidden('ground')}
          color={materialColors.ground}
        />
      ))}

      {[-padPosition, padPosition].map((x) => (
        <Solid
          {...common}
          key={`pad-${x}`}
          id="capacitor"
          size={[padWidth, 0.028, 0.52 * capacitorScale]}
          position={[x, 0.002, 0]}
          explodeY={0.26}
          selected={selected === 'capacitor'}
          hidden={hidden('capacitor')}
          color={materialColors.capacitor}
        />
      ))}

      <Solid
        {...common}
        id="junction"
        size={[0.07 * junctionScale, 0.034, 0.06 * junctionScale]}
        position={[0, 0.005, 0]}
        explodeY={0.42}
        selected={selected === 'junction'}
        hidden={hidden('junction')}
        color={materialColors.junction}
      />

      <Solid
        {...common}
        id="gate"
        size={[0.33, 0.022, 0.06]}
        position={[-0.585, -0.001, 0]}
        explodeY={0.26}
        selected={selected === 'gate'}
        hidden={hidden('gate')}
        color={materialColors.gate}
      />

      <FitToViewport />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableZoom
        enableDamping={false}
        minDistance={0.7}
        maxDistance={6}
      />
    </>
  );
}

interface Viewport3DProps extends Omit<SceneProps, 'controlsRef'> {
  onClearSelection: () => void;
  handleRef: React.RefObject<ViewportHandle | null>;
}

export default function Viewport3D({
  params,
  selected,
  hiddenParts,
  explode,
  onSelect,
  onClearSelection,
  handleRef,
  materialColors,
}: Viewport3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [rendererKey, setRendererKey] = useState(0);

  useImperativeHandle(handleRef, () => ({
    resetView: () => controlsRef.current?.reset(),
  }));

  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  return (
    <Canvas
      key={rendererKey}
      camera={{ position: [1.75, 1.35, 2.05], fov: 38 }}
      dpr={[1, 2]}
      onPointerMissed={onClearSelection}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          window.setTimeout(() => setRendererKey((current) => current + 1), 100);
        }, { once: true });
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Scene
        params={params}
        selected={selected}
        hiddenParts={hiddenParts}
        explode={explode}
        onSelect={onSelect}
        controlsRef={controlsRef}
        materialColors={materialColors}
      />
    </Canvas>
  );
}
