import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SEARCH_REQUIREMENTS, SEARCH_BOUNDS } from './search-params.ts';
import {
  LOG_SLIDER_STEPS, nextCollapsed, sliderPosition, sliderValue, statusLine, statusText, unattachedErrors,
} from './requirements-panel.ts';
import type { SearchResponse } from './search-types.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
const loose = fixture.searches.loose as SearchResponse;
const infeasible = fixture.searches.infeasible as SearchResponse;
const copy = { summary: () => 'SUMMARY', infeasible: 'INFEASIBLE.' };
const draft = DEFAULT_SEARCH_REQUIREMENTS;

describe('sliderPosition / sliderValue', () => {
  const spec = { ...SEARCH_BOUNDS.max_dispersion_khz, log: true };

  it('should map the log endpoints to the slider ends', () => {
    assert.equal(sliderPosition(spec.min, spec), 0);
    assert.equal(sliderPosition(spec.max, spec), LOG_SLIDER_STEPS);
    assert.equal(sliderValue(0, spec), spec.min);
    assert.equal(sliderValue(LOG_SLIDER_STEPS, spec), spec.max);
  });

  it('should round a log slider move to three significant digits inside the bounds', () => {
    const value = sliderValue(437, spec);
    assert.equal(value, Number(value.toPrecision(3)));
    assert.ok(value >= spec.min && value <= spec.max);
  });

  it('should round-trip the default dispersion through the slider', () => {
    const back = sliderValue(sliderPosition(10, spec), spec);
    assert.ok(Math.abs(back - 10) / 10 < 0.02);
  });

  it('should pass linear specs through and clamp them', () => {
    const linear = SEARCH_BOUNDS.target_ghz;
    assert.equal(sliderPosition(5.5, linear), 5.5);
    assert.equal(sliderValue(9, linear), linear.max);
  });
});

describe('nextCollapsed', () => {
  it('should collapse only when running becomes ready', () => {
    assert.equal(nextCollapsed('running', 'ready', false), true);
    assert.equal(nextCollapsed('dirty', 'ready', false), false);
  });

  it('should expand on dirty, infeasible and error', () => {
    assert.equal(nextCollapsed('ready', 'dirty', true), false);
    assert.equal(nextCollapsed('running', 'infeasible', true), false);
    assert.equal(nextCollapsed('running', 'error', true), false);
  });

  it('should keep the current state on other transitions', () => {
    assert.equal(nextCollapsed('dirty', 'running', false), false);
    assert.equal(nextCollapsed('ready', 'running', true), true);
  });
});

describe('statusLine', () => {
  it('should say not searched yet when dirty without a run', () => {
    assert.equal(statusText(statusLine('dirty', draft, null, false, copy)), 'Not searched yet.');
  });

  it('should warn with the last request summary when dirty after a run', () => {
    const line = statusLine('dirty', draft, loose, false, copy);
    assert.equal(line?.tone, 'warn');
    assert.equal(statusText(line), 'Requirements changed — results below are for SUMMARY');
  });

  it('should describe the running search from the draft', () => {
    assert.equal(statusText(statusLine('running', draft, null, false, copy)), 'Searching 401 designs at 5.000 GHz…');
  });

  it('should report the qualifying count from the captured feasible response', () => {
    const line = statusLine('ready', draft, loose, true, copy);
    assert.equal(line?.tone, 'plain');
    assert.equal(statusText(line), '203 of 401 evaluated designs qualify.');
  });

  it('should treat a stale ready result as changed requirements', () => {
    assert.equal(statusLine('ready', draft, loose, false, copy)?.tone, 'warn');
  });

  it('should use the infeasible sentence and evaluated count verbatim', () => {
    const line = statusLine('infeasible', draft, infeasible, true, copy);
    assert.equal(line?.tone, 'warn');
    assert.equal(statusText(line), 'INFEASIBLE. 401 evaluated.');
  });

  it('should return null for error and for ready without a run', () => {
    assert.equal(statusLine('error', draft, loose, true, copy), null);
    assert.equal(statusLine('ready', draft, null, true, copy), null);
  });
});

describe('unattachedErrors', () => {
  it('should list only errors that no field owns', () => {
    const errors = { target_ghz: ['bad'], request: ['Expected a JSON object.'], 'baseline.ng': ['Unknown parameter.'] };
    assert.deepEqual(unattachedErrors(errors, ['target_ghz']), [
      'request: Expected a JSON object.',
      'baseline.ng: Unknown parameter.',
    ]);
  });
});
