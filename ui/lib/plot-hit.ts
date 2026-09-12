/** Nearest-point hit testing for hand-rolled SVG scatter plots. Pure; units are the caller's. */
export interface PlotPoint {
  id: string;
  x: number;
  y: number;
}

/** Id of the point nearest (x, y) within radius, or null. Ties resolve to the first point. */
export function nearestPoint(points: PlotPoint[], x: number, y: number, radius: number): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const d = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = point.id;
    }
  }
  return bestDistance <= radius * radius ? best : null;
}
