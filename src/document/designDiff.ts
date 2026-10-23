import { formatLength, formatSize } from '../units/length';
import { catalogOf } from './materials';
import { boardExtents } from './geometry';
import type { Board, Instance, SloydDocument } from './types';
import { DIRS, worldTapers } from './taperWorld';
import type { Dir, WorldTaper } from './taperWorld';
import { noAngles, worldAngles } from './angleWorld';
import type { WorldAngles } from './angleWorld';
import { worldHoles } from './holeWorld';
import type { WorldBand, WorldHoleRow, WorldProfile } from './generated';
import { worldProfiles } from './profileWorld';
import { PROFILE_KIND_LABEL } from './profiles';
import { carriesProfiles } from './featureCarry';
import { worldBands } from './bandWorld';
import { BUILT_IN_BAND } from './bandModel';
import { definitionCorner } from './refineDesign';
import { centreOf, endWord, faceWord, facesText } from './shopWords';
import type { Box } from './shopWords';
import { NAME_SEPARATOR, PATH_SEPARATOR, flatDocument } from './tree';

/**
 * What a refine changed (refine spec §4), by FLAT DISPLAY NAME. The display
 * text is assembled HERE with formatLength (the `→ units` edge; invariant 19's
 * rule that a string a person reads is built in one module). Directions read in
 * shop words (`shopWords.ts`; shop-words spec): cuts and rows are MATCHED on raw
 * directions, never on the words, since two faces can both read "inside".
 */
export type ChangeKind = 'added' | 'removed' | 'resized' | 'moved' | 'material' | 'angle' | 'holes' | 'bands' | 'profiles' | 'linked' | 'unlinked';
export interface Change { kind: ChangeKind; subject: 'part' | 'placement'; name: string; copies: number; text: string }

interface Entry { b: Board; inst: Instance | null }
interface Side { parts: Map<string, Entry>; insts: Map<string, Instance>; corner: (i: Instance) => number[]; words: (e: Entry) => Words }
/** One part's shop words: a face of THIS part relative to its frame's middle. */
type Words = (d: Dir) => string;

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
  // A part's frame (shop-words spec §3): its placement's own parts, or the whole piece for a top-level part.
  const boxOf = (b: Board): Box => { const e = boardExtents(b); return { min: b.position, max: b.position.map((v, k) => v + e[k]!) }; };
  const all = [...parts.values()];
  const centres = new Map<string | null, number[]>();
  const centreFor = (inst: Instance | null) => {
    const k = inst?.id ?? null;
    if (!centres.has(k)) centres.set(k, centreOf(all.filter((e) => !inst || e.inst === inst).map((e) => boxOf(e.b))));
    return centres.get(k)!;
  };
  const words = (e: Entry): Words => { const box = boxOf(e.b); const c = centreFor(e.inst); return (d) => faceWord(d, box, c); };
  return { parts, insts: new Map(doc.instances.map((i) => [i.name, i])), corner, words };
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
  const len = (n: number) => formatLength(n, after.units);
  const dims = (b: Board) => formatSize(sizeOf(b), after.units);
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
    const wa = A.words(o);
    const wb = B.words(e);
    const lines = taperLines(worldTapers(o.b) ?? [], worldTapers(e.b) ?? [], len, wa, wb);
    for (const t of lines) push('angle', 'part', n, `${n}: ${t}`, key('angle', `: ${t}`));
    for (const t of angleLines(worldAngles(o.b) ?? noAngles(), worldAngles(e.b) ?? noAngles(), len, wa, wb)) push('angle', 'part', n, `${n}: ${t}`, key('angle', `: ${t}`));
    for (const t of holeLines(worldHoles(o.b), worldHoles(e.b), len, wa, wb)) push('holes', 'part', n, `${n}: ${t}`, key('holes', `: ${t}`));
    for (const t of bandLines(worldBands(o.b), worldBands(e.b), typeName(after))) push('bands', 'part', n, `${n}: ${t}`, key('bands', `: ${t}`));
    for (const t of profileLines(shownProfiles(o.b), shownProfiles(e.b), len)) push('profiles', 'part', n, `${n}: ${t}`, key('profiles', `: ${t}`));
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

