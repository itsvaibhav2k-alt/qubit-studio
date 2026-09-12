'use client';

import { useState, type CSSProperties } from 'react';
import { PARAMS, clampParam } from '@/lib/params';
import type { ParamKey } from '@/lib/params';

interface ParamFieldProps {
  paramKey: ParamKey;
  value: number;
  onChange: (key: ParamKey, value: number) => void;
  /** 'large' = the inspector's big value box with stepper and ticks; 'compact' = the dock/popover row. */
  size?: 'compact' | 'large';
}

const TICKS = 10;

/** Slider plus exact numeric entry. Out-of-range text is rejected, not silently clamped. */
export default function ParamField({ paramKey, value, onChange, size = 'compact' }: ParamFieldProps) {
  const spec = PARAMS[paramKey];
  const [text, setText] = useState(value.toFixed(spec.digits));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(value);

  // The value can change from outside (reset, another control): re-sync the text box.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value.toFixed(spec.digits));
    setInvalid(null);
  }

  const commitText = (raw: string) => {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setInvalid('Enter a number.');
      return;
    }
    if (parsed < spec.min || parsed > spec.max) {
      setInvalid(`The model accepts ${spec.min} to ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}.`);
      return;
    }
    setInvalid(null);
    // Mark this value as already reflected so the echo back from the parent
    // does not overwrite what is being typed.
    setSyncedValue(parsed);
    onChange(paramKey, parsed);
  };

  const step = (direction: 1 | -1) => {
    const next = Number((value + direction * spec.step).toFixed(spec.digits));
    onChange(paramKey, clampParam(paramKey, next));
  };

  const atDefault = value === spec.fallback;
  const id = `p-${paramKey}`;

  const slider = (
    <input
      id={id}
      type="range"
      style={{ '--range-fill': `${100 * (value - spec.min) / (spec.max - spec.min)}%` } as CSSProperties}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      value={value}
      list={size === 'large' ? `${id}-ticks` : undefined}
      onChange={(event) => onChange(paramKey, clampParam(paramKey, Number(event.target.value)))}
    />
  );

  const exact = (
    <input
      className="num"
      type="text"
      inputMode="decimal"
      aria-label={`${spec.label} exact value`}
      aria-invalid={invalid ? 'true' : 'false'}
      value={text}
      onChange={(event) => commitText(event.target.value)}
      onBlur={() => {
        if (invalid) {
          setText(value.toFixed(spec.digits));
          setInvalid(null);
        }
      }}
    />
  );

  if (size === 'large') {
    return (
      <div className="field large">
        <div className="field-head">
          <label htmlFor={id}>{spec.label}</label>
          <span className="dot" aria-hidden="true">·</span>
          <span className="sym">{spec.symbol}</span>
        </div>
        <div className="big-row">
          <div className="big-box">
            {exact}
            <div className="stepper">
              <button type="button" aria-label={`Increase ${spec.label}`} onClick={() => step(1)}>
                <svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 6.5 6 1.5l5 5" /></svg>
              </button>
              <button type="button" aria-label={`Decrease ${spec.label}`} onClick={() => step(-1)}>
                <svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" /></svg>
              </button>
            </div>
          </div>
          {spec.unit && <span className="unit">{spec.unit}</span>}
        </div>
        {invalid && <p className="field-msg">{invalid}</p>}
        <div className="slider-row">
          <span className="end">{spec.min}</span>
          {slider}
          <span className="end">{spec.max}</span>
        </div>
        <datalist id={`${id}-ticks`}>
          {Array.from({ length: TICKS + 1 }, (_, i) => spec.min + ((spec.max - spec.min) * i) / TICKS).map(
            (tick) => <option key={tick} value={tick} />,
          )}
        </datalist>
        <p className="field-note">{spec.meaning}</p>
      </div>
    );
  }

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{spec.label}</label>
        <span className="sym">{spec.symbol}</span>
        <button
          type="button"
          className="reset"
          onClick={() => onChange(paramKey, spec.fallback)}
          disabled={atDefault}
          style={atDefault ? { color: 'var(--text-3)', cursor: 'default' } : undefined}
        >
          reset
        </button>
      </div>
      <div className="field-row">
        {slider}
        {exact}
        <span className="unit">{spec.unit}</span>
      </div>
      {invalid && <p className="field-msg">{invalid}</p>}
    </div>
  );
}
