import type { ParamKey } from './params';

export type PartId = 'junction' | 'capacitor' | 'gate' | 'ground' | 'substrate' | 'board' | 'package';

export interface Part {
  id: PartId;
  /** Two-digit callout number shown in the components list, breadcrumb and inspector badge. */
  number: string;
  name: string;
  role: string;
  /** true = this part carries a model input; false = drawn for context only. */
  modeled: boolean;
  param?: ParamKey;
  /** Swatch colour; matches the rendered material. */
  color: string;
}

export const PARTS: Part[] = [
  {
    id: 'junction',
    number: '01',
    name: 'Josephson junction',
    role: 'The one nonlinear element. Its Josephson energy sets how unevenly the energy levels are spaced.',
    modeled: true,
    param: 'ej_ghz',
    color: '#c7a566',
  },
  {
    id: 'capacitor',
    number: '02',
    name: 'Capacitor pads',
    role: 'Two large pads across the junction. Bigger pads mean a smaller charging energy.',
    modeled: true,
    param: 'ec_ghz',
    color: '#c9ced4',
  },
  {
    id: 'gate',
    number: '03',
    name: 'Charge gate',
    role: 'Applies a static offset charge to the island. Sweeping it shows how sensitive the qubit is to stray charge.',
    modeled: true,
    param: 'ng',
    color: '#b8955a',
  },
  {
    id: 'ground',
    number: '04',
    name: 'Ground plane',
    role: 'Metal film surrounding the pads. Drawn for context; it is not an input to this model.',
    modeled: false,
    color: '#8d949c',
  },
  {
    id: 'substrate',
    number: '05',
    name: 'Substrate',
    role: 'The chip the metal sits on. Drawn for context; thickness and material are illustrative only.',
    modeled: false,
    color: '#2b4a63',
  },
  {
    id: 'board',
    number: '06',
    name: 'Carrier board',
    role: 'Board and bond pads that carry the chip. Drawn for context; nothing here enters the calculation.',
    modeled: false,
    color: '#1f3b48',
  },
  {
    id: 'package',
    number: '07',
    name: 'Package & clamps',
    role: 'Frame, lid plate and clamps that hold the board. Drawn for context; mechanical only.',
    modeled: false,
    color: '#4a4f56',
  },
];

export const PART_BY_ID: Record<PartId, Part> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
) as Record<PartId, Part>;

export const MODELED_PARTS = PARTS.filter((p) => p.modeled);
export const ILLUSTRATIVE_PARTS = PARTS.filter((p) => !p.modeled);
