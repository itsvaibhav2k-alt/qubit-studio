import type { ChipSnapshot } from './insight-types.ts';
import { num, signed } from './format.ts';

export const TOPIC_IDS = [
  'f01',
  'alpha',
  'dispersion',
  'ratio',
  'levels',
  'charge',
  'junction',
  'capacitor',
  'gate',
  'ground',
  'substrate',
  'regime',
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export interface TopicSpec {
  id: TopicId;
  label: string;
  symbol: string;
  /** Instruction to Gemini: what to explain, simply. */
  ask: string;
}

export const TOPICS: Record<TopicId, TopicSpec> = {
  f01: {
    id: 'f01',
    label: 'Operating frequency',
    symbol: 'f₀₁',
    ask: 'Explain this chip’s operating frequency f₀₁ in simple language. What does the number mean in the lab, and what would change it?',
  },
  alpha: {
    id: 'alpha',
    label: 'Level spacing',
    symbol: 'α',
    ask: 'Explain anharmonicity α for this chip in simple language. Why does uneven spacing make a qubit instead of an LC oscillator?',
  },
  dispersion: {
    id: 'dispersion',
    label: 'Charge-noise sensitivity',
    symbol: 'δf₀₁',
    ask: 'Explain charge dispersion for this chip in simple language. Is the frequency well protected from stray charge right now?',
  },
  ratio: {
    id: 'ratio',
    label: 'Transmon ratio',
    symbol: 'E_J/E_C',
    ask: 'Explain the E_J/E_C ratio for this chip in simple language. Are we in the transmon window, and what would leaving it do?',
  },
  levels: {
    id: 'levels',
    label: 'Energy levels',
    symbol: '|0⟩, |1⟩, |2⟩',
    ask: 'Explain the energy-level ladder on this chip in simple language. What are |0⟩, |1⟩, and |2⟩, and what do the f₀₁ and f₁₂ gaps mean?',
  },
  charge: {
    id: 'charge',
    label: 'Charge response',
    symbol: 'f₀₁ vs n_g',
    ask: 'Explain the charge-response curve in simple language. What does a flat vs wiggly line mean for this chip?',
  },
  junction: {
    id: 'junction',
    label: 'Josephson junction',
    symbol: 'E_J',
    ask: 'Explain the Josephson junction and its current E_J in simple language. What happens if the student raises or lowers it?',
  },
  capacitor: {
    id: 'capacitor',
    label: 'Shunt capacitor pads',
    symbol: 'E_C',
    ask: 'Explain the shunt capacitor pads and the current charging energy E_C in simple language. What trade-off does the student make by changing it?',
  },
  gate: {
    id: 'gate',
    label: 'Charge gate line',
    symbol: 'n_g',
    ask: 'Explain the charge gate and the current offset charge n_g in simple language. Why sweep it, and what should a transmon do when you do?',
  },
  ground: {
    id: 'ground',
    label: 'Ground plane',
    symbol: 'context',
    ask: 'Explain the ground plane in this workbench in simple language. Be clear that it is drawn for context and is not an input to this isolated-transmon model.',
  },
  substrate: {
    id: 'substrate',
    label: 'Substrate',
    symbol: 'context',
    ask: 'Explain the substrate in this workbench in simple language. Be clear that thickness is illustrative and that any material picker is a teaching scale, not a capacitance extractor.',
  },
  regime: {
    id: 'regime',
    label: 'Operating regime',
    symbol: 'E_J/E_C window',
    ask: 'Explain whether this chip is in the transmon regime in simple language, using the current E_J/E_C ratio.',
  },
};

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === 'string' && (TOPIC_IDS as readonly string[]).includes(value);
}

export function topicFromPart(partId: string | null): TopicId | null {
  if (partId && isTopicId(partId)) return partId;
  return null;
}

/** Numbers Gemini is allowed to use for this topic — never invent beyond this. */
export function topicNumbers(
  topic: TopicId,
  snapshot: ChipSnapshot,
): Record<string, string | number | boolean | number[] | null> {
  const out = snapshot.outputs;
  const { params } = snapshot;
  const base = {
    E_J_GHz: params.ej_ghz,
    E_C_GHz: params.ec_ghz,
    n_g: params.ng,
    EJ_over_EC: Number(num(params.ratio, 1)),
  };
  if (!out) return { ...base, solver: 'no completed calculation' };

  const shared = {
    ...base,
    f01_GHz: out.f01_ghz,
    f12_GHz: out.f12_ghz,
    alpha_MHz: out.alpha_mhz,
    dispersion_kHz: out.dispersion_khz,
    dispersion_status: out.dispersion_status,
    dispersion_upper_kHz: out.dispersion_upper_khz,
  };

  switch (topic) {
    case 'f01':
      return { ...shared, note: 'f01 is a solver output, not a typed-in target' };
    case 'alpha':
      return { ...shared, formula: 'α = f12 − f01 ≈ −E_C' };
    case 'dispersion':
    case 'charge':
      return { ...shared, charge_shift_peak_kHz: out.charge_shift_peak_khz };
    case 'ratio':
    case 'regime':
      return { ...shared, transmon_floor: 20 };
    case 'levels':
      return { ...shared, levels_GHz: out.levels_ghz };
    case 'junction':
      return { ...shared, control: 'E_J slider' };
    case 'capacitor':
      return { ...shared, control: 'E_C slider' };
    case 'gate':
      return { ...shared, control: 'n_g slider' };
    case 'ground':
    case 'substrate':
      return { ...base, modeled: false };
    default:
      return shared;
  }
}

export function formatTopicHeadline(topic: TopicId, snapshot: ChipSnapshot): string {
  const spec = TOPICS[topic];
  const out = snapshot.outputs;
  if (!out) return spec.label;
  switch (topic) {
    case 'f01':
      return `${spec.label} · ${num(out.f01_ghz, 3)} GHz`;
    case 'alpha':
      return `${spec.label} · ${signed(out.alpha_mhz, 1)} MHz`;
    case 'dispersion':
      return out.dispersion_khz === null
        ? `${spec.label} · < ${num(out.dispersion_upper_khz, 3)} kHz`
        : `${spec.label} · ${num(out.dispersion_khz, 2)} kHz`;
    case 'ratio':
    case 'regime':
      return `${spec.label} · E_J/E_C ${num(snapshot.params.ratio, 1)}`;
    case 'junction':
      return `${spec.label} · E_J ${num(snapshot.params.ej_ghz, 2)} GHz`;
    case 'capacitor':
      return `${spec.label} · E_C ${num(snapshot.params.ec_ghz, 3)} GHz`;
    case 'gate':
      return `${spec.label} · n_g ${num(snapshot.params.ng, 3)}`;
    default:
      return spec.label;
  }
}
