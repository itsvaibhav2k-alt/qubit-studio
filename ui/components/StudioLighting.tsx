'use client';

import { Environment } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { DataTexture, EquirectangularReflectionMapping, FloatType, RGBAFormat } from 'three';

/** A continuous studio radiance field. Broad softboxes and a grey room replace hard white
 * rectangles in an otherwise black environment. Generated locally; no network HDR assets. */
function studioRadiance() {
  const width = 1024, height = 512;
  const data = new Float32Array(width * height * 4);
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = (x / width - 0.5) * Math.PI * 2;
    // DataTexture has flipY=false: positive latitude is in the upper UV half.
    const elevation = (y / height - 0.5) * Math.PI;
    const panel = (azimuth: number, altitude: number, w: number, h: number) =>
      Math.exp(-Math.pow(wrap(phi - azimuth) / w, 4) - Math.pow((elevation - altitude) / h, 4));
    const key = 2.8 * panel(-0.38, 0.72, 0.82, 0.50);
    const fill = 1.8 * panel(2.25, 0.60, 0.80, 0.48);
    const ceiling = 0.17 * Math.max(0, Math.sin(elevation));
    const room = 0.12 + ceiling + 0.18 * Math.max(0, -Math.sin(elevation));
    const negativeFill = 1 - 0.35 * panel(0.85, 0.10, 0.28, 0.62);
    const i = (y * width + x) * 4;
    data[i] = (room + key + fill * 0.94) * negativeFill;
    data[i + 1] = (room + key * 0.975 + fill * 0.97) * negativeFill;
    data[i + 2] = (room + key * 0.94 + fill) * negativeFill;
    data[i + 3] = 1;
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

export default function StudioLighting({ detail = false }: { detail?: boolean }) {
  const environment = useMemo(() => studioRadiance(), []);
  useEffect(() => () => environment.dispose(), [environment]);
  return <>
    <Environment map={environment} environmentIntensity={1.1} />
    <hemisphereLight args={['#eef0f1', '#797b7d', 0.12]} />
    <directionalLight position={[-3, 6, -1.5]} intensity={detail ? 0.65 : 1.15} color="#fffaf1"
      castShadow={!detail} shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-2.1} shadow-camera-right={2.1}
      shadow-camera-top={2.1} shadow-camera-bottom={-2.1}
      shadow-camera-near={1} shadow-camera-far={14}
      shadow-bias={-0.00008} shadow-normalBias={0.0015} shadow-radius={4} />
  </>;
}
