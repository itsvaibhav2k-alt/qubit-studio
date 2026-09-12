'use client';

import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, Line, OrbitControls } from '@react-three/drei';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { fitDistance, fittedDistance, sceneRadius } from '@/lib/camera-fit';
import { PARTS_GEOMETRY } from '@/lib/chip-geometry';
import { PART_BY_ID } from '@/lib/parts';
import type { PartId } from '@/lib/parts';

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
          color={selected ? '#cfe0f8' : part.color}
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

interface FitToViewportProps {
  explode: number;
  fitRef: React.RefObject<(() => void) | null>;
}

/**
 * Keeps the whole chip inside the frustum when the canvas shrinks (Split halves
 * the width) or the explode slider pushes parts outward. Only ever dollies OUT,
 * and only along the current view direction, so manual orbit and zoom survive.
 * The fit function is exposed through `fitRef` so Reset view can force it.
 */
function FitToViewport({ explode, fitRef }: FitToViewportProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    const fit = () => {
      if (!('isPerspectiveCamera' in camera)) return;
      const required = fitDistance(
        sceneRadius(explode, PARTS_GEOMETRY),
        (camera as PerspectiveCamera).fov,
        size.width,
        size.height,
      );
      const target = controls?.target ?? new Vector3();
      const direction = camera.position.clone().sub(target);
      const next = fittedDistance(direction.length(), required);
      if (direction.lengthSq() === 0 || next === direction.length()) return;
      camera.position.copy(target).add(direction.setLength(next));
      controls?.update();
    };
    fitRef.current = fit;
    fit();
    // ponytail: radius is origin-centred and the trigger is size/explode only, so a panned target
    // is not accounted for; Reset view is the recovery path.
  }, [size.width, size.height, explode, camera, controls, fitRef]);

  return null;
}

interface SceneProps {
  selected: PartId | null;
  hiddenParts: PartId[];
  explode: number;
  onSelect: (id: PartId) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  fitRef: React.RefObject<(() => void) | null>;
}

function Scene({ selected, hiddenParts, explode, onSelect, controlsRef, fitRef }: SceneProps) {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[2.5, 3.5, 2]} intensity={1.5} />
      <directionalLight position={[-2, 1.5, -2.5]} intensity={0.5} />

      {PARTS_GEOMETRY.map((part, index) => (
        <Solid
          key={`${part.id}-${index}`}
          {...part}
          explode={explode}
          onSelect={onSelect}
          selected={selected === part.id}
          hidden={hiddenParts.includes(part.id)}
        />
      ))}

      <FitToViewport explode={explode} fitRef={fitRef} />

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

interface Viewport3DProps extends Omit<SceneProps, 'controlsRef' | 'fitRef'> {
  onClearSelection: () => void;
  handleRef: React.RefObject<ViewportHandle | null>;
}

export default function Viewport3D({
  selected,
  hiddenParts,
  explode,
  onSelect,
  onClearSelection,
  handleRef,
}: Viewport3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const fitRef = useRef<(() => void) | null>(null);

  useImperativeHandle(handleRef, () => ({
    resetView: () => {
      controlsRef.current?.reset();
      fitRef.current?.();
    },
  }));

  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  return (
    <Canvas
      camera={{ position: [1.75, 1.35, 2.05], fov: 38 }}
      dpr={[1, 2]}
      onPointerMissed={onClearSelection}
      gl={{ antialias: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Scene
        selected={selected}
        hiddenParts={hiddenParts}
        explode={explode}
        onSelect={onSelect}
        controlsRef={controlsRef}
        fitRef={fitRef}
      />
    </Canvas>
  );
}
