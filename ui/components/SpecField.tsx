'use client';

import { useState } from 'react';
import type { RequirementSpec } from '@/lib/design-copy';
import { sliderPosition, sliderValue, LOG_SLIDER_STEPS } from '@/lib/requirements-panel';

/** RequirementSpec with an open key so callers can build one-off specs (ncut). */
export type FieldSpec = Omit<RequirementSpec, 'key'> & { key: string; integer?: boolean };

export interface SpecFieldProps {
  spec: FieldSpec;
  value: number;
  onChange: (value: number) => void;
  /** Server-side field error, shown under the row when the local text is valid. */
  error?: string;
}

// ponytail: ParamField is this with PARAMS baked in; swap it for SpecField when Explore is next touched.
/** Slider plus exact numeric entry. Out-of-range text is rejected, not silently clamped. */
export default function SpecField({ spec, value, onChange, error }: SpecFieldProps) {
  const [text, setText] = useState(value.toFixed(spec.digits));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(value);

  // The value can change from outside (reset, slider, seed): re-sync the text box.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value.toFixed(spec.digits));
    setInvalid(null);
  }

  const commitText = (raw: string) => {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return setInvalid('Enter a number.');
    if (spec.integer && !Number.isInteger(parsed)) return setInvalid('Enter a whole number.');
    if (parsed < spec.min || parsed > spec.max) {
      return setInvalid(`Accepted range: ${spec.min} to ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}.`);
    }
    setInvalid(null);
    setSyncedValue(parsed); // already reflected; the parent echo must not clobber typing
    onChange(parsed);
  };

  const atDefault = value === spec.fallback;
  const id = `spec-${spec.key}`;
  const message = invalid ?? error;

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{spec.label}</label>
        <span className="sym">{spec.symbol}</span>
        <button type="button" className="reset" onClick={() => onChange(spec.fallback)} disabled={atDefault}>
          reset
        </button>
      </div>
      <div className="field-row">
        <input
          id={id}
          type="range"
          min={spec.log ? 0 : spec.min}
          max={spec.log ? LOG_SLIDER_STEPS : spec.max}
          step={spec.log ? 1 : spec.step}
          value={sliderPosition(value, spec)}
          aria-valuetext={`${value.toFixed(spec.digits)}${spec.unit ? ` ${spec.unit}` : ''}`}
          onChange={(event) => onChange(sliderValue(Number(event.target.value), spec))}
        />
        <input
          className="num"
          type="text"
          inputMode="decimal"
          aria-label={`${spec.label} exact value`}
          aria-invalid={message ? 'true' : 'false'}
          value={text}
          onChange={(event) => commitText(event.target.value)}
          onBlur={() => {
            if (invalid) {
              setText(value.toFixed(spec.digits));
              setInvalid(null);
            }
          }}
        />
        <span className="unit">{spec.unit}</span>
      </div>
      {message && <p className="field-msg">{message}</p>}
    </div>
  );
}
