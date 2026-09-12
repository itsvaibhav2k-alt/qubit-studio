'use client';

import { useState } from 'react';
import MathText from '@/components/MathText';
import { PARAMS, clampParam } from '@/lib/params';
import type { ParamKey } from '@/lib/params';

interface ParamFieldProps {
  paramKey: ParamKey;
  value: number;
  onChange: (key: ParamKey, value: number) => void;
  onAsk?: (key: ParamKey) => void;
  tourId?: string;
}

/** Slider plus exact numeric entry. Out-of-range text is rejected, not silently clamped. */
export default function ParamField({ paramKey, value, onChange, onAsk, tourId }: ParamFieldProps) {
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

  const atDefault = value === spec.fallback;

  return (
    <div className="field" data-tour={tourId}>
      <div className="field-head">
        <label htmlFor={`p-${paramKey}`} className={onAsk ? 'myla-hit' : undefined} onClick={() => onAsk?.(paramKey)}>
          {spec.label}
        </label>
        <span className="sym"><MathText math={spec.symbol} /></span>
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
        <input
          id={`p-${paramKey}`}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(event) => onChange(paramKey, clampParam(paramKey, Number(event.target.value)))}
        />
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
        <span className="unit">{spec.unit}</span>
      </div>
      {invalid && <p className="field-msg">{invalid}</p>}
    </div>
  );
}
