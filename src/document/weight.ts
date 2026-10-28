import type { BandType, Board, FlatDocument } from './types';
import { bodyVolume, partGeometry, type PartGeometry } from './bodies';
import { strips, type Strip } from './banding';
import { catalogOf, type MaterialCatalog } from './materials';

/**
 * Weight (weight spec §4; invariant 63): the ONE place it is computed. The wood the MODEL keeps — every body
 * `boardBodies` builds (after cuts, angle cuts, curves, profiles, tenons and dovetails), read through `partGeometry` —
 * times its material's density. Numbers only: no `units` import; the strings are `cutlist.ts`' and `quantity.ts`'.
 *
 * - Holes are ignored (`boardBodies` is hole-free, inv 50): four 35 mm hinge cups are about 0.06 lb of oak, against a ±15%
 *   density spread.
 * - A lean moves wood, never changes it: volume is the part's own.
 * - Solid edging is weighed at its BAND's density (inv 54: the model is the finished size, bodies untouched by bands): the
 *   core is the finished part's wood less each solid strip's box, so core + strips is the finished wood exactly. Tape is
 *   weighed as core.
 * - `partMass` (the tip check) never reads density and is untouched: the checks are byte for byte as before.
 */

const CUBIC_INCHES_PER_FOOT = 1728;

const volumes = new WeakMap<PartGeometry, number>();

/** Cubic inches of wood a part's bodies keep. Memoised on its cached geometry (keyed by `geometryKey`, inv 15/50). */
export function woodVolume(b: Board): number {
  const g = partGeometry(b);
  let v = volumes.get(g);
  if (v === undefined) {
    v = 0;
    for (const body of g.bodies) {
      v += body.box
        ? (body.box.length[1] - body.box.length[0]) * (body.box.width[1] - body.box.width[0]) * (body.box.thickness[1] - body.box.thickness[0])
        : bodyVolume(body);
    }
    volumes.set(g, v);
  }
  return v;
}

/** Cubic inches of one solid strip: its box (a strip is cut as a plain box, `stripBoard`). */
export const stripVolume = (s: Strip): number => s.length * s.width * s.thickness;

const pounds = (cubicInches: number, density: number) => (cubicInches / CUBIC_INCHES_PER_FOOT) * density;

/** Pounds of a part's CORE at its own material's density; null when that material has no density. */
export function coreWeight(part: Board, types: readonly BandType[], catalog: MaterialCatalog): number | null {
  const density = catalog.get(part.material)?.density;
  if (density === undefined) return null;
  const edging = strips(part, types).reduce((s, x) => s + stripVolume(x), 0);
  return pounds(woodVolume(part) - edging, density);
}

/** Pounds of one solid strip at its band type's material's density; null when that material has no density. */
export function stripWeight(s: Strip, catalog: MaterialCatalog): number | null {
  const density = catalog.get(s.type.material)?.density;
  return density === undefined ? null : pounds(stripVolume(s), density);
}

/** A weight, and the materials it could not weigh: their ids, in catalog order ([] when complete). */
export interface WeightSummary { pounds: number; unweighed: string[] }

function summarise(parts: readonly Board[], types: readonly BandType[], catalog: MaterialCatalog): WeightSummary {
  let total = 0;
  const missing = new Set<string>();
  const add = (w: number | null, material: string) => {
    if (w === null) missing.add(material);
    else total += w;
  };
  for (const part of parts) {
    add(coreWeight(part, types, catalog), part.material);
    for (const s of strips(part, types)) add(stripWeight(s, catalog), s.type.material);
  }
  const order = catalog.ids;
  const unweighed = [...missing].sort((a, b) => rank(order, a) - rank(order, b) || a.localeCompare(b));
  return { pounds: total, unweighed };
}
/** Catalog position; an id the catalog does not know sorts last. */
const rank = (ids: readonly string[], id: string) => {
  const i = ids.indexOf(id);
  return i < 0 ? ids.length : i;
};

/** The piece: every part of the FLAT document (every Definition copy; hidden parts too, inv 43), cores and strips. */
export function weightOf(flat: FlatDocument): WeightSummary {
  return summarise(flat.boards, flat.bandTypes, catalogOf(flat));
}

/** The parts `partIds` names (flat ids), each core plus its own strips. */
export function selectionWeight(flat: FlatDocument, partIds: ReadonlySet<string>): WeightSummary {
  return summarise(flat.boards.filter((b) => partIds.has(b.id)), flat.bandTypes, catalogOf(flat));
}
