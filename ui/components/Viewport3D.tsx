'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, Box3, Group, MathUtils, Mesh, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import StudioLighting from './StudioLighting';
import { PART_ORDER, PartMeshes } from './Assembly';
import { fitDistanceInRegion, sceneRadius, viewOffset } from '@/lib/camera-fit';
import type { Rect } from '@/lib/camera-fit';
import { ANCHORS, FRAME, PARTS_GEOMETRY } from '@/lib/chip-geometry';
import type { Projected } from '@/lib/connector';
import type { PartId } from '@/lib/parts';

export interface ViewportHandle {
  resetView: () => void;
}

/** Default pose: front-left, elevated, the reference's angle. Unit direction from target to camera. */
const AZIMUTH = (-40 * Math.PI) / 180;
const ELEVATION = (47 * Math.PI) / 180;
const DEFAULT_DIRECTION = new Vector3(
  Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.cos(AZIMUTH),
);
/** Fill this fraction of the free region's limiting angle. */
const FILL = 0.97;

const box = new Box3();
const corner = new Vector3();

/**
 * Screen-space bounds (canvas px) of the visible rendered meshes under `root`. Hit volumes and
 * helper lines are excluded. Uses each mesh's current world matrix.
 */
function projectedBounds(
  root: Group,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  root.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData.hit || !object.visible) return;
    box.setFromObject(object);
    if (box.isEmpty()) return;
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      corner.project(camera);
      const px = ((corner.x + 1) / 2) * width;
      const py = ((1 - corner.y) / 2) * height;
      if (px < left) left = px;
      if (px > right) right = px;
      if (py < top) top = py;
      if (py > bottom) bottom = py;
    }
  });
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

interface FramingProps {
  region: Rect | null;
  explodeTarget: number;
  /** True once the explode animation has settled, so the refinement measures final positions. */
  settled: boolean;
  assemblyRef: React.RefObject<Group | null>;
  fitRef: React.RefObject<((resetPose: boolean) => void) | null>;
}

/**
 * Overlay-aware framing. The bounding sphere is fitted to the unobstructed region and the
 * projection is sheared so the orbit target projects to the region centre. Re-fits on canvas size,
 * region or explode change; user zoom persists until the next of those.
 */
function Framing({ region, explodeTarget, settled, assemblyRef, fitRef }: FramingProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  // Once the user has orbited or zoomed, automatic refits only dolly OUT (never undo a zoom-out);
  // Reset view clears the flag and restores the reference framing.
  const userMovedRef = useRef(false);

  useEffect(() => {
    if (!controls) return undefined;
    const onEnd = () => {
      userMovedRef.current = true;
    };
    controls.addEventListener('end', onEnd);
    return () => controls.removeEventListener('end', onEnd);
  }, [controls]);

  useEffect(() => {
    const fit = (resetPose: boolean) => {
      if (resetPose) userMovedRef.current = false;
      if (!('isPerspectiveCamera' in camera)) return;
      const canvas = { x: 0, y: 0, width: size.width, height: size.height };
      const free = region ?? canvas;
      const radius = sceneRadius(explodeTarget, PARTS_GEOMETRY) / FILL;
      const distance = fitDistanceInRegion(radius, camera.fov, size.height, free.width, free.height);
      if (!Number.isFinite(distance)) return;
      const { dx, dy } = viewOffset(canvas, free);
      // Extra shear so the projected bounds' centre (not the orbit target) lands on the region centre.
      let cx = 0;
      let cy = 0;
      const offset = () => camera.setViewOffset(size.width, size.height, -(dx + cx), -(dy + cy), size.width, size.height);
      offset();
      const target = controls?.target ?? new Vector3();
      if (resetPose) target.set(0, 0, 0);
      const direction = resetPose ? DEFAULT_DIRECTION.clone() : camera.position.clone().sub(target);
      if (direction.lengthSq() === 0) direction.copy(DEFAULT_DIRECTION);
      const currentDistance = direction.length();
      const floor = (d: number) => (userMovedRef.current && !resetPose ? Math.max(d, currentDistance) : d);
      const place = (d: number) => {
        camera.position.copy(target).add(direction.clone().setLength(d));
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
      };
      place(floor(distance));
      // The sphere is conservative for a flat, square object: refine size and centring against the
      // real projected extent of the rendered meshes.
      const assembly = assemblyRef.current;
      if (assembly && settled) {
        assembly.updateWorldMatrix(true, true);
        let d = distance;
        for (let i = 0; i < 4; i += 1) {
          const bounds = projectedBounds(assembly, camera, size.width, size.height);
          if (!bounds) break;
          const w = bounds.right - bounds.left;
          const h = bounds.bottom - bounds.top;
          const scale = Math.max(w / free.width, h / free.height) / FILL;
          if (!Number.isFinite(scale) || scale <= 0) break;
          cx += free.x + free.width / 2 - (bounds.left + w / 2);
          cy += free.y + free.height / 2 - (bounds.top + h / 2);
          d = floor(d * scale);
          offset();
          place(d);
        }
      }
      controls?.update();
    };
    fitRef.current = fit;
    fit(false);
  }, [size.width, size.height, region, explodeTarget, settled, camera, controls, fitRef, assemblyRef]);

  return null;
}

