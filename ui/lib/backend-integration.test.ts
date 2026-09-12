import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildChipSnapshot } from './insight-snapshot.ts';
import { composeLocalMyla } from './explain-local.ts';
import { TOPIC_IDS } from './explain-topics.ts';
import { createExplainHandler } from './explain-handler.ts';
import { createDesignShareUrl, parseDesignShareUrl } from './design-link.ts';
import { buildDesignReportPdf } from './design-report.ts';

const fixtures = JSON.parse(readFileSync(new URL('../../qa/browser/fixtures/solver.json', import.meta.url), 'utf8'));
const goals = { target_ghz: 5, tolerance_ghz: .25, min_anharmonicity_mhz: 200, max_dispersion_khz: 10 };
const snapshot = () => buildChipSnapshot({ params: fixtures.params, result: fixtures.evaluate, baseline: null, selected: 'junction', stale: false, error: null, goals, materials: { topMaterial: 'Al', baseMaterial: 'Si' }, explode: .5 });

test('local teaching requires validated completed evidence and identifies its source honestly', () => {
  const ready = snapshot();
  assert.equal(ready.readiness, 'ready');
  for (const topic of TOPIC_IDS) {
    const local = composeLocalMyla(topic, ready);
    assert.equal(local.model, 'local-teaching'); assert.ok(local.body.length > 0);
    assert.equal(composeLocalMyla(topic, { ...ready, stale: true }).body, 'Wait for a completed current calculation.');
    assert.equal(composeLocalMyla(topic, { ...ready, readiness: 'pending', outputs: null }).body, 'Wait for a completed current calculation.');
  }
});

test('every expanded topic is accepted by the bounded route without a live provider', async () => {
  const seen: string[] = [];
  const handler = createExplainHandler({ configured: () => true, explain: async topics => {
    seen.push(...topics); return { topic: topics[0], title: 'Mock response', body: 'Explicitly mocked provider.', model: 'gemini-2.5-flash' };
  } });
  for (const topic of TOPIC_IDS) {
    const response = await handler(new Request('http://local/api/explain', { method: 'POST', body: JSON.stringify({ topics: [topic], snapshot: snapshot() }) }));
    assert.equal(response.status, 200, topic);
  }
  assert.deepEqual(seen, [...TOPIC_IDS]);
});

test('share links retain full main goal bounds and exact electrical coordinates', () => {
  const design = { params: { ej_ghz: 16.123456789, ec_ghz: .3123456789, ng: 0, ncut: 40 }, goals: { ...goals, max_dispersion_khz: 50000, min_anharmonicity_mhz: 1500 }, topMaterial: 'Al', baseMaterial: 'Si' };
  assert.deepEqual(parseDesignShareUrl(createDesignShareUrl(design, 'https://example.test')), design);
});

test('real PDF includes the producing cutoff and model provenance', async () => {
  const bytes = await buildDesignReportPdf({ generatedAt: '2026-09-12T16:00:00Z', goals, design: fixtures.search.selected,
    material: { name: 'Al on Si', lossRange: '1e-6', preparation: 'Recorded treatment', difficulty: 'Heuristic only', rank: 1, total: 10, sourceUrl: 'https://example.test' },
    explanation: 'Evaluated grid recommendation; materials are independent evidence.', provenance: { ng: 0, ncut: 40, modelVersion: 'integration-provenance' } });
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^%PDF-/); assert.match(text, /ncut 40/); assert.match(text, /integration-provenance/);
});
