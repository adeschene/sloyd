import type { GeneratedDesign } from './generated';
import { NAME_SEPARATOR } from './tree';

/** What a part carries, by count: a `PartCarry`, an `AssemblyCarry` (hardware only) or a resolved `Board` all fit. */
export interface CarriedKinds {
  holes?: readonly unknown[]; curves?: readonly unknown[]; profiles?: readonly unknown[]; bands?: readonly unknown[]; hardware?: readonly unknown[];
}

/**
 * The feature kinds a part carries, in words, in the canonical order (refine-features spec §4, §5): `holes`,
 * `a curve` / `curves`, `an edge profile` / `edge profiles` (one or more), `edging`, `hardware`.
 */
export function kindsText(c: CarriedKinds): string {
  const n = (a: readonly unknown[] | undefined) => a?.length ?? 0;
  const out: string[] = [];
  if (n(c.holes) > 0) out.push('holes');
  if (n(c.curves) > 0) out.push(n(c.curves) === 1 ? 'a curve' : 'curves');
  if (n(c.profiles) > 0) out.push(n(c.profiles) === 1 ? 'an edge profile' : 'edge profiles');
  if (n(c.bands) > 0) out.push('edging');
  if (n(c.hardware) > 0) out.push('hardware');
  return out.join(', ');
}

const NOTE = 'These parts carry holes, curves, edge profiles, edging or hardware that this format does not show; Sloyd keeps them on the part with the same name. Keep each one\'s name, and keep it the same way round: ';

/** The user-turn paragraph naming the parts whose features the design JSON does not show (spec §5), or null. */
export function featuredNote(design: GeneratedDesign): string | null {
  const items: string[] = [];
  for (const p of design.parts) if (p.carry) items.push(`${p.name} (${kindsText(p.carry)})`);
  for (const a of design.assemblies ?? []) {
    const first = a.placements[0]?.name;
    if (first === undefined) continue;
    for (const p of a.parts) if (p.carry) items.push(`${first}${NAME_SEPARATOR}${p.name} (${kindsText(p.carry)})`);
    if (a.carry && a.carry.hardware.length > 0) items.push(`${first} (hardware)`);
  }
  return items.length === 0 ? null : `${NOTE}${items.join(', ')}.`;
}
