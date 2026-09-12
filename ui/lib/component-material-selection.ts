import { DEFAULT_COMPONENT_MATERIALS, MATERIAL_BY_ID, materialIdFromLegacy, type ComponentMaterials } from './component-materials.ts';
import type { PartId } from './parts.ts';

/** Restore only known part/material IDs. Older or corrupt local data cannot create missing shaders. */
export function restoreComponentMaterials(raw: string | null): ComponentMaterials {
  const result = { ...DEFAULT_COMPONENT_MATERIALS };
  if (!raw) return result;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const part of Object.keys(result) as PartId[]) {
      const id = (value as Record<string, unknown>)[part];
      if (typeof id === 'string' && Object.hasOwn(MATERIAL_BY_ID, id)) result[part] = id;
    }
  } catch { /* Defaults remain usable when browser storage contains invalid JSON. */ }
  return result;
}

export function assignComponentMaterial(current: ComponentMaterials, part: PartId, id: string): ComponentMaterials {
  if (!Object.hasOwn(DEFAULT_COMPONENT_MATERIALS, part) || !Object.hasOwn(MATERIAL_BY_ID, id)) return current;
  return { ...current, [part]: id };
}

/** Only the changed legacy layer is assigned; independent component choices survive. */
export function applyLayerMaterials(current: ComponentMaterials, top?: string, base?: string): ComponentMaterials {
  if (top === undefined && base === undefined) return current;
  const next = { ...current };
  if (top !== undefined) {
    const film = materialIdFromLegacy(top);
    next.junction = film;
    next.capacitor = film;
    next.gate = film;
    next.ground = film;
  }
  if (base !== undefined) next.substrate = materialIdFromLegacy(base);
  return next;
}
