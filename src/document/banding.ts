export * from './bandModel';

/**
 * THE edge banding arithmetic (edge banding spec §3): a banded part's core size, its solid strips, its tape runs and its
 * band faults. Numbers only — no `units` (inv 52: `cutlist.ts` and `purchase.ts` format). Every result is memoised per
 * (part object, band types array object) and deep-frozen: never mutate them. Higher layers import everything
 * band-related from here.
 */
import { BAND_SIDES, bandValues, sideIndex } from './bandModel';
import { faceOutline, sideStretch, type OutlineChord } from './profilePath';
import type { BandType, Board, FlatDocument, ProfileSide, SolidBand, TapeBand } from './types';

export type BandFaultKind = 'needs-straight' | 'no-side' | 'too-thick' | 'tape-narrow';
export interface BandFault { side: ProfileSide; kind: BandFaultKind }
const FAULT_TEXT: Record<BandFaultKind, string> = {
  'needs-straight': 'needs a straight edge', 'no-side': 'no such edge', 'too-thick': 'leaves no core', 'tape-narrow': 'narrower than the part',
};
/** THE band fault words (spec §3.4). */
export const bandFaultText = (k: BandFaultKind) => FAULT_TEXT[k];

export interface StripEnd { mitre: number | null }
export interface Strip {
  part: string; partName: string; side: ProfileSide; type: SolidBand;
  finished: number; length: number; width: number; thickness: number;
  ends: [StripEnd, StripEnd];
}
export interface TapeRun { side: ProfileSide; type: TapeBand; length: number }

const EPS = 1e-9;
/** `holeText`'s `endWord`, inlined: importing it would pull `units` in (inv 52). */
const endWord = (d: ProfileSide['across']) => (d === 'length' ? 'end' : 'side');

/** Freezes what this module CONSTRUCTS; a band type (the project's object) is never recursed into. */
function freeze<T>(o: T, skip?: ReadonlySet<unknown>): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o) && !skip?.has(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v, skip);
  }
  return o;
}

/** The side's dimension (its length along the outline when straight): a long edge runs along the length. */
const sideLength = (b: Pick<Board, 'length' | 'width'>, s: ProfileSide) => (s.across === 'width' ? b.length : b.width);
const typeOf = (types: readonly BandType[], id: string) => types.find((t) => t.id === id);

/** A chord's length along the outline: a chord of a true arc (it lies ON the arc) measures r × its own minor angle. */
const chordLength = (c: OutlineChord) => {
  if (!c.arc) return Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  const [cx, cy] = c.arc.c;
  const ax = c.a[0] - cx, ay = c.a[1] - cy, bx = c.b[0] - cx, by = c.b[1] - cy;
  return c.arc.r * Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
};

/** Chord indices of a stretch, in order (it may wrap). */
const stretchIndices = (from: number, to: number, n: number) => {
  const out: number[] = [];
  for (let i = from; ; i = (i + 1) % n) { out.push(i); if (i === to) break; }
  return out;
};

/** The judged bands of a part, by canonical side index (0–3). `t`: an UNFAULTED band's thickness (0 otherwise);
 *  `type`: an unfaulted band's type (null otherwise); `chords`: a side's stretch chords (null without one). */
interface Judged {
  faults: readonly BandFault[];
  t: readonly number[];
  type: readonly (BandType | null)[];
  chords: readonly (readonly number[] | null)[];
  outline: ReturnType<typeof faceOutline>;
}

/** A per-(part, band types) memo: its own WeakMap pair, never a property on a frozen record. */
function memoised<R>(compute: (part: Board, types: readonly BandType[]) => R) {
  const memo = new WeakMap<Board, WeakMap<readonly BandType[], R>>();
  return (part: Board, types: readonly BandType[]): R => {
    let m = memo.get(part);
    if (!m) { m = new WeakMap(); memo.set(part, m); }
    if (m.has(types)) return m.get(types)!;
    const out = compute(part, types);
    m.set(types, out);
    return out;
  };
}

