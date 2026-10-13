import { formatLength } from '../units/length';
import { MATERIALS } from './types';
import { boardExtents } from './geometry';
import type { Board, Instance, SloydDocument } from './types';
import { worldTapers } from './taperWorld';
import { definitionCorner } from './refineDesign';
import { NAME_SEPARATOR, PATH_SEPARATOR, flatDocument } from './tree';

/**
 * What a refine changed (refine spec §4), by FLAT DISPLAY NAME. The display
 * text is assembled HERE with formatLength (the `→ units` edge; invariant 19's
 * rule that a string a person reads is built in one module).
 */
export type ChangeKind = 'added' | 'removed' | 'resized' | 'moved' | 'material' | 'taper' | 'linked' | 'unlinked';
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
const label = (m: string) => MATERIALS[m]?.label ?? m;

export function diffDesigns(before: SloydDocument, after: SloydDocument): Change[] {
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
    // Tapers compared in design form (merged, ordered), so a reordering is not a change (spec §5.5).
    // worldTapers is never null here: Refine refuses a non-standard taper before any call.
    const ot = worldTapers(o.b) ?? [];
    const nt = worldTapers(e.b) ?? [];
    if (JSON.stringify(ot) !== JSON.stringify(nt)) {
      const say = (t: { faces: string[]; toward: string; start: number; amount: number }) => `${t.faces.join(', ')}; ${len(t.start)} from the ${t.toward} end, ${len(t.amount)} off`;
      const lines = nt.length === 0 ? ot.map((t) => `${n}: taper removed (${t.faces.join(', ')})`)
        : ot.length === 0 ? nt.map((t) => `${n}: taper added (${say(t)})`)
          : nt.map((t) => `${n}: taper changed (${say(t)})`);
      for (const t of lines) push('taper', 'part', n, t, key('taper', t));
    }
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
