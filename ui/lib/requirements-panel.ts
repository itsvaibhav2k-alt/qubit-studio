/** Pure helpers for components/RequirementsPanel.tsx: collapse rule, log-slider mapping, status copy.
 * Kept out of the component so the Node test runner can exercise them without JSX.
 */
import { logPosition, logValue, roundSignificant } from './log-scale.ts';
import { num } from './format.ts';
import type { SearchRequirements, SearchResponse, SearchStatus } from './search-types.ts';

export const LOG_SLIDER_STEPS = 1000;

export interface SliderSpec { min: number; max: number; log?: boolean; }

/** Value → range-input position. Log specs use 0..LOG_SLIDER_STEPS; linear specs pass through. */
export function sliderPosition(value: number, spec: SliderSpec): number {
  return spec.log ? Math.round(logPosition(value, spec.min, spec.max) * LOG_SLIDER_STEPS) : value;
}

/** Range-input position → committed value, always inside [min, max]. */
export function sliderValue(position: number, spec: SliderSpec): number {
  const raw = spec.log ? roundSignificant(logValue(position / LOG_SLIDER_STEPS, spec.min, spec.max), 3) : position;
  return Math.min(spec.max, Math.max(spec.min, raw));
}

/** Collapse only when a feasible search completes (running → ready); expand on edit, infeasible, error. */
export function nextCollapsed(prev: SearchStatus, next: SearchStatus, collapsed: boolean): boolean {
  if (prev === 'running' && next === 'ready') return true;
  if (next === 'dirty' || next === 'infeasible' || next === 'error') return false;
  return collapsed;
}

export type StatusPart = string | { mono: string };
export interface StatusLine { tone: 'plain' | 'warn'; parts: StatusPart[]; }
export interface StatusCopy { summary: (r: SearchRequirements) => string; infeasible: string; }

/** Status sentence beside the primary action. Returns null for 'error' (rendered as an errbox). */
export function statusLine(
  status: SearchStatus, draft: SearchRequirements, lastRun: SearchResponse | null, fresh: boolean, copy: StatusCopy,
): StatusLine | null {
  const changed = (run: SearchResponse): StatusLine =>
    ({ tone: 'warn', parts: ['Requirements changed — results below are for ', { mono: copy.summary(run.request) }] });
  if (status === 'dirty') return lastRun ? changed(lastRun) : { tone: 'plain', parts: ['Not searched yet.'] };
  if (status === 'running') {
    return { tone: 'plain', parts: ['Searching ', { mono: String(draft.points) }, ' designs at ', { mono: `${num(draft.target_ghz, 3)} GHz` }, '…'] };
  }
  if (!lastRun) return null;
  if (status === 'ready') {
    if (!fresh) return changed(lastRun);
    return { tone: 'plain', parts: [{ mono: String(lastRun.feasible_count) }, ' of ', { mono: String(lastRun.evaluated_count) }, ' evaluated designs qualify.'] };
  }
  if (status === 'infeasible') return { tone: 'warn', parts: [`${copy.infeasible} `, { mono: String(lastRun.evaluated_count) }, ' evaluated.'] };
  return null;
}

export function statusText(line: StatusLine | null): string {
  return line ? line.parts.map((p) => (typeof p === 'string' ? p : p.mono)).join('') : '';
}

/** Server field errors that no rendered field owns (e.g. 'request', 'baseline.ej_ghz'). */
export function unattachedErrors(fieldErrors: Record<string, string[]>, attached: string[]): string[] {
  return Object.entries(fieldErrors)
    .filter(([key]) => !attached.includes(key))
    .map(([key, messages]) => `${key}: ${messages.join(' ')}`);
}