/** A band type's name from a document's `bandTypes`; the built-in key `veneer` is the built-in type; an unknown id reads as itself. */
const typeName = (doc: SloydDocument) => (key: string): string =>
  (key === 'veneer' ? BUILT_IN_BAND : doc.bandTypes.find((t) => t.id === key))?.name ?? key;

/**
 * One part's edging lines (AI-bands spec §4.1), on design forms (`worldBands`). A band is matched by its edge on raw
 * directions, never on the words: added (`edging added on the front edge (Oak edging)`), removed, or changed (the type
 * differs, by id: `edging on the front edge now Iron-on veneer`). Edges read in absolute words (`endWord`), in DIRS order.
 * Type names come from the AFTER document's `bandTypes` (Refine may mint a type; a removal names none).
 */
function bandLines(before: readonly WorldBand[], after: readonly WorldBand[], name: (k: string) => string): string[] {
  const was = new Map(before.map((x) => [x.edge, x.edging] as const));
  const now = new Map(after.map((x) => [x.edge, x.edging] as const));
  const out: string[] = [];
  for (const d of DIRS) {
    const a = was.get(d);
    const b = now.get(d);
    if (b !== undefined && a === undefined) out.push(`edging added on the ${endWord(d)} edge (${name(b)})`);
    else if (b !== undefined && a !== b) out.push(`edging on the ${endWord(d)} edge now ${name(b)}`);
    else if (b === undefined && a !== undefined) out.push(`edging on the ${endWord(d)} edge removed`);
  }
  return out;
}

/** A profile in design form with how it runs: all round, full length (both ends through), or stopped. */
interface ShownProfile extends WorldProfile { run: 'all round' | 'full length' | 'stopped' }

/** A part's authored profiles in design form; none for a part whose profiles are carried (curves, a two-side run: never shown). */
function shownProfiles(b: Board): ShownProfile[] {
  if (carriesProfiles(b)) return [];
  const extents = boardExtents(b);
  return (worldProfiles(b) ?? []).map((w) => {
    // The run's axis is the one neither the broad face nor the side is on.
    const along = [0, 1, 2].find((k) => 'xyz'[k] !== w.edge[0]![1] && 'xyz'[k] !== w.edge[1]![1])!;
    return { ...w, run: w.allRound ? 'all round' : w.start === 0 && w.end === extents[along]! ? 'full length' : 'stopped' };
  });
}

/**
 * One part's edge-profile lines (AI-profiles spec §4.1), on design forms (`worldProfiles`). A profile is matched by its
 * raw edge directions and kind (never the words), several on one edge and kind pairing in order: added
 * (`1/4" roundover added on the top/front edge`), removed, or changed (`now 3/8"`, else `now stopped` / `now full length` /
 * `now all round`). An all-round profile has no side: it matches a profile of its broad face and kind that found no
 * partner, and reads `on the top face`. Edges read in absolute words (`endWord`), kinds in the bench's lowercase words
 * (`PROFILE_KIND_LABEL`). `len` carries the document's units.
 */
function profileLines(before: readonly ShownProfile[], after: readonly ShownProfile[], len: (n: number) => string): string[] {
  const kind = (w: WorldProfile) => PROFILE_KIND_LABEL[w.kind].toLowerCase();
  const place = (w: ShownProfile) => (w.run === 'all round' ? `all round the ${endWord(w.edge[0] as Dir)} face`
    : `on the ${endWord(w.edge[0] as Dir)}/${endWord(w.edge[1] as Dir)} edge`);
  const exact = (x: ShownProfile, y: ShownProfile) => x.kind === y.kind && x.edge[0] === y.edge[0] && x.edge[1] === y.edge[1] && (x.run === 'all round') === (y.run === 'all round');
  const rest = [...after];
  const gone: ShownProfile[] = [];
  const pairs: [ShownProfile, ShownProfile][] = [];
  for (const b of before) {
    const i = rest.findIndex((a) => exact(b, a));
    if (i >= 0) pairs.push([b, rest.splice(i, 1)[0]!]); else gone.push(b);
  }
  // An all-round profile and a run on the same broad face and kind are one profile whose run changed.
  for (const b of [...gone]) {
    const i = rest.findIndex((a) => a.kind === b.kind && a.edge[0] === b.edge[0] && (a.run === 'all round' || b.run === 'all round'));
    if (i >= 0) { pairs.push([b, rest.splice(i, 1)[0]!]); gone.splice(gone.indexOf(b), 1); }
  }
  const order = (w: ShownProfile) => DIRS.indexOf(w.edge[0] as Dir) * 6 + DIRS.indexOf(w.edge[1] as Dir);
  type Item = { at: number; text: string };
  const items: Item[] = [];
  for (const [b, a] of pairs) {
    const change = len(a.size) !== len(b.size) ? len(a.size)
      : a.run !== b.run || (a.run === 'stopped' && (a.start !== b.start || a.end !== b.end)) ? a.run : null;
    if (change !== null) items.push({ at: order(a), text: `${kind(a)} ${place(a)} now ${change}` });
  }
  for (const a of rest) items.push({ at: order(a), text: `${len(a.size)} ${kind(a)} added ${place(a)}` });
  for (const b of gone) items.push({ at: order(b), text: `${kind(b)} ${place(b)} removed` });
  return items.sort((x, y) => x.at - y.at).map((i) => i.text);
}

