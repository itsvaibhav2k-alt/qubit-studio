/** Logarithmic slider positioning. A seven-decade range (0.01 → 100 000 kHz) is unusable linearly. */

/** Map a value in [min, max] to a position in [0, 1] on a log scale. */
export function logPosition(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/** Inverse of logPosition: position in [0, 1] → value in [min, max]. */
export function logValue(position: number, min: number, max: number): number {
  const p = Math.min(1, Math.max(0, position));
  return Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min)));
}

/** Round to a sensible number of significant digits for display after a log slider move. */
export function roundSignificant(value: number, digits: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, digits - 1 - magnitude);
  return Math.round(value * factor) / factor;
}
