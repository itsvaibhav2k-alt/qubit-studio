import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logPosition, logValue, roundSignificant } from './log-scale.ts';

const MIN = 0.01;
const MAX = 100000;

describe('logPosition', () => {
  it('should map the range ends to 0 and 1', () => {
    assert.equal(logPosition(MIN, MIN, MAX), 0);
    assert.equal(logPosition(MAX, MIN, MAX), 1);
  });

  it('should place 1 kHz two decades into a seven-decade range', () => {
    assert.ok(Math.abs(logPosition(1, MIN, MAX) - 2 / 7) < 1e-12);
  });

  it('should clamp values outside the range', () => {
    assert.equal(logPosition(0.0001, MIN, MAX), 0);
    assert.equal(logPosition(1e9, MIN, MAX), 1);
  });
});

describe('logValue', () => {
  it('should invert logPosition', () => {
    for (const value of [0.01, 0.37, 1, 10, 4321, 100000]) {
      assert.ok(Math.abs(logValue(logPosition(value, MIN, MAX), MIN, MAX) - value) < 1e-9, String(value));
    }
  });

  it('should clamp positions outside 0..1', () => {
    assert.ok(Math.abs(logValue(-0.5, MIN, MAX) - MIN) < 1e-9);
    assert.ok(Math.abs(logValue(1.5, MIN, MAX) - MAX) < 1e-9);
  });
});

describe('roundSignificant', () => {
  it('should keep three significant digits above and below one', () => {
    assert.equal(roundSignificant(12345.678, 3), 12300);
    assert.equal(roundSignificant(0.012345, 3), 0.0123);
  });

  it('should pass zero and non-finite values through', () => {
    assert.equal(roundSignificant(0, 3), 0);
    assert.equal(roundSignificant(Number.POSITIVE_INFINITY, 3), Number.POSITIVE_INFINITY);
  });
});
