'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MylaIcon from '@/components/MylaIcon';
import MathText from '@/components/MathText';
import { composeLocalMyla } from '@/lib/explain-local';
import { formatTopicHeadline, TOPICS, type TopicId } from '@/lib/explain-topics';
import type { ChipSnapshot } from '@/lib/insight-types';

export interface ClickAnchor {
  x: number;
  y: number;
}

interface AskLlmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: TopicId[];
  snapshot: ChipSnapshot;
  anchor: ClickAnchor;
}

const POP_W = 360;
const GAP = 14;
const MARGIN = 10;

function place(anchor: ClickAnchor, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.x + GAP;
  let top = anchor.y + GAP;
  if (left + width > vw - MARGIN) left = anchor.x - width - GAP;
  if (left < MARGIN) left = MARGIN;
  if (top + height > vh - MARGIN) top = anchor.y - height - GAP;
  if (top < MARGIN) top = MARGIN;
  return { left, top };
}

export default function AskLlm({ open, onOpenChange, topics, snapshot, anchor }: AskLlmProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  const topic = topics[0] ?? null;
  const spec = topic ? TOPICS[topic] : null;
  const headline = topic ? formatTopicHeadline(topic, snapshot) : 'Myla';
  const shown = topic ? composeLocalMyla(topic, snapshot) : null;

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPos(place(anchor, rect.width || POP_W, rect.height || 220));
  }, [anchor, open, shown?.body]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="myla-pop"
      role="dialog"
      aria-label="Myla"
      style={{ left: pos.left, top: pos.top, width: POP_W }}
    >
      <button type="button" className="myla-x" onClick={() => onOpenChange(false)} aria-label="Close Myla">
        ×
      </button>
      <div className="myla-head">
        <MylaIcon size={42} />
        <div className="myla-title">
          <span className="myla-wordmark" aria-label="Myla">
            <span>M</span>
            <span>y</span>
            <span>l</span>
            <span>a</span>
          </span>
          <span className="myla-sub">
            <MathText text={headline} />
          </span>
        </div>
      </div>
      {spec && (
        <p className="myla-sym">
          <MathText text={`$${spec.tex}$`} />
        </p>
      )}
      {shown && (
        <article className="ask-answer">
          {shown.body.split('\n').filter(Boolean).map((para, index) => (
            <p key={index}>
              <MathText text={para} />
            </p>
          ))}
        </article>
      )}

    </div>
  );
}
