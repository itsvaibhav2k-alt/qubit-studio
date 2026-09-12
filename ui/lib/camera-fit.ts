/** Pure camera-fitting maths. No three.js so it can run under node's test runner. */

interface BoxPart {
  size: [number, number, number];
  position: [number, number, number];
  explodeY: number;
}

const RADIUS_MARGIN = 1.05;

/**
 * Distance from the target at which a sphere of `radius` fits inside the
 * narrower of the vertical and horizontal fields of view.
 *
 * @returns NaN when the viewport is too small to be meaningful (< 2px either way).
 */
export function fitDistance(radius: number, fovDeg: number, width: number, height: number): number {
  if (width < 2 || height < 2) return Number.NaN;
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (width / height));
  return radius / Math.sin(Math.min(vertical, horizontal) / 2);
}

/**
 * Radius of an origin-centred sphere containing every box corner at the given
 * explode (0..1), plus a small margin so edges never touch the frustum.
 */
export function sceneRadius(explode: number, parts: readonly BoxPart[]): number {
  const farthest = parts.reduce((max, { size, position, explodeY }) => {
    // Farthest corner of an axis-aligned box from the origin: |centre| + half extent per axis.
    const x = Math.abs(position[0]) + size[0] / 2;
    const y = Math.abs(position[1] + explodeY * explode) + size[1] / 2;
    const z = Math.abs(position[2]) + size[2] / 2;
    return Math.max(max, Math.hypot(x, y, z));
  }, 0);
  return farthest * RADIUS_MARGIN;
}

/**
 * Outward-only fitting rule: keep the user's distance unless the object would
 * clip, in which case dolly out to exactly `required`. Never dollies in.
 */
export function fittedDistance(current: number, required: number): number {
  if (!Number.isFinite(required) || current >= required) return current;
  return required;
}
