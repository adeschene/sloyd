import { nextId } from './ids';
import type { Band, BandType, CornerRule, Dimension, ProfileSide, SolidBand, TapeBand } from './types';

/** The built-in band type (edge banding spec §2.1): always present, editable, never deleted. */
export const BUILT_IN_BAND_ID = 'band-iron-on';
export const BUILT_IN_BAND: TapeBand = Object.freeze({
  id: BUILT_IN_BAND_ID, name: 'Iron-on veneer', kind: 'tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null,
}) as TapeBand;
export const BAND_KINDS = ['tape', 'solid'] as const;
export const CORNER_RULES: readonly CornerRule[] = ['long', 'ends', 'mitre'];

/** The four sides of the broad face in canonical order (spec §2.2): the long edges, then the ends. */
export const BAND_SIDES: readonly ProfileSide[] = Object.freeze([
  { across: 'width', from: 'min' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' },
] as ProfileSide[]);

/** Invariant 40's table for bands: every field, exact. */
export const BAND_FIELDS = { side: true, type: true } as const satisfies Record<keyof Band, true>;

export const sideIndex = (s: ProfileSide) => (s.across === 'width' ? 0 : 2) + (s.from === 'min' ? 0 : 1);
export const sameSide = (a: ProfileSide, b: ProfileSide) => a.across === b.across && a.from === b.from;
export const bandValues = (b: Band) => `${b.side.across}:${b.side.from}:${b.type}`;
export const copyBand = (b: Band): Band => ({ side: { across: b.side.across, from: b.side.from }, type: b.type });
export const bandOn = (bands: readonly Band[], side: ProfileSide) => bands.find((b) => sameSide(b.side, side));

export function sameBands(a: readonly Band[], b: readonly Band[]): boolean {
  return a.length === b.length && a.every((x, i) => bandValues(x) === bandValues(b[i]!));
}

/** One band per side (the first wins), in canonical order. */
export function canonicalBands(bands: readonly Band[]): Band[] {
  const seen = new Set<number>();
  const kept = bands.filter((b) => { const i = sideIndex(b.side); if (seen.has(i)) return false; seen.add(i); return true; });
  return kept.sort((p, q) => sideIndex(p.side) - sideIndex(q.side));
}

/** A mirror along `d` (inv 44): a flag flip on every side across `d`, never arithmetic; re-sorted. Its own inverse. */
export function mirrorBands(bands: readonly Band[], d: Dimension): Band[] {
  return canonicalBands(bands.map((b) => (b.side.across === d
    ? { side: { across: b.side.across, from: b.side.from === 'min' ? 'max' : 'min' }, type: b.type } : copyBand(b))));
}

/** `sides` set to `type` (null clears them), the rest kept; canonical order. */
export function withBands(bands: readonly Band[], sides: readonly ProfileSide[], type: string | null): Band[] {
  const rest = bands.filter((b) => !sides.some((s) => sameSide(s, b.side))).map(copyBand);
  const added = type === null ? [] : sides.map((s) => ({ side: { across: s.across, from: s.from }, type }));
  return canonicalBands([...rest, ...added]);
}

export function sameBandType(a: BandType, b: BandType): boolean {
  if (a.id !== b.id || a.name !== b.name || a.kind !== b.kind || a.thickness !== b.thickness || a.lengthAllowance !== b.lengthAllowance) return false;
  return a.kind === 'tape'
    ? a.tapeWidth === (b as TapeBand).tapeWidth && a.pricePerFoot === (b as TapeBand).pricePerFoot
    : a.material === (b as SolidBand).material && a.widthAllowance === (b as SolidBand).widthAllowance;
}

/** `base`, else `base 2`, `base 3`, … — the first not taken (uniqueName's "(n)" suffix is for part names; the spec reads "Solid edging 2"). */
function freeName(base: string, taken: readonly BandType[]): string {
  const names = new Set(taken.map((t) => t.name));
  let n = 1;
  let name = base;
  while (names.has(name)) { n += 1; name = `${base} ${n}`; }
  return name;
}

/** A new band type with the spec §2.1 defaults and a name unique among `taken`. */
export function newBandType(kind: BandType['kind'], taken: readonly BandType[]): BandType {
  if (kind === 'tape') {
    return { id: nextId(), name: freeName('Tape', taken), kind, thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null };
  }
  return { id: nextId(), name: freeName('Solid edging', taken), kind, thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
}

/** `doc` with its band types replaced by `next`: the SAME object when `next` is undefined or equal type by type
 *  (edit()'s no-op test, inv 4). */
export function withBandTypes<T extends { bandTypes: BandType[] }>(doc: T, next: readonly BandType[] | undefined): T {
  if (next === undefined) return doc;
  if (next.length === doc.bandTypes.length && next.every((t, i) => sameBandType(t, doc.bandTypes[i]!))) return doc;
  return { ...doc, bandTypes: [...next] };
}
