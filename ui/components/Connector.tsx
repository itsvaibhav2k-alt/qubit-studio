'use client';

import { useEffect, useRef } from 'react';
import { anchorVisible, connectorPath, ndcToStage } from '@/lib/connector';
import type { Projected } from '@/lib/connector';

interface ConnectorProps {
  /** Selected part's projected anchor, written by the scene every frame; null when nothing to point at. */
  anchorRef: React.RefObject<Projected | null>;
  stageRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLElement | null>;
  badgeRef: React.RefObject<HTMLElement | null>;
  /** False in schematic-only view or when the card is not floating over the stage. */
  active: boolean;
}

/**
 * Blue callout from the selected part to the inspector badge. Runs its own animation frame so the
 * line follows orbit, pan and zoom without React re-renders. No occlusion test: after orbiting to the
 * far side it can point through the assembly (documented tradeoff).
 */
export default function Connector({ anchorRef, stageRef, canvasRef, badgeRef, active }: ConnectorProps) {
  const lineRef = useRef<SVGPolylineElement | null>(null);
  const startRef = useRef<SVGCircleElement | null>(null);
  const endRef = useRef<SVGCircleElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const hide = () => {
      if (svgRef.current) svgRef.current.style.visibility = 'hidden';
    };
    if (!active) {
      hide();
      return undefined;
    }
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      const badge = badgeRef.current;
      const anchor = anchorRef.current;
      const svg = svgRef.current;
      if (!active || !stage || !canvas || !badge || !anchor || !svg) return hide();
      const stageRect = stage.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const b = badge.getBoundingClientRect();
      const canvasRect = { x: c.left - stageRect.left, y: c.top - stageRect.top, width: c.width, height: c.height };
      const badgeRect = { x: b.left - stageRect.left, y: b.top - stageRect.top, width: b.width, height: b.height };
      // The card floats over the stage only in the wide layout; stacked layouts put it below the model.
      const floating = !window.matchMedia('(max-width: 1100px)').matches;
      const badgeInsideStage =
        b.width > 0 && b.top >= stageRect.top && b.bottom <= stageRect.bottom && b.left >= stageRect.left;
      // The card scrolls: a badge scrolled out of its visible area is not a valid endpoint.
      const scroller = badge.closest('.card');
      const s = scroller?.getBoundingClientRect();
      const badgeVisible = !s || (b.top >= s.top - 1 && b.bottom <= s.bottom + 1);
      if (!floating || !badgeInsideStage || !badgeVisible || !anchorVisible(anchor, canvasRect)) return hide();
      const path = connectorPath(ndcToStage(anchor, canvasRect), badgeRect);
      svg.style.visibility = 'visible';
      lineRef.current?.setAttribute('points', path.map((p) => `${p.x},${p.y}`).join(' '));
      startRef.current?.setAttribute('cx', String(path[0].x));
      startRef.current?.setAttribute('cy', String(path[0].y));
      endRef.current?.setAttribute('cx', String(path[2].x));
      endRef.current?.setAttribute('cy', String(path[2].y));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, anchorRef, stageRef, canvasRef, badgeRef]);

  return (
    <svg ref={svgRef} className="connector" aria-hidden="true" style={{ visibility: 'hidden' }}>
      <polyline ref={lineRef} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle ref={startRef} r="3.5" fill="var(--accent)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <circle ref={endRef} r="3" fill="var(--accent)" />
    </svg>
  );
}