interface ProjectorProps {
  selected: PartId | null;
  explodeRef: React.RefObject<number>;
  anchorRef: React.RefObject<Projected | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  assemblyRef: React.RefObject<Group | null>;
}

const scratch = new Vector3();

/**
 * Per-frame instrumentation. Writes the selected anchor's NDC for the callout line and the
 * projected bounds of the visible rendered meshes (hit volumes and guide lines excluded) to
 * `data-bounds` on the wrapper, so browser QA can check the framing against real geometry.
 */
function Projector({ selected, explodeRef, anchorRef, wrapperRef, assemblyRef }: ProjectorProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useFrame(() => {
    if (selected) {
      const a = ANCHORS[selected];
      scratch.set(a.point[0], a.point[1] + a.explodeY * explodeRef.current, a.point[2]);
      const view = scratch.clone().applyMatrix4(camera.matrixWorldInverse);
      scratch.project(camera);
      anchorRef.current = { x: scratch.x, y: scratch.y, z: scratch.z, w: -view.z };
    } else {
      anchorRef.current = null;
    }

    const wrapper = wrapperRef.current;
    const assembly = assemblyRef.current;
    if (!wrapper || !assembly) return;
    const bounds = projectedBounds(assembly, camera as PerspectiveCamera, size.width, size.height);
    if (bounds) {
      wrapper.dataset.bounds = `${bounds.left.toFixed(1)},${bounds.top.toFixed(1)},${bounds.right.toFixed(1)},${bounds.bottom.toFixed(1)}`;
    }
  });

  return null;
}

/** Smooths the Assembled/Exploded target; re-renders only while the value is moving. */
function useSmoothedExplode(target: number, explodeRef: React.RefObject<number>): number {
  const [value, setValue] = useState(target);
  useFrame((_, delta) => {
    const current = explodeRef.current;
    if (Math.abs(current - target) < 0.002) {
      if (current !== target) {
        explodeRef.current = target;
        setValue(target);
      }
      return;
    }
    const next = MathUtils.damp(current, target, 7, delta);
    explodeRef.current = next;
    setValue(next);
  });
  return value;
}

interface SceneProps {
  selected: PartId | null;
  hiddenParts: PartId[];
  explode: number;
  region: Rect | null;
  onSelect: (id: PartId) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  fitRef: React.RefObject<((resetPose: boolean) => void) | null>;
  anchorRef: React.RefObject<Projected | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

function Scene({ selected, hiddenParts, explode, region, onSelect, controlsRef, fitRef, anchorRef, wrapperRef }: SceneProps) {
  const explodeRef = useRef(explode);
  const assemblyRef = useRef<Group | null>(null);
  const smooth = useSmoothedExplode(explode, explodeRef);
  const floorY = FRAME.top - FRAME.depth + FRAME.explodeY * smooth - 0.012;

  return (
    <>
      <StudioLighting />

      <group ref={assemblyRef}>
        {PART_ORDER.map((id) => (
          <PartMeshes
            key={id}
            id={id}
            selected={selected === id}
            hidden={hiddenParts.includes(id)}
            explode={smooth}
            onSelect={onSelect}
            guides
          />
        ))}
      </group>

      <ContactShadows position={[0, floorY, 0]} scale={6} blur={2.8} opacity={0.32} far={2.5} resolution={1024} frames={Infinity} />

      <Framing region={region} explodeTarget={explode} settled={smooth === explode} assemblyRef={assemblyRef} fitRef={fitRef} />
      <Projector selected={selected} explodeRef={explodeRef} anchorRef={anchorRef} wrapperRef={wrapperRef} assemblyRef={assemblyRef} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableZoom
        enableDamping
        dampingFactor={0.12}
        minDistance={1}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.62}
      />
    </>
  );
}

interface Viewport3DProps extends Omit<SceneProps, 'controlsRef' | 'fitRef'> {
  /** False while the schematic-only view hides the canvas: rendering pauses. */
  active: boolean;
  onClearSelection: () => void;
  handleRef: React.RefObject<ViewportHandle | null>;
}

export default function Viewport3D({
  selected,
  hiddenParts,
  explode,
  region,
  onSelect,
  active,
  onClearSelection,
  handleRef,
  anchorRef,
  wrapperRef,
}: Viewport3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const fitRef = useRef<((resetPose: boolean) => void) | null>(null);

  useImperativeHandle(handleRef, () => ({
    resetView: () => fitRef.current?.(true),
  }));

  useEffect(
    () => () => {
      document.body.style.cursor = '';
      anchorRef.current = null;
    },
    [anchorRef],
  );

  return (
    <Canvas
      camera={{ position: DEFAULT_DIRECTION.clone().multiplyScalar(5).toArray(), fov: 30, near: 0.1, far: 60 }}
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'never'}
      shadows={{ type: PCFShadowMap }}
      onPointerMissed={onClearSelection}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Scene
        selected={selected}
        hiddenParts={hiddenParts}
        explode={explode}
        region={region}
        onSelect={onSelect}
        controlsRef={controlsRef}
        fitRef={fitRef}
        anchorRef={anchorRef}
        wrapperRef={wrapperRef}
      />
    </Canvas>
  );
}
