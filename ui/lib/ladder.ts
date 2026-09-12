/** Energy-ladder vertical placement. Spacing is proportional to energy, never evenly listed. */
export function ladderY(levels: readonly number[], height: number, pad: number): number[] {
  const top = Math.max(...levels, 0) || 1;
  const span = height - 2 * pad;
  return levels.map((value) => height - pad - (value / top) * span);
}
