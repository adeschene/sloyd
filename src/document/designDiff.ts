import { formatLength } from '../units/length';
import { catalogOf } from './materials';
import { boardExtents } from './geometry';
import type { Board, Instance, SloydDocument } from './types';
import { DIRS, worldTapers } from './taperWorld';
import type { WorldTaper } from './taperWorld';
import { noAngles, worldAngles } from './angleWorld';
import type { WorldAngles } from './angleWorld';
import { definitionCorner } from './refineDesign';
import { NAME_SEPARATOR, PATH_SEPARATOR, flatDocument } from './tree';

/**
 * What a refine changed (refine spec §4), by FLAT DISPLAY NAME. The display
 * text is assembled HERE with formatLength (the `→ units` edge; invariant 19's
 * rule that a string a person reads is built in one module).
 */
export type ChangeKind = 'added' | 'removed' | 'resized' | 'moved' | 'material' | 'angle' | 'linked' | 'unlinked';
export interface Change { kind: ChangeKind; subject: 'part' | 'placement'; name: string; copies: number; text: string }

interface Entry { b: Board; inst: Instance | null }
interface Side { parts: Map<string, Entry>; insts: Map<string, Instance>; corner: (i: Instance) => number[] }

function sideOf(doc: SloydDocument): Side {
  const byId = new Map(doc.instances.map((i) => [i.id, i]));
  const parts = new Map<string, Entry>();
  for (const b of flatDocument(doc).boards) {
    const seg = b.id.split(PATH_SEPARATOR);
    parts.set(b.name, { b, inst: seg.length > 1 ? byId.get(seg[0]!) ?? null : null });
  }
  // A placement is compared by where its definition's min corner lands: origin + that corner.
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const corner = (i: Instance) => {
    const d = defs.get(i.definition);
    const c = d && d.boards.length > 0 ? definitionCorner(d.boards) : [0, 0, 0];
    return i.position.map((v, k) => v + c[k]!);
  };
  return { parts, insts: new Map(doc.instances.map((i) => [i.name, i])), corner };
}

const sizeOf = (b: Board) => [b.length, b.width, b.thickness].sort((x, y) => y - x);
/** A part inside a placement is compared relative to its placement's corner (origin + the definition's min corner). */
const localOf = (side: Side, e: Entry) => (e.inst ? e.b.position.map((v, k) => v - side.corner(e.inst!)[k]!) : [...e.b.position]);
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, k) => v === b[k]);
/** The detail of a turned part's line, shared by its text and its merge key. */
const TURNED = ' turned';

