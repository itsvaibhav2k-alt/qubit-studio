'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatTopicHeadline, TOPICS, type TopicId } from '@/lib/explain-topics';
import type { ExplainHandle } from '@/lib/useExplain';
import type { ChipSnapshot } from '@/lib/insight-types';

interface AskLlmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: TopicId[];
  snapshot: ChipSnapshot;
  explain: ExplainHandle;
}

export default function AskLlm({ open, onOpenChange, topics, snapshot, explain }: AskLlmProps) {
  const { answer, loading, error, ask, cancel, canAsk } = explain;
  const opener = useRef<HTMLElement | null>(null);
  const headline =
    topics.length === 1
      ? formatTopicHeadline(topics[0], snapshot)
      : `Explain ${topics.length} selected sections`;

  useEffect(() => {
    if (!open) cancel();
    return cancel;
  }, [cancel, open]);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) cancel(); onOpenChange(next); }}>
      <DialogContent className="ask-dialog sm:max-w-lg" showCloseButton
        onOpenAutoFocus={() => {
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && !focused.closest('[role="dialog"]')) opener.current = focused;
        }}
        onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
        }}>
        <DialogHeader>
          <DialogTitle>{headline}</DialogTitle>
          <DialogDescription>Ask Gemini about the completed calculation and selected evidence.</DialogDescription>
          <div className="text-sm text-muted-foreground mt-1">
            {topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {topics.map((t) => {
                  const spec = TOPICS[t];
                  return (
                    <span
                      key={t}
                      className="topic-badge"
                    >
                      {spec?.label ?? t} ({spec?.symbol ?? ''})
                    </span>
                  );
                })}
              </div>
            ) : (
              <span>Select one or more windows to analyze.</span>
            )}
          </div>
        </DialogHeader>

        {loading && <p className="ask-status" role="status">Asking Gemini to explain selected sections…</p>}
        {error && <p className="insight-error" role="alert">{error}</p>}
        {answer && (
          <article className="ask-answer">
            <h4 className="text-base font-semibold mb-2">{answer.title}</h4>
            {answer.body
              .split('\n')
              .filter(Boolean)
              .map((para, index) => (
                <p key={index} className="mb-2 text-sm leading-relaxed">
                  {para}
                </p>
              ))}
          </article>
        )}
        {!loading && !error && !answer && (
          <p className="ask-status" role="status">{canAsk ? 'Ready to explain this completed snapshot.' : topics.length === 0 ? 'Select a section to explain.' : snapshot.readiness === 'error' ? 'Resolve the solver error before asking Gemini.' : snapshot.readiness !== 'ready' ? 'Wait for the current calculation to finish.' : 'Check the design goals before asking Gemini.'}</p>
        )}

        <div className="ask-dialog-actions mt-4 flex justify-end gap-2">
          {loading && <Button type="button" variant="outline" size="sm" onClick={cancel}>Cancel</Button>}
          <Button type="button" variant={answer ? 'outline' : 'default'} size="sm" onClick={ask} disabled={!canAsk || loading}>
            {error ? 'Retry' : answer ? 'Ask again' : 'Ask Gemini'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
