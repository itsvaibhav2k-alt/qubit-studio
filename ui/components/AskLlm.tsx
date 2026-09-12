'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MathText from '@/components/MathText';
import MylaIcon from '@/components/MylaIcon';
import { composeLocalMyla } from '@/lib/explain-local';
import { formatTopicHeadline, TOPICS, type TopicId } from '@/lib/explain-topics';
import type { ExplainHandle } from '@/lib/useExplain';
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
  explain: ExplainHandle;
  anchor: ClickAnchor;
}

const POP_W = 360;
const GAP = 12;
const MARGIN = 8;

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

export default function AskLlm({ open, onOpenChange, topics, snapshot, explain, anchor }: AskLlmProps) {
  const { answer, loading, error, ask } = explain;
  const askedKey = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  const topic = topics[0] ?? null;
  const spec = topic ? TOPICS[topic] : null;
  const headline = topic ? formatTopicHeadline(topic, snapshot) : 'Myla';
  const local = topic ? composeLocalMyla(topic, snapshot) : null;
  const shown = answer ?? local;

  useEffect(() => {
    if (!open || !topic) {
      askedKey.current = null;
      return;
    }
    if (askedKey.current === topic) return;
    askedKey.current = topic;
    ask();
  }, [ask, open, topic]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPos(place(anchor, rect.width || POP_W, rect.height || 220));
  }, [anchor, open, shown?.body, loading]);

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
        <MylaIcon size={38} />
        <div className="myla-title">
          <span className="myla-mark">Myla</span>
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
      {loading && <p className="ask-status">Myla is adding a live readout…</p>}
      {error && !answer && <p className="insight-error">{error}</p>}
    </div>
  );
}
