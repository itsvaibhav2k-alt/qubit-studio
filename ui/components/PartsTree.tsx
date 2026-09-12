'use client';

import { useState, useSyncExternalStore } from 'react';

import { ILLUSTRATIVE_PARTS, MODELED_PARTS, PART_BY_ID } from '@/lib/parts';
import type { Part, PartId } from '@/lib/parts';

interface PartsTreeProps {
  compact?: boolean;
  selected: PartId | null;
  hiddenParts: PartId[];
  onSelect: (id: PartId) => void;
  onToggleVisible: (id: PartId) => void;
}

function CubeIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none">
      <path
        d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5L8 1.5Zm0 0v6.5m0 0L2 4.75M8 8l6-3.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      {off && <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

const NARROW_QUERY = () => window.matchMedia('(max-width: 1100px)');
const subscribeNarrow = (onChange: () => void) => {
  const mq = NARROW_QUERY();
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

export default function PartsTree({
  compact = false,
  selected,
  hiddenParts,
  onSelect,
  onToggleVisible,
}: PartsTreeProps): React.ReactElement {
  // Stacked layouts (≤1100px) start collapsed so the list does not push the model off the first screen.
  const narrow = useSyncExternalStore(subscribeNarrow, () => NARROW_QUERY().matches, () => false);
  const [openState, setOpen] = useState<boolean | null>(null);
  const open = openState ?? (!narrow && !compact);
  const current = selected ? PART_BY_ID[selected] : null;

  const row = (part: Part): React.ReactElement => {
    const hidden = hiddenParts.includes(part.id);
    const cls = ['tree-row', part.modeled ? '' : 'dim', hidden ? 'hidden-part' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div key={part.id} className="tree-item">
        <button
          type="button"
          className={cls}
          aria-selected={selected === part.id}
          role="option"
          onClick={() => onSelect(part.id)}
        >
          <span className="swatch" style={{ background: part.color }} />
          <span className="label">{part.name}</span>
          {!part.modeled && <span className="tag">context</span>}
        </button>
        <button
          type="button"
          className="eye"
          aria-label={`${hidden ? 'Show' : 'Hide'} ${part.name}`}
          title={`${hidden ? 'Show' : 'Hide'} in views`}
          onClick={() => onToggleVisible(part.id)}
        >
          <EyeIcon off={hidden} />
        </button>
      </div>
    );
  };

  return (
    <div className="components">
      <button
        type="button"
        className="components-toggle"
        aria-expanded={open}
        aria-controls="parts-tree"
        onClick={() => setOpen(!open)}
      >
        <CubeIcon />
        <span>Components</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
          <path d="m2 4 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className={`components-crumb${current ? '' : ' none'}`}>
        <span className="crumb-num">{current ? current.number : '—'}</span>
        <span className="slash">/</span>
        <span>{current ? current.name : 'No component selected'}</span>
      </div>
      <div id="parts-tree" className="tree" role="listbox" aria-label="Parts tree" hidden={!open}>
        {MODELED_PARTS.map(row)}
        <details className="context-parts">
          <summary>Assembly context</summary>
          {ILLUSTRATIVE_PARTS.map(row)}
        </details>
      </div>
    </div>
  );
}
