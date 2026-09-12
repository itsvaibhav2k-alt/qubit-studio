'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import MylaIcon from '@/components/MylaIcon';
import MathText from '@/components/MathText';
import { composeLocalMyla } from '@/lib/explain-local';
import { formatTopicHeadline, TOPICS, TOPIC_IDS, type TopicId } from '@/lib/explain-topics';
import { useExplain, type ExplainHandle } from '@/lib/useExplain';
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
  anchor?: ClickAnchor;
  explain?: ExplainHandle;
  modal?: boolean;
  onTopicsChange?: (topics: TopicId[]) => void;
}

const POP_W = 360;
const GAP = 14;
const MARGIN = 10;
const DEFAULT_ANCHOR = { x: 24, y: 72 };

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

/** Keep one request owner, whether supplied by a host or owned by the popover. */
export default function AskLlm(props: AskLlmProps) {
  return props.explain
    ? <MylaPopover {...props} explain={props.explain} />
    : <ConnectedMyla {...props} />;
}

function ConnectedMyla(props: AskLlmProps) {
  const explain = useExplain(props.snapshot, props.topics);
  return <MylaPopover {...props} explain={explain} />;
}

function MylaPopover({ open, onOpenChange, topics, snapshot, anchor = DEFAULT_ANCHOR, explain, modal = true, onTopicsChange }: AskLlmProps & { explain: ExplainHandle }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });
  const { answer, loading, error, ask, cancel, canAsk } = explain;
  const selectedTopics = [...new Set(topics)];
  const topic = selectedTopics[0] ?? null;
  const spec = topic ? TOPICS[topic] : null;
  const headline = selectedTopics.length > 1
    ? `Explain ${selectedTopics.length} selected sections`
    : topic ? formatTopicHeadline(topic, snapshot) : 'Myla';
  const notes = selectedTopics.map(topic => composeLocalMyla(topic, snapshot));
  const notesKey = notes.map(note => note.body).join('\n');

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      setPos(place(anchor, rect.width || POP_W, rect.height || 220));
    };
    position();
    const frame = requestAnimationFrame(position);
    window.addEventListener('resize', position);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', position); };
  }, [anchor, open, notesKey, answer, loading, error]);

  useEffect(() => {
    if (!open) cancel();
    return cancel;
  }, [cancel, open]);

  return (
    <DialogPrimitive.Root open={open} modal={modal} onOpenChange={next => {
      if (!next) cancel();
      onOpenChange(next);
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={panelRef}
          className="myla-pop"
          aria-label="Myla"
          style={{ left: pos.left, top: pos.top, width: POP_W }}
          onOpenAutoFocus={event => {
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && !focused.closest('[role="dialog"]')) opener.current = focused;
            if (!modal) event.preventDefault();
          }}
          onCloseAutoFocus={event => {
            if (modal && opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
          }}
        >
          <DialogPrimitive.Close asChild>
            <button type="button" className="myla-x" aria-label="Close Myla">
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" /></svg>
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
          <div className="myla-head">
            <MylaIcon size={42} />
            <div className="myla-title">
              <span className="myla-wordmark" aria-label="Myla">
                <span>M</span><span>y</span><span>l</span><span>a</span>
              </span>
              <DialogPrimitive.Title asChild>
                <span className="myla-sub"><MathText text={headline} /></span>
              </DialogPrimitive.Title>
            </div>
          </div>
          {spec && selectedTopics.length === 1 && <p className="myla-sym"><MathText text={`$${spec.tex}$`} /></p>}
          <DialogPrimitive.Description className="ask-status">
            Local teaching notes are ready below. Ask Gemini for an AI explanation of this completed snapshot.
          </DialogPrimitive.Description>
          {onTopicsChange && <details className="tech">
            <summary>Choose explanation topics ({selectedTopics.length})</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {TOPIC_IDS.map(id => <label key={id} style={{ display: 'flex', gap: 8 }}>
                <input type="checkbox" checked={selectedTopics.includes(id)} onChange={event => onTopicsChange(event.target.checked ? [...selectedTopics, id] : selectedTopics.filter(topic => topic !== id))}/>
                {TOPICS[id].label}
              </label>)}
              <button type="button" className="btn" disabled={!selectedTopics.length} onClick={() => onTopicsChange([])}>Clear topic selection</button>
            </div>
          </details>}
          {notes.map(note => (
            <article className="ask-answer" key={note.topic}>
              {selectedTopics.length > 1 && <h4>{TOPICS[note.topic].label}</h4>}
              {note.body.split('\n').filter(Boolean).map((para, index) => <p key={index}><MathText text={para} /></p>)}
            </article>
          ))}
          {loading && <p className="ask-status" role="status">Asking Gemini to explain selected sections…</p>}
          {error && <p className="insight-error" role="alert">{error} Local teaching notes remain available.</p>}
          {answer && <article className="ask-answer" aria-label="Gemini explanation">
            <h4><MathText text={answer.title} /></h4>
            {answer.body.split('\n').filter(Boolean).map((para, index) => <p key={index}><MathText text={para} /></p>)}
          </article>}
          {!loading && !error && !answer && <p className="ask-status" role="status">
            {canAsk ? 'Ready to explain this completed snapshot.' : !topic ? 'Select a section to explain.' : snapshot.readiness === 'error' ? 'Resolve the solver error before asking Gemini.' : snapshot.readiness !== 'ready' ? 'Wait for the current calculation to finish.' : 'Check the design goals before asking Gemini.'}
          </p>}
          <div className="ask-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            {loading && <button type="button" className="btn" onClick={cancel}>Cancel</button>}
            <button type="button" className="btn" onClick={ask} disabled={!canAsk || loading} aria-busy={loading}>
              {error ? 'Retry' : answer ? 'Ask again' : 'Ask Gemini'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
