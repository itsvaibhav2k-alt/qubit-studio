'use client';

import { useState } from 'react';
import { INFEASIBLE_SENTENCE, REQUIREMENTS, requirementsSummary } from '@/lib/design-copy';
import { DEFAULT_SEARCH_REQUIREMENTS, SEARCH_BOUNDS } from '@/lib/search-params';
import { num } from '@/lib/format';
import { nextCollapsed, statusLine, unattachedErrors } from '@/lib/requirements-panel';
import type { SearchRequirements, SearchResponse, SearchStatus } from '@/lib/search-types';
import SpecField from './SpecField';
import type { FieldSpec } from './SpecField';

export interface RequirementsPanelProps {
  draft: SearchRequirements;
  status: SearchStatus;
  fresh: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  lastRun: SearchResponse | null;
  onChange: (patch: Partial<SearchRequirements>) => void;
  onSearch: () => void;
}

const NCUT_SPEC: FieldSpec = {
  key: 'ncut',
  label: 'Charge basis cutoff',
  symbol: 'ncut',
  unit: '',
  min: SEARCH_BOUNDS.ncut.min,
  max: SEARCH_BOUNDS.ncut.max,
  step: 1,
  digits: 0,
  integer: true,
  fallback: DEFAULT_SEARCH_REQUIREMENTS.ncut,
  meaning: 'Solver setting for the search; seeded from Explore when you entered Design, then independent.',
};

const ATTACHED_KEYS = [...REQUIREMENTS.map((spec) => spec.key), NCUT_SPEC.key];
const STATUS_COPY = { summary: requirementsSummary, infeasible: INFEASIBLE_SENTENCE };

/** Requirements editor at the top of the Design inspector. Collapses to a summary after a feasible search. */
export default function RequirementsPanel({
  draft, status, fresh, error, fieldErrors, lastRun, onChange, onSearch,
}: RequirementsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    setCollapsed(nextCollapsed(prevStatus, status, collapsed));
  }

  const line = statusLine(status, draft, lastRun, fresh, STATUS_COPY);
  const otherErrors = unattachedErrors(fieldErrors, ATTACHED_KEYS);
  const running = status === 'running';

  return (
    <section className="req" aria-label="Requirements">
      <div className="panel-head">
        Requirements
        <span className="spacer" />
        {collapsed && (
          <button type="button" className="btn" onClick={() => setCollapsed(false)}>Edit</button>
        )}
      </div>
      <div className="req-body">
        {collapsed ? (
          <>
            <p className="req-summary">{requirementsSummary(draft)}</p>
            {line && (
              <p className={`req-status${line.tone === 'warn' ? ' warn' : ''}`}>
                {line.parts.map((part, index) =>
                  typeof part === 'string' ? part : <span key={index} className="n">{part.mono}</span>,
                )}
              </p>
            )}
          </>
        ) : (
          <>
            {REQUIREMENTS.map((spec) => (
              <SpecField
                key={spec.key}
                spec={spec}
                value={draft[spec.key]}
                onChange={(value) => onChange({ [spec.key]: value })}
                error={fieldErrors[spec.key]?.join(' ')}
              />
            ))}
            <div className="row-actions">
              <button type="button" className="btn primary" onClick={onSearch} disabled={running}>
                {running ? 'Searching…' : 'Find designs'}
              </button>
              {line && (
                <p className={`req-status${line.tone === 'warn' ? ' warn' : ''}`}>
                  {line.parts.map((part, index) =>
                    typeof part === 'string' ? part : <span key={index} className="n">{part.mono}</span>,
                  )}
                </p>
              )}
            </div>
            {status === 'error' && (
              <div className="errbox" role="alert">
                <span>{error ?? 'The search failed.'}</span>
                <button type="button" className="btn" onClick={onSearch}>Retry</button>
                {otherErrors.length > 0 && (
                  <ul>{otherErrors.map((text) => <li key={text}><code>{text}</code></li>)}</ul>
                )}
              </div>
            )}
            <details className="tech">
              <summary>Design settings</summary>
              <div className="body">
                <SpecField
                  spec={NCUT_SPEC}
                  value={draft.ncut}
                  onChange={(ncut) => onChange({ ncut })}
                  error={fieldErrors.ncut?.join(' ')}
                />
                <p className="note">{NCUT_SPEC.meaning}</p>
                <dl>
                  <dt>EJ/EC</dt><dd>{num(draft.ratio_min, 0)}–{num(draft.ratio_max, 0)}</dd>
                  <dt>EJ</dt><dd>{num(draft.ej_min_ghz, 2)}–{num(draft.ej_max_ghz, 2)} GHz</dd>
                  <dt>EC</dt><dd>{num(draft.ec_min_ghz, 3)}–{num(draft.ec_max_ghz, 3)} GHz</dd>
                  <dt>points</dt><dd>{draft.points}</dd>
                </dl>
                <p className="note">Optimality is over the evaluated grid only.</p>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
