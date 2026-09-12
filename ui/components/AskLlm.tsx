'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
  const { answer, loading, error, ask } = explain;
  const askedKey = useRef<string | null>(null);

  const topicsKey = [...topics].sort().join(',');
  const headline =
    topics.length === 1
      ? formatTopicHeadline(topics[0], snapshot)
      : `Ask LLM: ${topics.length} Windows Selected`;

  useEffect(() => {
    if (!open || topics.length === 0) {
      if (!open) askedKey.current = null;
      return;
    }
    const key = `${topicsKey}:${snapshot.params.ej_ghz}:${snapshot.params.ec_ghz}:${snapshot.params.ng}:${snapshot.outputs?.f01_ghz ?? 'none'}`;
    if (askedKey.current === key) return;
    askedKey.current = key;
    ask();
  }, [ask, open, snapshot.outputs?.f01_ghz, snapshot.params.ec_ghz, snapshot.params.ej_ghz, snapshot.params.ng, topics.length, topicsKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ask-dialog sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{headline}</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            {topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {topics.map((t) => {
                  const spec = TOPICS[t];
                  return (
                    <span
                      key={t}
                      className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium"
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

        {loading && <p className="ask-status">Asking Gemini to explain selected windows…</p>}
        {error && <p className="insight-error">{error}</p>}
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
          <p className="ask-status">Preparing an explanation across selected windows.</p>
        )}

        {answer && !loading && (
          <div className="ask-dialog-actions mt-4 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={ask}>
              Ask again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
