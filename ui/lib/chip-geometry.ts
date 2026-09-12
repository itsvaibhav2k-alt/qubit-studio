import type { PartId } from './parts';

export interface PartGeometry {
  id: PartId;
  size: [number, number, number];
  position: [number, number, number];
  /** Vertical offset at explode = 1; y = position[1] + explodeY * explode. */
  explodeY: number;
  metal: boolean;
}

/**
 * Illustrative chip geometry. Dimensions are exaggerated for legibility.
 * Single source of truth for both rendering (Viewport3D) and camera fitting (camera-fit).
 * Order is render order.
 */
export const PARTS_GEOMETRY: PartGeometry[] = [
  { id: 'substrate', size: [1.62, 0.07, 1.18], position: [0, -0.058, 0], explodeY: -0.16, metal: false },
  { id: 'ground', size: [1.42, 0.02, 0.18], position: [0, -0.012, -0.44], explodeY: 0.1, metal: true },
  { id: 'ground', size: [1.42, 0.02, 0.18], position: [0, -0.012, 0.44], explodeY: 0.1, metal: true },
  { id: 'ground', size: [0.28, 0.02, 0.28], position: [-0.57, -0.012, 0.21], explodeY: 0.1, metal: true },
  { id: 'ground', size: [0.28, 0.02, 0.28], position: [-0.57, -0.012, -0.21], explodeY: 0.1, metal: true },
  { id: 'ground', size: [0.28, 0.02, 0.62], position: [0.57, -0.012, 0], explodeY: 0.1, metal: true },
  { id: 'capacitor', size: [0.34, 0.028, 0.52], position: [-0.2, 0.002, 0], explodeY: 0.26, metal: true },
  { id: 'capacitor', size: [0.34, 0.028, 0.52], position: [0.2, 0.002, 0], explodeY: 0.26, metal: true },
  { id: 'junction', size: [0.07, 0.034, 0.06], position: [0, 0.005, 0], explodeY: 0.42, metal: true },
  { id: 'gate', size: [0.33, 0.022, 0.06], position: [-0.585, -0.001, 0], explodeY: 0.26, metal: true },
];
