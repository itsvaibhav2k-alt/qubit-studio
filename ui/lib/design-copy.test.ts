import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DEFAULT_SEARCH_REQUIREMENTS, SEARCH_BOUNDS } from './search-params.ts';
import type { ComparisonKind, Violation } from './search-types.ts';

// design-copy.ts imports './search-params' and './format' without extensions (Next resolves
// them; Node does not). Retry extensionless relative imports with '.ts' for this test only.
register(
  'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier)) {
          return next(specifier + '.ts', context);
        }
        throw error;
      }
    }`),
);
const copy = await import('./design-copy.ts');

// Mirrors the Violation union in search-types.ts and REASONS in search-comparison.ts.
const VIOLATIONS: Violation[] = [
  'charge_budget_khz', 'anharmonicity_floor_mhz', 'ej_lower_ghz', 'ej_upper_ghz', 'ec_lower_ghz',
  'ec_upper_ghz', 'ratio_lower', 'ratio_upper', 'charge_budget_numerical_buffer',
  'requires_negative_anharmonicity', 'frequency_lock_numerical_error', 'frequency_target_mismatch',
  'design_reference_ng_mismatch',
];
const KINDS: ComparisonKind[] = [
  'none', 'pending', 'tightening_cost', 'unchanged', 'infeasible', 'candidate_comparison',
  'changed_context', 'unresolved',
];

describe('requirementsSummary', () => {
  it('should format the default requirements on one line', () => {
    assert.equal(copy.requirementsSummary(DEFAULT_SEARCH_REQUIREMENTS), '5.000 GHz · ≤ 10.000 kHz · ≥ 200 MHz');
  });
});

describe('VIOLATION_LABELS', () => {
  it('should label every violation key', () => {
    for (const key of VIOLATIONS) assert.equal(typeof copy.VIOLATION_LABELS[key], 'string', key);
    for (const key of VIOLATIONS) assert.ok(copy.VIOLATION_LABELS[key].length > 0, key);
  });

  it('should join violations with semicolons', () => {
    assert.equal(
      copy.violationList(['charge_budget_khz', 'anharmonicity_floor_mhz']),
      'charge variation above the limit; separation below the minimum',
    );
  });
});

describe('COMPARISON_KIND_LABELS', () => {
  it('should label every comparison kind', () => {
    for (const kind of KINDS) assert.ok(copy.COMPARISON_KIND_LABELS[kind]?.length > 0, kind);
  });
});

describe('REQUIREMENTS', () => {
  it('should take min and max from SEARCH_BOUNDS without drift', () => {
    for (const spec of copy.REQUIREMENTS) {
      assert.equal(spec.min, SEARCH_BOUNDS[spec.key].min, `${spec.key} min`);
      assert.equal(spec.max, SEARCH_BOUNDS[spec.key].max, `${spec.key} max`);
      assert.equal(spec.fallback, DEFAULT_SEARCH_REQUIREMENTS[spec.key], `${spec.key} fallback`);
    }
  });
});