/** THE judgement of a part's bands against the project's band types (spec §3.4). */
const judge = memoised((part: Board, types: readonly BandType[]): Judged => {
  const faults: BandFault[] = [];
  const t = [0, 0, 0, 0];
  const type: (BandType | null)[] = [null, null, null, null];
  const chords: (number[] | null)[] = [null, null, null, null];
  const outline = part.bands.length === 0 ? null : faceOutline(part);
  for (const band of part.bands) {
    const bt = typeOf(types, band.type);
    if (!bt) continue;   // the loader drops a band naming no type; an in-memory one contributes nothing
    const i = sideIndex(band.side);
    const side = BAND_SIDES[i]!;
    const st = outline ? sideStretch(part, outline, side) : null;
    if (!outline || !st) { faults.push({ side, kind: 'no-side' }); continue; }
    const idx = stretchIndices(st.from, st.to, outline.chords.length);
    chords[i] = idx;
    const only = outline.chords[idx[0]!]!;
    const straight = idx.length === 1 && !only.arc && only.curve === undefined
      && Math.abs(chordLength(only) - sideLength(part, side)) <= EPS;
    if (bt.thickness > 0 && !straight) { faults.push({ side, kind: 'needs-straight' }); continue; }
    if (bt.kind === 'tape' && bt.tapeWidth < part.thickness - EPS) { faults.push({ side, kind: 'tape-narrow' }); continue; }
    t[i] = bt.thickness;
    type[i] = bt;
  }
  // too-thick: an opposite pair whose unfaulted thicknesses leave no core; each band of the pair WITH thickness carries it
  // (a zero-thickness band opposite is spared and keeps its tape run).
  for (const [a, b, dim] of [[0, 1, 'width'], [2, 3, 'length']] as const) {
    const sum = t[a]! + t[b]!;   // judged before either is cleared
    if (sum > 0 && sum >= part[dim] - EPS) {
      for (const k of [a, b]) if (type[k] && t[k]! > 0) { faults.push({ side: BAND_SIDES[k]!, kind: 'too-thick' }); t[k] = 0; type[k] = null; }
    }
  }
  faults.sort((p, q) => sideIndex(p.side) - sideIndex(q.side));
  return freeze({ faults, t, type, chords, outline }, new Set(type));
});

export const bandFaults = (part: Board, types: readonly BandType[]): readonly BandFault[] => judge(part, types).faults;

const NO_BANDS = (part: Board) => part.bands.length === 0;

/** Adjacent side pairs, as `BAND_SIDES` indices: each long edge with each end. */
const CORNERS: readonly (readonly [number, number])[] = [[0, 2], [0, 3], [1, 2], [1, 3]];

/** THE corner rule's reach (spec §3.2, Amended (planning) P5): two ADJACENT unfaulted bands with thickness meet and one is
 *  solid. The cut list prints its corner words, and Properties shows its Corners select, only where this holds. */
export function bandsMeetAtCorner(part: Board, types: readonly BandType[]): boolean {
  if (NO_BANDS(part)) return false;
  const j = judge(part, types);
  return CORNERS.some(([a, c]) => {
    const p = j.type[a], q = j.type[c];
    return !!p && !!q && j.t[a]! > 0 && j.t[c]! > 0 && (p.kind === 'solid' || q.kind === 'solid');
  });
}

/** The part's CORE size (spec §3.1): each unfaulted banded side's thickness off its dimension, whatever the corner rule. */
export function coreSize(part: Board, types: readonly BandType[]): { length: number; width: number; thickness: number } {
  if (NO_BANDS(part)) return { length: part.length, width: part.width, thickness: part.thickness };
  const { t } = judge(part, types);
  return { length: part.length - t[2]! - t[3]!, width: part.width - t[0]! - t[1]!, thickness: part.thickness };
}

const EMPTY: readonly never[] = Object.freeze([]);

