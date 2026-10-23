import type { GeneratedDesign } from './generated';
import { NAME_SEPARATOR, flatDocument } from './tree';
import type { Board, SloydDocument } from './types';
import { boardExtents } from './geometry';
import { holeFaults } from './holeFaults';
import { faultKey } from './holeText';
import { curveFaults } from './curves';
import { profileFaults } from './profiles';
import { bandFaults } from './banding';
import { carriedKinds } from './featureCarry';

/** What a part carries, by count: a `PartCarry`, an `AssemblyCarry` (hardware only) or a resolved `Board` all fit. */
export interface CarriedKinds {
  curves?: readonly unknown[]; profiles?: readonly unknown[]; bands?: readonly unknown[]; hardware?: readonly unknown[];
}

/** A part's counts as `carriedKinds` sees them: the bands of a plain part are not carried, so they are not named (AI-bands spec §4.1). */
export function carriedView(b: Board): CarriedKinds {
  return { curves: b.curves, profiles: b.profiles, bands: carriedKinds(b).includes('bands') ? b.bands : [], hardware: b.hardware };
}

/**
 * The feature kinds a part carries, in words, in the canonical order (refine-features spec §4, §5; never holes, AI-holes spec §4):
 * `a curve` / `curves`, `an edge profile` / `edge profiles` (one or more), `edging`, `hardware`.
 */
export function kindsText(c: CarriedKinds): string {
  const n = (a: readonly unknown[] | undefined) => a?.length ?? 0;
  const out: string[] = [];
  if (n(c.curves) > 0) out.push(n(c.curves) === 1 ? 'a curve' : 'curves');
  if (n(c.profiles) > 0) out.push(n(c.profiles) === 1 ? 'an edge profile' : 'edge profiles');
  if (n(c.bands) > 0) out.push('edging');
  if (n(c.hardware) > 0) out.push('hardware');
  return out.join(', ');
}

/**
 * The same kinds for a PERSON to read (no articles, so a possessive can precede them): `curve` / `curves`,
 * `edge profile` / `edge profiles`, `edging`, `hardware`, joined `X`, `X and Y`, `X, Y and Z`. `plural` is false only for
 * exactly one singular noun, so a template picks its verb ("stays" / "stay") from it.
 */
export function nounsText(c: CarriedKinds): { text: string; plural: boolean } {
  const n = (a: readonly unknown[] | undefined) => a?.length ?? 0;
  const out: string[] = [];
  if (n(c.curves) > 0) out.push(n(c.curves) === 1 ? 'curve' : 'curves');
  if (n(c.profiles) > 0) out.push(n(c.profiles) === 1 ? 'edge profile' : 'edge profiles');
  if (n(c.bands) > 0) out.push('edging');
  if (n(c.hardware) > 0) out.push('hardware');
  const text = out.length <= 1 ? out.join('') : `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`;
  const plural = !(out.length === 1 && ['curve', 'edge profile', 'edging', 'hardware'].includes(out[0]!));
  return { text, plural };
}

const NOTE = 'These parts carry curves, edge profiles, edging or hardware that this format does not show; Sloyd keeps them on the part with the same name. Keep each one\'s name, and keep it the same way round: ';

/** The user-turn paragraph naming the parts whose features the design JSON does not show (spec §5), or null. */
export function featuredNote(design: GeneratedDesign): string | null {
  const items: string[] = [];
  // A part whose carry holds only its original's hole rows (the exact-row map) carries nothing the JSON does not show:
  // the design shows its holes (AI-holes spec §4).
  const kinds = (p: GeneratedDesign['parts'][number]) => (p.carry ? kindsText(p.carry) : '');
  for (const p of design.parts) if (kinds(p)) items.push(`${p.name} (${kinds(p)})`);
  for (const a of design.assemblies ?? []) {
    const first = a.placements[0]?.name;
    if (first === undefined) continue;
    for (const p of a.parts) if (kinds(p)) items.push(`${first}${NAME_SEPARATOR}${p.name} (${kinds(p)})`);
    if (a.carry && a.carry.hardware.length > 0) items.push(`${first} (hardware)`);
  }
  return items.length === 0 ? null : `${NOTE}${items.join(', ')}.`;
}

/** Fault keys of a part's carried features, per feature id (refine-features spec §5): a key the refined part has and the original did not is NEW. */
function faultKeys(b: Board, doc: Pick<SloydDocument, 'bandTypes'>): Set<string> {
  const out = new Set<string>();
  for (const r of b.holes) for (const f of holeFaults(b, r)) out.add(`h:${r.id}:${faultKey(f)}`);
  for (const c of b.curves) for (const f of curveFaults(b, c)) out.add(`c:${c.id}:${f.kind}:${f.edge?.dim}${f.edge?.side}`);
  for (const p of b.profiles) for (const f of profileFaults(b, p)) out.add(`p:${p.id}:${f.kind}`);
  // A plain part's bands are authored in the design, not carried; their faults are Properties' to show (AI-bands spec §4.1).
  if (b.curves.length > 0) for (const f of bandFaults(b, doc.bandTypes)) out.add(`b:${f.side.across}${f.side.from}:${f.kind}`);
  return out;
}

/**
 * The done view's two lists (refine-features spec §5), judged plain to plain by flat name. `notKept`: an original part (or
 * assembly, by its first placement's name) with features and no part of that name in the result. `check`: a returned part
 * that carries holes, curves, profiles or edging and whose extents changed; "no longer fit" when the resize caused a fault
 * the original part did not already have. Hardware has no size dependence, so it never makes a part a `check` line.
 */
export function carriedSummary(original: SloydDocument, refined: SloydDocument): { notKept: string[]; check: string[] } {
  const oFlat = flatDocument(original);
  const rFlat = flatDocument(refined);
  const rByName = new Map(rFlat.boards.map((b) => [b.name, b] as const));
  const notKept: string[] = [];
  const check: string[] = [];
  for (const o of oFlat.boards) {
    const r = rByName.get(o.name);
    if (!r) {
      if (carriedKinds(o).length > 0) notKept.push(`${o.name}'s ${nounsText(carriedView(o)).text} — no part named ${o.name} in the result.`);
      continue;
    }
    if (!carriedKinds(r).some((k) => k !== 'hardware')) continue;
    const eo = boardExtents(o);
    const er = boardExtents(r);
    if (eo.every((x, i) => x === er[i])) continue;
    const { text: kinds, plural } = nounsText({ ...carriedView(r), hardware: [] });
    const before = faultKeys(o, original);
    const fresh = [...faultKeys(r, refined)].some((k) => !before.has(k));
    check.push(fresh
      ? `${o.name} was resized — its ${kinds} no longer ${plural ? 'fit' : 'fits'}; see Properties.`
      : plural
        ? `${o.name} was resized — its ${kinds} stay measured from where they were placed; check them.`
        : `${o.name} was resized — its ${kinds} stays measured from where it was placed; check it.`);
  }
  const placed = new Set(refined.instances.map((i) => i.name));
  for (const d of original.definitions) {
    if (d.hardware.length === 0) continue;
    const names = original.instances.filter((i) => i.definition === d.id).map((i) => i.name);
    if (names.length === 0 || names.some((n) => placed.has(n))) continue;
    notKept.push(`${names[0]}'s ${nounsText({ hardware: d.hardware }).text} — no part named ${names[0]} in the result.`);
  }
  return { notKept, check };
}