/**
 * One part's taper lines (fu 310). Each taper is split into its faces; a face is matched across the two sides by face and
 * thin end. A face only after is added, only before is removed, on both with a different displayed start or amount is
 * changed. Faces sharing a kind and displayed values are named on one line, in DIRS order, in shop words (a removed face
 * by the before side's frame).
 */
function taperLines(before: readonly WorldTaper[], after: readonly WorldTaper[], len: (n: number) => string, wa: Words, wb: Words): string[] {
  type Face = { face: string; toward: string; start: number; amount: number };
  const split = (ts: readonly WorldTaper[]): Face[] => ts.flatMap((t) => t.faces.map((face) => ({ face, toward: t.toward, start: t.start, amount: t.amount })));
  const shown = (f: Face) => `${len(f.start)} from the ${endWord(f.toward as Dir)} end, ${len(f.amount)} off`;
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
    .map((g) => `taper ${g.kind} (${facesText(g.faces.map((d) => (g.kind === 'removed' ? wa : wb)(d as Dir)))}${g.detail ? `; ${g.detail}` : ''})`);
}

/**
 * One part's miter, bevel and chamfer lines (AI-angles spec §6.4): matched by where they are — a miter by its end, a
 * bevel by its face and long point, a chamfer by its edge — then added, changed (its displayed detail differs) or removed, in kind
 * order. `worldAngles` is never null here: Refine refuses a cut it cannot describe before any call.
 */
function angleLines(before: WorldAngles, after: WorldAngles, len: (n: number) => string, wa: Words, wb: Words): string[] {
  // `where`/`detail` are the raw keys (matching never reads words); `text` words them in a side's frame.
  type Entry = { kind: 'miter' | 'bevel' | 'chamfer'; where: string; detail: string; text: (w: Words) => [string, string] };
  const deg = (a: number) => `${a.toFixed(1)}°`;
  const entries = (a: WorldAngles): Entry[] => [
    ...a.miters.map((m) => ({ kind: 'miter' as const, where: `${m.end} end`, detail: `${deg(m.angle)}, long point ${m.longPoint}`,
      text: (w: Words): [string, string] => [`${endWord(m.end)} end`, `${deg(m.angle)}, long point on the ${w(m.longPoint)} face`] })),
    // Two bevels may share a face (a knife edge, long points opposite): a bevel is placed by its face AND long point.
    ...a.bevels.map((v) => ({ kind: 'bevel' as const, where: `${v.face} face, long point ${v.longPoint}`, detail: deg(v.angle),
      text: (w: Words): [string, string] => [`${w(v.face)} face, long point on the ${w(v.longPoint)} face`, deg(v.angle)] })),
    ...a.chamfers.map((c) => ({ kind: 'chamfer' as const, where: `${c.edge[0]}/${c.edge[1]} edge`, detail: `${len(c.legs[0])} × ${len(c.legs[1])}`,
      text: (w: Words): [string, string] => [`${w(c.edge[0])}/${w(c.edge[1])} edge`, `${len(c.legs[0])} × ${len(c.legs[1])}`] })),
  ];
  const was = new Map(entries(before).map((x) => [`${x.kind}|${x.where}`, x]));
  const now = new Map(entries(after).map((x) => [`${x.kind}|${x.where}`, x]));
  const out: string[] = [];
  for (const [k, x] of now) {
    const old = was.get(k);
    const [where, detail] = x.text(wb);
    if (!old) out.push(`${x.kind} added (${where}; ${detail})`);
    else if (old.detail !== x.detail) out.push(`${x.kind} changed (${where}; ${detail})`);
  }
  for (const [k, x] of was) if (!now.has(k)) out.push(`${x.kind} removed (${x.text(wa)[0]})`);
  return out;
}

