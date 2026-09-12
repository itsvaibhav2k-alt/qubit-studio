import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitDistance, fittedDistance, sceneRadius } from './camera-fit.ts';
import { PARTS_GEOMETRY } from './chip-geometry.ts';

const FOV = 38;

describe('fitDistance', () => {
  it('should not change with aspect while the vertical fov is limiting (landscape)', () => {
    assert.equal(fitDistance(1, FOV, 1000, 500), fitDistance(1, FOV, 2000, 500));
  });

  it('should grow when the pane goes portrait and the horizontal fov becomes limiting', () => {
    const landscape = fitDistance(1, FOV, 1000, 500);
    const portrait = fitDistance(1, FOV, 500, 1000);
    assert.ok(portrait > landscape);
  });

  it('should return NaN for a degenerate viewport', () => {
    assert.ok(Number.isNaN(fitDistance(1, FOV, 1, 500)));
    assert.ok(Number.isNaN(fitDistance(1, FOV, 500, 0)));
  });
});

describe('sceneRadius', () => {
  it('should be larger exploded than assembled', () => {
    assert.ok(sceneRadius(1, PARTS_GEOMETRY) > sceneRadius(0, PARTS_GEOMETRY));
  });

  it('should match the farthest assembled corner (substrate) plus 5% margin', () => {
    // substrate: x = 1.62/2, y = -0.058 - 0.07/2, z = 1.18/2
    const expected = Math.hypot(0.81, 0.093, 0.59) * 1.05;
    assert.ok(Math.abs(sceneRadius(0, PARTS_GEOMETRY) - expected) < 1e-12);
  });

  it('should be monotone non-decreasing in explode', () => {
    let prev = sceneRadius(0, PARTS_GEOMETRY);
    for (let e = 0.1; e <= 1.0001; e += 0.1) {
      const next = sceneRadius(e, PARTS_GEOMETRY);
      assert.ok(next >= prev, `radius dropped between explode ${e - 0.1} and ${e}`);
      prev = next;
    }
  });
});

describe('fittedDistance', () => {
  it('should keep the current distance when the object already fits (never dollies in)', () => {
    assert.equal(fittedDistance(5, 3), 5);
    assert.equal(fittedDistance(3, 3), 3);
  });
  it('should dolly out to exactly the required distance when the object would clip', () => {
    assert.equal(fittedDistance(1.5, 3.33), 3.33);
  });
  it('should leave the camera alone for a degenerate viewport', () => {
    assert.equal(fittedDistance(2, Number.NaN), 2);
  });
});