const stripsOf = memoised((part: Board, types: readonly BandType[]): readonly Strip[] => {
  const j = judge(part, types);
  const out: Strip[] = [];
  for (let i = 0; i < 4; i += 1) {
    const bt = j.type[i];
    if (!bt || bt.kind !== 'solid') continue;
    const side = BAND_SIDES[i]!;
    const long = i < 2;
    const nb = long ? [2, 3] : [0, 1];
    const givesWay = (part.cornerRule === 'long' && !long) || (part.cornerRule === 'ends' && long);
    const own = bt.thickness;
    const finished = sideLength(part, side) - (givesWay ? j.t[nb[0]!]! + j.t[nb[1]!]! : 0);
    const end = (k: number): StripEnd => {
      const n = j.t[nb[k]!]!;
      return { mitre: part.cornerRule === 'mitre' && n > 0 ? Math.atan(n / own) : null };
    };
    out.push({
      part: part.id, partName: part.name, side, type: bt, finished, length: finished + bt.lengthAllowance,
      width: own, thickness: part.thickness + bt.widthAllowance, ends: [end(0), end(1)],
    });
  }
  return freeze(out, new Set(out.map((s) => s.type)));
});

/** The solid strips a part's bands are cut as (spec §3.2), in canonical side order. */
export function strips(part: Board, types: readonly BandType[]): readonly Strip[] {
  return NO_BANDS(part) ? EMPTY : stripsOf(part, types);
}

const tapeRunsOf = memoised((part: Board, types: readonly BandType[]): readonly TapeRun[] => {
  const j = judge(part, types);
  const ch = j.outline?.chords ?? [];
  const isTape = (k: number) => j.type[k]?.kind === 'tape';
  const out: TapeRun[] = [];
  for (let i = 0; i < 4; i += 1) {
    const bt = j.type[i];
    if (!bt || bt.kind !== 'tape') continue;
    const adjacent = i < 2 ? [2, 3] : [0, 1];
    let length = 0;
    for (const c of j.chords[i]!) {
      // A chord in an adjacent TAPED side's stretch too (a shared corner arc) is bought once: half each.
      const shared = adjacent.some((k) => isTape(k) && j.chords[k]!.includes(c));
      length += chordLength(ch[c]!) * (shared ? 0.5 : 1);
    }
    out.push({ side: BAND_SIDES[i]!, type: bt, length: length + bt.lengthAllowance });
  }
  return freeze(out, new Set(out.map((r) => r.type)));
});

/** The tape a part's bands use (spec §3.3), along each side's TRUE outline, allowance included; canonical side order. */
export function tapeRuns(part: Board, types: readonly BandType[]): readonly TapeRun[] {
  return NO_BANDS(part) ? EMPTY : tapeRunsOf(part, types);
}

export const stripId = (s: Pick<Strip, 'part' | 'side'>) => `${s.part}#band:${s.side.across}-${s.side.from}`;

/** A strip as a plain solid part (spec §4.2, §4.4): ripped off a board's edge — its stock thickness is the strip's width
 *  across the panel's edge, its width the band's thickness — grain along its length. Never stored. */
export function stripBoard(s: Strip): Board {
  return {
    id: stripId(s), name: `${s.partName} edging (${s.side.across} ${s.side.from} ${endWord(s.side.across)})`,
    length: s.length, width: s.width, thickness: s.thickness, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
    material: s.type.material, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long',
  };
}

/** A part's bands for grouping keys: sides, type ids and the corner rule, exact; '' with no bands. */
export const bandSignature = (part: Board) => (part.bands.length === 0 ? '' : `${part.bands.map(bandValues).join(';')}/${part.cornerRule}`);

/** What is cut from stock (spec §4.3, §4.4): every part at its CORE size (the same object when it has no bands or no
 *  unfaulted thickness), then every solid strip as a part. THE input for nesting and by-the-piece packing. */
export function cutStock(doc: Pick<FlatDocument, 'boards' | 'bandTypes'>): Board[] {
  const parts = doc.boards.map((b) => {
    if (b.bands.length === 0) return b;
    const c = coreSize(b, doc.bandTypes);
    return c.length === b.length && c.width === b.width ? b : { ...b, length: c.length, width: c.width, bands: [] };
  });
  return [...parts, ...doc.boards.flatMap((b) => strips(b, doc.bandTypes).map(stripBoard))];
}
