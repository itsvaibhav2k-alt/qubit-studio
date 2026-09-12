import { parseSearchResponse, requirementsKey, validateSearchRequest } from '../../../lib/search-params.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Request body was not valid JSON.' }, { status: 400 }); }
  const checked = validateSearchRequest(body);
  if (!checked.valid) return Response.json({ error: 'Invalid search requirements.', field_errors: checked.fieldErrors }, { status: 422 });
  const backend = process.env.QUBIT_API_URL ?? 'http://127.0.0.1:8000';
  try {
    const upstream = await fetch(`${backend}/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checked.request), cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    });
    let payload: unknown;
    try { payload = await upstream.json(); }
    catch { return Response.json({ error: 'Search backend returned a non-JSON response.' }, { status: 502 }); }
    if (!upstream.ok) {
      const p = payload as { error?: unknown; detail?: unknown; field_errors?: unknown } | null;
      const message = typeof p?.error === 'string' ? p.error : typeof p?.detail === 'string' ? p.detail : `Search failed (HTTP ${upstream.status}).`;
      return Response.json({ error: message, ...(p?.field_errors && typeof p.field_errors === 'object' ? { field_errors: p.field_errors } : {}) }, { status: upstream.status });
    }
    const result = parseSearchResponse(payload);
    if (requirementsKey(result.request) !== requirementsKey(checked.request) || JSON.stringify(result.request.baseline ?? null) !== JSON.stringify(checked.request.baseline ?? null)) {
      return Response.json({ error: 'Search backend response does not match the submitted request.' }, { status: 502 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    return Response.json({ error: timeout ? 'Search timed out. Retry the bounded search.' : error instanceof Error && error.message.includes('response contract') ? error.message : 'Simulation backend did not answer. No designs were estimated locally.' }, { status: timeout ? 504 : 502 });
  }
}
