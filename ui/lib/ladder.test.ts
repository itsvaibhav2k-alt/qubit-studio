import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ladderY } from './ladder.ts';

describe('ladderY', () => {
  it('should place the ground level at the bottom and the top level at the top', () => {
    const y = ladderY([0, 5.68, 11.02, 15.97], 132, 14);
    assert.equal(y[0], 132 - 14);
    assert.ok(Math.abs(y[3] - 14) < 1e-12);
  });

  it('should keep spacing proportional to energy (uneven gaps stay uneven)', () => {
    const levels = [0, 5.683, 11.02, 15.973];
    const y = ladderY(levels, 132, 14);
    const gap01 = y[0] - y[1];
    const gap12 = y[1] - y[2];
    const gap23 = y[2] - y[3];
    assert.ok(gap01 > gap12 && gap12 > gap23);
    const ratio = (levels[1] - levels[0]) / (levels[2] - levels[1]);
    assert.ok(Math.abs(gap01 / gap12 - ratio) < 1e-9);
  });

  it('should not divide by zero for a single zero level', () => {
    assert.deepEqual(ladderY([0], 100, 10), [90]);
  });
});
