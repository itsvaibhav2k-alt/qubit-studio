import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nearestPoint } from './plot-hit.ts';

const points = [
  { id: 'a', x: 10, y: 10 },
  { id: 'b', x: 50, y: 50 },
  { id: 'c', x: 90, y: 10 },
];

describe('nearestPoint', () => {
  it('should return the nearest id when the pointer is inside the radius', () => {
    assert.equal(nearestPoint(points, 47, 52, 14), 'b');
  });

  it('should return the nearest id when the pointer is exactly on the radius', () => {
    assert.equal(nearestPoint(points, 24, 10, 14), 'a');
  });

  it('should return null when every point is outside the radius', () => {
    assert.equal(nearestPoint(points, 50, 10, 14), null);
  });

  it('should return the first point when two are equidistant', () => {
    assert.equal(nearestPoint(points, 50, 10, 100), 'a');
  });

  it('should return null when there are no points', () => {
    assert.equal(nearestPoint([], 0, 0, 14), null);
  });
});