export function diffDesigns(before: SloydDocument, after: SloydDocument): Change[] {
  const ca = catalogOf(after);
  const cb = catalogOf(before);
  const label = (m: string) => ca.get(m)?.label ?? cb.get(m)?.label ?? m;
  const len = (n: number) => formatLength(n, after.units.precision);
  const dims = (b: Board) => sizeOf(b).map(len).join(' × ');
  // A component that displays as zero is omitted, so no line reads "X +0".
  const delta = (d: number[]) => d.flatMap((n, k) => (len(Math.abs(n)) === len(0) ? [] : [`${'XYZ'[k]} ${n > 0 ? '+' : ''}${len(n)}`])).join(', ');
  const A = sideOf(before);
  const B = sideOf(after);
  const out: Change[] = [];
  const merged = new Map<string, Change>();
  const push = (kind: ChangeKind, subject: Change['subject'], name: string, text: string, key: string | null) => {
    const hit = key ? merged.get(key) : undefined;
    if (hit) { hit.copies += 1; return; }
    const c: Change = { kind, subject, name, copies: 1, text };
    out.push(c);
    if (key) merged.set(key, c);
  };

  for (const [n, i] of B.insts) {
    const old = A.insts.get(n);
    if (!old) push('added', 'placement', n, `Added placement ${n}`, null);
    else {
      const oc = A.corner(old);
      const d = delta(B.corner(i).map((p, k) => p - oc[k]!));
      if (d) push('moved', 'placement', n, `Placement ${n} moved ${d}`, null);
    }
  }
  for (const n of A.insts.keys()) if (!B.insts.has(n)) push('removed', 'placement', n, `Removed placement ${n}`, null);

  // A part of a placement that exists on one side only is covered by that placement's line.
  const covered = (e: Entry) => e.inst !== null && !(A.insts.has(e.inst.name) && B.insts.has(e.inst.name));
  const keyOf = (n: string, e: Entry) => (kind: string, detail: string) =>
    e.inst ? `${kind}|${e.inst.definition}|${n.slice(e.inst.name.length + NAME_SEPARATOR.length)}|${detail}` : null;

  for (const [n, e] of B.parts) {
    if (covered(e)) continue;
    const key = keyOf(n, e);
    const o = A.parts.get(n);
    if (!o) { const d = ` (${dims(e.b)})`; push('added', 'part', n, `Added ${n}${d}`, key('added', d)); continue; }
    if (!same(sizeOf(o.b), sizeOf(e.b))) {
      // A change below display precision reads as no change at all.
      if (dims(o.b) !== dims(e.b)) { const d = `: ${dims(o.b)} → ${dims(e.b)}`; push('resized', 'part', n, `${n}${d}`, key('resized', d)); }
    }
    // L/W/T are stored sorted, so the same dimensions can sit on other faces: only world extents tell.
    else if (!same(boardExtents(o.b), boardExtents(e.b))) push('resized', 'part', n, `${n}${TURNED}`, key('resized', TURNED));
    const lo = localOf(A, o);
    const d = delta(localOf(B, e).map((p, k) => p - lo[k]!));
    if (d) { const t = ` moved ${d}`; push('moved', 'part', n, `${n}${t}`, key('moved', t)); }
    if (o.b.material !== e.b.material && label(o.b.material) !== label(e.b.material)) { const d = `: ${label(o.b.material)} → ${label(e.b.material)}`; push('material', 'part', n, `${n}${d}`, key('material', d)); }
    // Tapers compared FACE BY FACE (fu 310): a sloped face toward one end is the unit, so a reordering or a regrouping is
    // not a change, and an untouched taper beside a changed one gets no line. Values compare at display precision, like
    // every other line. worldTapers is never null here: Refine refuses a non-standard taper before any call.
    const lines = taperLines(worldTapers(o.b) ?? [], worldTapers(e.b) ?? [], len);
    for (const t of lines) push('angle', 'part', n, `${n}: ${t}`, key('angle', `: ${t}`));
    for (const t of angleLines(worldAngles(o.b) ?? noAngles(), worldAngles(e.b) ?? noAngles(), len)) push('angle', 'part', n, `${n}: ${t}`, key('angle', `: ${t}`));
    if (!o.b.shape !== !e.b.shape) {
      const kind = e.b.shape ? 'linked' : 'unlinked';
      push(kind, 'part', n, e.b.shape ? `${n} is now linked` : `${n} is no longer linked`, key(kind, ''));
    }
  }
  for (const [n, e] of A.parts) {
    if (covered(e) || B.parts.has(n)) continue;
    push('removed', 'part', n, `Removed ${n}`, keyOf(n, e)('removed', ''));
  }
  return out.map((c) => (c.copies > 1 ? { ...c, text: `${c.text} (×${c.copies})` } : c));
}

/**
 * One part's taper lines (fu 310). Each taper is split into its faces; a face is matched across the two sides by face and
 * thin end. A face only after is added, only before is removed, on both with a different displayed start or amount is
 * changed. Faces sharing a kind and displayed values are named on one line, in DIRS order.
 */