/**
 * One part's hole-row lines (AI-holes spec §4; shop words, shop-words spec), on design forms (`worldHoles`: `offset` is
 * part-relative, so a moved part changes nothing). A row is matched by its face plus its first centre, EXACTLY. A matched
 * row names what differs at display precision: depth, through, diameter, count, pitch, or `running toward <dir>` (its
 * direction along the face, only when it was and is a row of more than one). A through row's depth is not a difference.
 * Of the rows left over, an added and a removed row on the same face that display the same (`look`) are a MOVE, paired
 * nearest-first by first centre; a move below display precision prints nothing. Anything else is an addition or a removal.
 */
function holeLines(before: readonly WorldHoleRow[], after: readonly WorldHoleRow[], len: (n: number) => string, wa: Words, wb: Words): string[] {
  const at = (r: WorldHoleRow) => `${r.face}|${r.offset.x}|${r.offset.y}|${r.offset.z}`;
  const left = new Map<string, WorldHoleRow[]>();
  for (const r of before) left.set(at(r), [...(left.get(at(r)) ?? []), r]);
  const out: string[] = [];
  const added: { r: WorldHoleRow; slot: number }[] = [];
  for (const r of after) {
    const old = left.get(at(r))?.shift();
    if (!old) { added.push({ r, slot: out.length }); out.push(''); continue; }
    const what: string[] = [];
    if (r.through !== old.through ? !r.through : !r.through && len(r.depth) !== len(old.depth)) what.push(`${len(r.depth)} deep`);
    if (r.through && !old.through) what.push('through');
    if (len(r.diameter) !== len(old.diameter)) what.push(`${len(r.diameter)} Ø`);
    if (r.count !== old.count) what.push(`${r.count} hole${r.count === 1 ? '' : 's'}`);
    if (r.count > 1 && old.count > 1 && len(r.pitch) !== len(old.pitch)) what.push(`${len(r.pitch)} apart`);
    else if (r.count > 1 && old.count === 1) what.push(`${len(r.pitch)} apart`);
    // A single bore has no direction to change (final review M1): only a row that was and is a row can turn.
    if (r.toward !== old.toward && r.count > 1 && old.count > 1) what.push(`running toward the ${endWord(r.toward)}`);
    if (what.length > 0) out.push(`hole row on the ${wb(r.face)} face now ${what.join(', ')}`);
  }
  // Same face, same displayed size, count and (for a row) pitch and run: only the first centre differs.
  const look = (r: WorldHoleRow) => [r.face, len(r.diameter), r.through ? 'through' : len(r.depth), r.count,
    r.count > 1 ? `${len(r.pitch)}|${r.toward}` : ''].join('|');
  const removed = [...left.values()].flat();
  const dist = (a: WorldHoleRow, b: WorldHoleRow) => Math.hypot(a.offset.x - b.offset.x, a.offset.y - b.offset.y, a.offset.z - b.offset.z);
  const AXES = ['x', 'y', 'z'] as const;
  for (const { r, slot } of added) {
    const k = removed.filter((o) => look(o) === look(r)).sort((a, b) => dist(a, r) - dist(b, r))[0];
    if (!k) { out[slot] = `${r.count} hole${r.count === 1 ? '' : 's'} added on the ${wb(r.face)} face, ${len(r.diameter)} Ø`; continue; }
    removed.splice(removed.indexOf(k), 1);
    // Each axis whose displayed delta is not zero, as a distance toward an absolute side.
    const moves = AXES.flatMap((a) => {
      const d = r.offset[a] - k.offset[a];
      return len(Math.abs(d)) === len(0) ? [] : [`${len(Math.abs(d))} toward the ${endWord(`${d > 0 ? '+' : '-'}${a}` as Dir)}`];
    });
    if (moves.length > 0) out[slot] = `hole row on the ${wb(r.face)} face moved ${moves.join(', ')}`;
  }
  for (const r of removed) out.push(`hole row on the ${wa(r.face)} face removed`);
  return out.filter((t) => t !== '');
}
