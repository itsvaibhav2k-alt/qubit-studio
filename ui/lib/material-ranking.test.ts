import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  recommendMaterialStack,
  VALID_RESONATOR_STACKS,
} from './material-ranking.ts';
import { MATERIAL_CATALOG } from './material-records.ts';

describe('material stack selection', () => {
  it('only exposes curated real material names', () => {
    assert.ok(MATERIAL_CATALOG.length > 1);
    assert.equal(MATERIAL_CATALOG.includes('A' as never), false);
    assert.equal(MATERIAL_CATALOG.includes('S' as never), false);
    assert.equal(MATERIAL_CATALOG.includes('barrier layer' as never), false);
  });

  it('changes recommendation when the ranking priority changes', () => {
    const processFirst = recommendMaterialStack(0, 'any');
    const lossFirst = recommendMaterialStack(100, 'any');
    assert.notEqual(processFirst.id, lossFirst.id);
    assert.equal(VALID_RESONATOR_STACKS.includes(processFirst), true);
    assert.equal(VALID_RESONATOR_STACKS.includes(lossFirst), true);
  });

  it('honors a required substrate', () => {
    assert.equal(recommendMaterialStack(50, 'Si').substrate, 'Si');
    assert.equal(recommendMaterialStack(50, 'Al₂O₃ (sapphire)').substrate, 'Al₂O₃ (sapphire)');
  });
});
