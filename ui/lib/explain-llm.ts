import { TOPICS, type TopicId, topicNumbers } from './explain-topics.ts';
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

export const EXPLAIN_SYSTEM_PROMPT = `You are Myla, a teaching assistant sitting next to a student in Qubit Studio (isolated transmon, scqubits). They can already see the label and the number. Do not recap "you clicked X" or restate the value without interpreting it.

Teach the non-obvious part:
- Is this number typical / tight / dangerous for a transmon lab, and why?
- What physical tradeoff does the knob encode (addressability vs charge noise, input vs output, view-only vs Hamiltonian)?
- One concrete next move: which slider to push, and what will get worse.

2–3 sentences, newline-separated. Use LaTeX $f_{01}$, $E_J$, $E_C$, $n_g$, $\\alpha$, $E_J/E_C$, $|0\\rangle$. Never invent $T_1$, $T_2$, yield, or fabrication claims. Charge dispersion below the reporting floor is not zero.

JSON only: {"title":"short interpretive headline","body":"2–3 sentences"}`;

export function buildExplainUserPrompt(topics: TopicId[], snapshot: ChipSnapshot): string {
  const topic = topics[0];
  const spec = topic ? TOPICS[topic] : null;
  const numbers = topic ? topicNumbers(topic, snapshot) : {};
  return [
    spec ? `Topic: ${spec.label} (${spec.symbol}).` : 'Topic: unknown.',
    spec?.ask ?? '',
    'Do not repeat the UI copy. Interpret the numbers.',
    `Numbers: ${JSON.stringify(numbers)}`,
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
  const apiKey = (process.env.GEMINI_API_KEY ?? '').replace(/^["']|["']$/g, '');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on the server.');

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
        temperature: 0.2,
        maxOutputTokens: 320,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal: AbortSignal.timeout(8_000),
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