function taperLines(before: readonly WorldTaper[], after: readonly WorldTaper[], len: (n: number) => string): string[] {
  type Face = { face: string; toward: string; start: number; amount: number };
  const split = (ts: readonly WorldTaper[]): Face[] => ts.flatMap((t) => t.faces.map((face) => ({ face, toward: t.toward, start: t.start, amount: t.amount })));
  const shown = (f: Face) => `${len(f.start)} from the ${f.toward} end, ${len(f.amount)} off`;
  // Two tapers on one face toward one end are possible (overlapping cuts): the face's entries compare as one list.
  const byFace = (fs: Face[]) => {
    const m = new Map<string, Face[]>();
    for (const f of fs) m.set(`${f.face}|${f.toward}`, [...(m.get(`${f.face}|${f.toward}`) ?? []), f]);
    return m;
  };
  const was = byFace(split(before));
  const now = byFace(split(after));
  const groups = new Map<string, { kind: 'added' | 'changed' | 'removed'; faces: string[]; detail: string }>();
  const add = (kind: 'added' | 'changed' | 'removed', f: Face, detail: string) => {
    const k = `${kind}|${f.toward}|${detail}`;
    const g = groups.get(k) ?? { kind, faces: [], detail };
    if (!g.faces.includes(f.face)) g.faces.push(f.face);
    groups.set(k, g);
  };
  const list = (fs: Face[]) => fs.map(shown).sort().join(' / ');
  for (const [k, fs] of now) {
    const old = was.get(k);
    if (!old) for (const f of fs) add('added', f, shown(f));
    else if (list(old) !== list(fs)) for (const f of fs) add('changed', f, shown(f));
  }
  for (const [k, fs] of was) if (!now.has(k)) add('removed', fs[0]!, '');
  const rank = (d: string) => DIRS.indexOf(d as WorldTaper['toward']);
  const order = { added: 0, changed: 1, removed: 2 };
  return [...groups.values()]
    .map((g) => ({ ...g, faces: [...g.faces].sort((x, y) => rank(x) - rank(y)) }))
    .sort((x, y) => order[x.kind] - order[y.kind] || rank(x.faces[0]!) - rank(y.faces[0]!))
    .map((g) => `taper ${g.kind} (${g.faces.join(', ')}${g.detail ? `; ${g.detail}` : ''})`);
}

/**
 * One part's miter, bevel and chamfer lines (AI-angles spec §6.4): matched by where they are — a miter by its end, a
 * bevel by its face and long point, a chamfer by its edge — then added, changed (its displayed detail differs) or removed, in kind
 * order. `worldAngles` is never null here: Refine refuses a cut it cannot describe before any call.
 */
function angleLines(before: WorldAngles, after: WorldAngles, len: (n: number) => string): string[] {
  type Entry = { kind: 'miter' | 'bevel' | 'chamfer'; where: string; detail: string };
  const deg = (a: number) => `${a.toFixed(1)}°`;
  const entries = (a: WorldAngles): Entry[] => [
    ...a.miters.map((m) => ({ kind: 'miter' as const, where: `${m.end} end`, detail: `${deg(m.angle)}, long point ${m.longPoint}` })),
    // Two bevels may share a face (a knife edge, long points opposite): a bevel is placed by its face AND long point.
    ...a.bevels.map((v) => ({ kind: 'bevel' as const, where: `${v.face} face, long point ${v.longPoint}`, detail: deg(v.angle) })),
    ...a.chamfers.map((c) => ({ kind: 'chamfer' as const, where: `${c.edge[0]}/${c.edge[1]} edge`, detail: `${len(c.legs[0])} × ${len(c.legs[1])}` })),
  ];
  const was = new Map(entries(before).map((x) => [`${x.kind}|${x.where}`, x]));
  const now = new Map(entries(after).map((x) => [`${x.kind}|${x.where}`, x]));
  const out: string[] = [];
  for (const [k, x] of now) {
    const old = was.get(k);
    if (!old) out.push(`${x.kind} added (${x.where}; ${x.detail})`);
    else if (old.detail !== x.detail) out.push(`${x.kind} changed (${x.where}; ${x.detail})`);
  }
  for (const [k, x] of was) if (!now.has(k)) out.push(`${x.kind} removed (${x.where})`);
  return out;
}
