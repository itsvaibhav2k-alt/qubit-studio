'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplainResult } from './explain-llm.ts';
import type { TopicId } from './explain-topics.ts';
import type { ChipSnapshot } from './insight-types.ts';

export interface ExplainHandle {
  answer: ExplainResult | null;
  loading: boolean;
  error: string | null;
  ask: () => void;
}

export function useExplain(snapshot: ChipSnapshot, topicOrTopics: TopicId[] | TopicId | null): ExplainHandle {
  const [answer, setAnswer] = useState<ExplainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const topicsKey = Array.isArray(topicOrTopics)
    ? [...topicOrTopics].sort().join(',')
    : (topicOrTopics ?? '');

  useEffect(() => {
    controllerRef.current?.abort();
    setAnswer(null);
    setError(null);
    setLoading(false);
  }, [topicsKey]);

  const ask = useCallback(() => {
    const topics: TopicId[] = Array.isArray(topicOrTopics)
      ? topicOrTopics
      : topicOrTopics
        ? [topicOrTopics]
        : [];
    if (topics.length === 0) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topics, snapshot }),
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            data !== null && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
              ? (data as { error: string }).error
              : `Explain request failed (HTTP ${response.status}).`;
          throw new Error(message);
        }
        const result = data as ExplainResult;
        if (typeof result?.title !== 'string' || typeof result?.body !== 'string') {
          throw new Error('The server returned an empty explanation.');
        }
        if (!controller.signal.aborted) setAnswer(result);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
  }, [snapshot, topicOrTopics]);

  return { answer, loading, error, ask };
}
