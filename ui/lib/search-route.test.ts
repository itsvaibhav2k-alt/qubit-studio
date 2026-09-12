import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST } from '../app/api/search/route.ts';
import { requestDesignSearch, SearchRequestError } from './useDesignSearch.ts';
import { DEFAULT_SEARCH_REQUIREMENTS } from './search-params.ts';

const fixture = JSON.parse(readFileSync(new URL('./search-examples.json', import.meta.url), 'utf8'));
const request = (value: unknown) => new Request('http://localhost/api/search', { method: 'POST', body: JSON.stringify(value) });
test('proxy forwards normalized requirements and returns a real complete response', async (t) => {
  let sent: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => { sent = options; return Response.json(fixture.searches.loose); });
  const response = await POST(request({}));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(sent!.body as string), { ...DEFAULT_SEARCH_REQUIREMENTS, baseline: null });
  assert.equal(sent!.cache, 'no-store');
  assert.ok(sent!.signal instanceof AbortSignal);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).selected.candidate_id, fixture.searches.loose.selected.candidate_id);
});
test('proxy rejects invalid input without a backend call', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  assert.equal((await POST(request({ target_ghz: true }))).status, 422);
  assert.equal((await POST(new Request('http://localhost/api/search', { method: 'POST', body: '{bad' }))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});
test('proxy handles errors, non-JSON responses, timeouts and old contracts explicitly', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Invalid requirements.', field_errors: { points: ['Integer required.'] } }, { status: 422 }));
  let response = await POST(request({}));
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).field_errors.points, ['Integer required.']);
  fetch.mock.mockImplementation(async () => new Response('not JSON'));
  assert.equal((await POST(request({}))).status, 502);
  fetch.mock.mockImplementation(async () => Response.json({ status: 'infeasible' }));
  assert.equal((await POST(request({}))).status, 502);
  fetch.mock.mockImplementation(async () => { throw new DOMException('timeout', 'TimeoutError'); });
  assert.equal((await POST(request({}))).status, 504);
  fetch.mock.mockImplementation(async () => { throw new Error('network'); });
  response = await POST(request({}));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No designs were estimated locally/);
});
test('proxy refuses an otherwise valid response for another target or saved baseline', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(fixture.searches.loose));
  assert.equal((await POST(request({ target_ghz: 6 }))).status, 502);
  fetch.mock.mockImplementation(async () => Response.json(fixture.searches.tight));
  assert.equal((await POST(request({ max_dispersion_khz: 1 }))).status, 502);
});
test('client boundary rejects mismatched responses and normalizes field errors', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(fixture.searches.loose));
  const signal = new AbortController().signal;
  await assert.rejects(requestDesignSearch({ ...DEFAULT_SEARCH_REQUIREMENTS, target_ghz: 6 }, signal), /does not match/);
  fetch.mock.mockImplementation(async () => Response.json({ error: 'Invalid', field_errors: { points: ['range'], junk: [3] } }, { status: 422 }));
  await assert.rejects(requestDesignSearch(DEFAULT_SEARCH_REQUIREMENTS, signal), (error: unknown) => {
    assert.ok(error instanceof SearchRequestError);
    assert.deepEqual(error.fieldErrors, { points: ['range'] });
    return true;
  });
});
