import { formatTopicHeadline, TOPICS, type TopicId, topicNumbers } from './explain-topics.ts';
import { textFromGemini, llmInsightsConfigured } from './insight-llm.ts';
import type { ChipSnapshot } from './insight-types.ts';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash';

export interface ExplainResult {
  topic: TopicId | 'multi';
  topics?: TopicId[];
  title: string;
  body: string;
  model: typeof MODEL;
}

export const EXPLAIN_SYSTEM_PROMPT = `You explain highlighted section(s) or window(s) of Qubit Studio, a teaching workbench over a simplified isolated-transmon model (scqubits). The student selected one or more windows and pressed Ask LLM.

Voice:
- Explain simply, as if to a smart undergrad who has not taken a superconducting-qubit course.
- Lead with plain language, then the real symbols and current numbers. Never hide f₀₁, α, E_J, E_C, n_g, or E_J/E_C.
- When multiple windows are selected, explicitly connect how they relate to each other (e.g. how changing a slider in Inspector affects both the 3D junction mesh and the Energy Levels gap).
- Use ONLY numbers from the provided JSON. Do not invent frequencies, lifetimes, T1, T2, yield, or fabrication claims.
- Charge dispersion null / below_reporting_floor is NOT zero — it is smaller than the solver’s reporting floor.
- 2–4 short paragraphs. No bullet-card dump. No markdown headings.

Return ONLY JSON:
{
  "title": "short title highlighting the selected windows and key numbers",
  "body": "simple explanation connecting the selected windows, 2–4 short paragraphs, newlines allowed"
}`;

export function buildExplainUserPrompt(topics: TopicId[], snapshot: ChipSnapshot): string {
  const specs = topics.map((t) => TOPICS[t]).filter(Boolean);
  const topicLabels = specs.map((s) => `${s.label} (${s.symbol})`).join(', ');
  const topicHeadlines = topics.map((t) => formatTopicHeadline(t, snapshot)).join(' | ');

  const numbersCombined = topics.reduce<Record<string, unknown>>((acc, t) => {
    acc[t] = topicNumbers(t, snapshot);
    return acc;
  }, {});

  return [
    `The student selected ${topics.length} window(s) / section(s): ${topicLabels}.`,
    `Selected Live Labels: ${topicHeadlines}`,
    'Specific questions / context:',
    ...specs.map((s) => `- ${s.label}: ${s.ask}`),
    'Numbers for selected sections:',
    JSON.stringify(numbersCombined, null, 2),
    snapshot.stale ? 'A newer calculation is in flight; say so if you quote outputs.' : '',
    snapshot.error ? `Solver error (do not invent replacements): ${snapshot.error}` : '',
    'Full chip snapshot context:',
    JSON.stringify(snapshot),
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseExplainJson(text: string, primaryTopic: TopicId | 'multi', topics?: TopicId[]): ExplainResult | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== 'string' || typeof obj.body !== 'string') return null;
  const body = obj.body.trim();
  if (!body) return null;
  return {
    topic: primaryTopic,
    topics,
    title: obj.title.slice(0, 180),
    body: body.slice(0, 2500),
    model: MODEL,
  };
}

export async function explainTopic(topicOrTopics: TopicId | TopicId[], snapshot: ChipSnapshot): Promise<ExplainResult> {
  if (!llmInsightsConfigured()) {
    throw new Error('GEMINI_API_KEY is not set on the server.');
  }
  const apiKey = process.env.GEMINI_API_KEY as string;

  const topics: TopicId[] = Array.isArray(topicOrTopics) ? topicOrTopics : [topicOrTopics];
  const primaryTopic = topics.length === 1 ? topics[0] : 'multi';

  const response = await fetch(`${GEMINI_URL}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXPLAIN_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildExplainUserPrompt(topics, snapshot) }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed (HTTP ${response.status}): ${detail.slice(0, 240)}`);
  }

  const data: unknown = await response.json();
  const parsed = parseExplainJson(textFromGemini(data), primaryTopic, topics);
  if (!parsed) throw new Error('Gemini returned an explanation that did not match the schema.');
  return parsed;
}
