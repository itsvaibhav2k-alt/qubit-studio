import { explainTopic } from '../../../lib/explain-llm.ts';
import { isTopicId, type TopicId } from '../../../lib/explain-topics.ts';
import { parseChipSnapshot } from '../../../lib/insight-snapshot.ts';
import { llmInsightsConfigured } from '../../../lib/insight-llm.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body was not valid JSON.' }, { status: 400 });
  }

  if (body === null || typeof body !== 'object') {
    return Response.json({ error: 'Explain request must be a JSON object.' }, { status: 400 });
  }
  const source = body as Record<string, unknown>;

  let topics: TopicId[] = [];
  if (Array.isArray(source.topics)) {
    topics = source.topics.filter(isTopicId);
  } else if (isTopicId(source.topic)) {
    topics = [source.topic];
  }

  if (topics.length === 0) {
    return Response.json({ error: 'Provide at least one valid topic or window selection.' }, { status: 400 });
  }

  const parsed = parseChipSnapshot(source.snapshot);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  if (!llmInsightsConfigured()) {
    return Response.json({ error: 'GEMINI_API_KEY is not set on the server.' }, { status: 503 });
  }

  try {
    const result = await explainTopic(topics, parsed.snapshot);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
