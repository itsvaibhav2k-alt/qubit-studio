'use client';

import { Canvas, useThree } from '@react-three/fiber';
import StudioLighting from './StudioLighting';
import { useEffect } from 'react';
import { ACESFilmicToneMapping, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { PartMeshes } from './Assembly';
import { PARTS_GEOMETRY } from '@/lib/chip-geometry';
import type { PartId } from '@/lib/parts';

const DIRECTION = new Vector3(-0.15, 0.55, 1.3).normalize();
const FOV = 30;


/** Centre and half-diagonal of the union box of every geometry entry for one part. */
function partBounds(id: PartId): { center: Vector3; radius: number } {
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  PARTS_GEOMETRY.filter((g) => g.id === id).forEach(({ size, position }) => {
    lo.min(new Vector3(position[0] - size[0] / 2, position[1] - size[1] / 2, position[2] - size[2] / 2));
    hi.max(new Vector3(position[0] + size[0] / 2, position[1] + size[1] / 2, position[2] + size[2] / 2));
  });
  return { center: lo.clone().add(hi).multiplyScalar(0.5), radius: hi.distanceTo(lo) / 2 };
}

function Framer({ id }: { id: PartId }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const { center, radius } = partBounds(id);
    const halfFov = MathUtils.degToRad(FOV / 2);
    const angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * size.width / Math.max(1, size.height)));
    camera.position.copy(DIRECTION).multiplyScalar(radius / Math.sin(angle) * 0.86).add(center);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    for (let pass = 0; pass < 3; pass++) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const g of PARTS_GEOMETRY.filter(g => g.id === id)) for (let i = 0; i < 8; i++) {
        const point = new Vector3(g.position[0] + (i & 1 ? 1 : -1) * g.size[0] / 2,
          g.position[1] + (i & 2 ? 1 : -1) * g.size[1] / 2,
          g.position[2] + (i & 4 ? 1 : -1) * g.size[2] / 2).project(camera);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      const scale = Math.max((maxX - minX) / 1.72, (maxY - minY) / 1.6);
      camera.position.sub(center).multiplyScalar(scale).add(center);
      camera.lookAt(center); camera.updateMatrixWorld(true);
    }
    invalidate();
  }, [id, camera, invalidate, size.width, size.height]);
  return null;
}

/** Static close-up of one part, lit cheaply; no controls, no shadows. */
export default function PartDetail({ id }: { id: PartId }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: FOV, near: 0.005, far: 30 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Framer id={id} />
      <StudioLighting detail />
      <PartMeshes id={id} selected={false} hidden={false} explode={0} />
    </Canvas>
  );
}
