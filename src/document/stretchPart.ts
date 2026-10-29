import type { Board, CutFrom, ProfileCut, ProfileEnd } from './types';
import type { Units } from '../units/length';
import { stretchCut } from './cuts';
import { rebaseAngleCuts, rebaseCurves, rebaseProfiles } from './resizeEnd';
import { rebaseHoles } from './holeRebase';
import { hasCompoundCut, throughOf, touchedRegion } from './angleCuts';
import { holeInstances, holeRegion } from './holes';
import { curveOutline, uvDims } from './curves';
import { endPos, runDim } from './profiles';
import { tenonZone } from './roundTenons';
import { dovetailZones } from './dovetails';
import { dovetailsOf } from './dovetailModel';
import { fingerSets } from './boxJoints';
import { leans } from './lean';
import { axisDimensions, endFacing, fromWorldOffset } from './geometry';
import { partBounds } from './worldBounds';
import {
  boxJointsAcross, compoundText, crosses, curvesAndProfiles, dovetailsAcross, leansText, tenonCentred, thicker, tooShort,
} from './stretchText';

/**
 * One world part stretched at a line (parametric-resize spec §4.2, §5): the ONE place a spanning part grows by `delta` on
 * the part dimension `d` world axis `k` carries (`axisDimensions`, inv 44), its features following their side of the
 * line, or the refusal sentence. Pure: `b` (a WORLD part, as `worldParts` returns it) is never mutated.
 *
 * `s` is the line's WORLD coordinate on `k`; everything past it (the +k side) moves by `delta`. The part's `far` end is the
 * one facing world +k (`endFacing(b, k, 1)`), which a turn may make its MIN end. Every feature is judged in part terms on
 * `d` against the BAND: `[u, u]` on a grow, the removed wood on a shrink (`[u, u + |δ|]` toward a max far end,
 * `[u − |δ|, u]` toward a min one), with `u` the line's part-local station. A feature wholly on the fixed side is NEAR and
 * keeps its distance to the fixed end; one wholly toward `far` is FAR and keeps its distance to the moving end; anything
 * else CROSSES. Near and far reuse each kind's existing rebase helper on a one-feature copy: NEAR shifts the numbers
 * measured from `far`, FAR those measured from the fixed end (spec §5, amended in planning). `resizeEnd` is NOT used: its
 * rebase keeps far features fixed in the world, which is the opposite of a stretch.
 *
 * Refusal order (Global Constraints; the corner joints moved ahead of the per-feature lists by the controller's ruling,
 * because finger notches are rectangular cuts that `stretchCut` would otherwise lengthen silently or refuse with the
 * generic `cut` sentence): thickness, lean, compound, too short, finger sets, dovetails, cuts, angle cuts, holes, curves,
 * curves-and-profiles, profiles, tenons. Exact: the grown dimension is `was + delta`, every shifted number one addition;
 * `position` is kept (the min corner is before the line). A list nothing changes is the SAME array, an entry nothing
 * changes the SAME object, and an absent `tenons`/`dovetails` key stays absent (invs 58, 62).
 */
export function stretchPart(b: Board, k: 0 | 1 | 2, s: number, delta: number, units: Units): Board | { refused: string } {
  const EPS = 1e-9;
  const name = b.name;
  const refuse = (refused: string) => ({ refused });
  const d = axisDimensions(b)[k];
  if (d === 'thickness') return refuse(thicker(name));
  if (leans(b)) return refuse(leansText(name));
  if (hasCompoundCut(b)) return refuse(compoundText(name));
  const box = partBounds(b);
  if (delta < 0 && box.max[k] < s - delta - EPS) return refuse(tooShort(name, delta, units));

  const far: CutFrom = endFacing(b, k, 1);
  const fixed: CutFrom = far === 'max' ? 'min' : 'max';
  // The line's part-local station: the world offset from the min corner, read through the turn (inv 44).
  const u = fromWorldOffset(b, k, s - box.min[k]);
  const band: [number, number] = delta >= 0 ? [u, u] : far === 'max' ? [u, u - delta] : [u + delta, u];
  /** A span on `d` against the band. A span touching the band counts as on the side its body is on; a zero-width span
   *  at the line on a grow is near (as `stretchCut`). */
  const side = ([lo, hi]: readonly [number, number]): 'near' | 'far' | 'crosses' => {
    const belowBand = hi <= band[0] + EPS;
    const aboveBand = lo >= band[1] - EPS;
    if (far === 'max' ? belowBand : aboveBand) return 'near';
    if (far === 'max' ? aboveBand : belowBand) return 'far';
    return 'crosses';
  };
  /** The end whose measured numbers gain `delta`: `far` for a near feature, the fixed end for a far one. */
  const endFor = (place: 'near' | 'far'): CutFrom => (place === 'near' ? far : fixed);

  // Corner joints (S3): the layout is a function of J's span and the mate is a partition partner, so a line on J refuses;
  // on `dim` a line in a zone refuses. `d` is never the thickness here, so `dim !== d` means `d` is J.
  for (const f of fingerSets(b)) {
    const zone: [number, number] = f.end === 'min' ? [0, f.depth] : [b[f.dim] - f.depth, b[f.dim]];
    if (f.dim !== d || side(zone) === 'crosses') return refuse(boxJointsAcross(name));
  }
  const dovetails = dovetailsOf(b);
  if (dovetails.length > 0) {
    const zones = dovetailZones(b);
    if (dovetails.some((dv, i) => dv.dim !== d || side(zones[i]![d]) === 'crosses')) return refuse(dovetailsAcross(name));
  }

  // Rectangular cuts: `stretchCut` holds the per-side rule, and a crossing cut's growth (spec §5's `cuts` row).
  let cutCrosses = false;
  const cuts = sameList(b.cuts, (c) => {
    const out = stretchCut(b, c, d, band, far, delta);
    if (out === 'crosses') { cutCrosses = true; return c; }
    return out;
  });
  if (cutCrosses) return refuse(crosses(name, 'cut'));

  // Angle cuts: a crossing one would change its angle. One that removes nothing (`touchedRegion` null) has no span and
  // is kept as it is. One running straight THROUGH `d` (an edge chamfer or bevel along the length) is a PRISM along `d`:
  // it has no number on `d`, so the stretch only lengthens it — unchanged, never crossing (controller Ruling 2).
  for (const a of b.angleCuts) {
    if (throughOf(a) === d) continue;
    const r = touchedRegion(b, a);
    if (r && side(r[d]) === 'crosses') return refuse(crosses(name, a.kind));
  }
  const angleCuts = sameList(b.angleCuts, (a) => {
    if (throughOf(a) === d) return a;
    const r = touchedRegion(b, a);
    if (!r) return a;
    const tmp = { ...b, angleCuts: [a] };
    rebaseAngleCuts(tmp, d, endFor(side(r[d]) as 'near' | 'far'), delta);
    return tmp.angleCuts[0]!;
  });

  // Hole rows: the pitch can't stretch (S2). A row's span is every bore's box (`holeRegion`), so a row bored into the
  // end face that moves is far and keeps its numbers (`rebaseHoles` never shifts a `face === d` row).
  const rowSide = b.holes.map((r) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of holeInstances(b, r)) {
      const [a, z] = holeRegion(h)[d];
      lo = Math.min(lo, a);
      hi = Math.max(hi, z);
    }
    return side([lo, hi]);
  });
  if (rowSide.includes('crosses')) return refuse(crosses(name, 'hole row'));
  const holes = sameList(b.holes, (r, i) => {
    const tmp = { ...b, holes: [r] };
    rebaseHoles(tmp, d, endFor(rowSide[i] as 'near' | 'far'), delta);
    return tmp.holes[0]!;
  });

  // Curves: an arc can't stretch. A curve THROUGH `d` is a prism along it (its outline has no number on `d`): the stretch
  // only lengthens the extrusion, so it passes unchanged (controller Ruling 2). Otherwise its span is its outline's
  // (chord vertices on the true arc, `curveOutline`) on whichever of u, v is `d`.
  const curveSide = b.curves.map((c) => {
    if (c.through === d) return 'prism' as const;
    const i = uvDims(c.through)[0] === d ? 0 : 1;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of curveOutline(b, c).pts) { lo = Math.min(lo, p[i]!); hi = Math.max(hi, p[i]!); }
    return side([lo, hi]);
  });
  if (curveSide.includes('crosses')) return refuse(crosses(name, 'curve'));
  // A profile on a curved part follows the outline (`carriesProfiles`), which a stretch can't re-trace: refused whole.
  if (b.curves.length > 0 && b.profiles.length > 0) return refuse(curvesAndProfiles(name));
  const curves = sameList(b.curves, (c, i) => {
    if (curveSide[i] === 'prism') return c;
    const tmp = { ...b, curves: [c] };
    rebaseCurves(tmp, d, endFor(curveSide[i] as 'near' | 'far'), delta);
    return tmp.curves[0]!;
  });

  // Profiles, per STATION (spec §5: a run along `d` grows by δ): a profile's two stations may lie on opposite sides, so
  // one one-profile copy can't take one end. Each station `{ side, from, at }` whose side runs along `d` is judged by
  // its position (`endPos`) and rebased by `rebaseProfiles` on a copy holding a run of that ONE station at both ends
  // (`rebaseProfiles`' own rule, one addition). `through` ends and `loop` runs sit at an end or go round, and need
  // nothing; a station whose side runs along the other dimension sits at an end of `d` and follows it. On a shrink a
  // station inside the removed band crosses.
  let profileCrosses = false;
  const station = (e: ProfileEnd): ProfileEnd => {
    if ('through' in e || runDim(e.side) !== d) return e;
    const x = endPos(b, e);
    const place = side([x, x]);
    if (place === 'crosses') { profileCrosses = true; return e; }
    const tmp = { ...b, profiles: [{ ...PROBE, run: { start: e, end: e } }] };
    rebaseProfiles(tmp, d, endFor(place), delta);
    return (tmp.profiles[0]!.run as { start: ProfileEnd }).start;
  };
  const profiles = sameList(b.profiles, (p) => {
    if ('loop' in p.run) return p;
    const start = station(p.run.start);
    const end = station(p.run.end);
    return start === p.run.start && end === p.run.end ? p : { ...p, run: { start, end } };
  });
  if (profileCrosses) return refuse(crosses(name, 'profile'));

  // Round tenons sit on the length's ends, centred on the section: a line across the width runs through the centring,
  // and one along the length must clear each tenon's zone. A tenon is stored end-relative, so it follows its end as is.
  if (b.tenons && b.tenons.length > 0) {
    if (d !== 'length') return refuse(tenonCentred(name));
    if (b.tenons.some((t) => side(tenonZone(b, t).length) === 'crosses')) return refuse(crosses(name, 'round tenon'));
  }

  // Bands, hardware, dovetails and tenons are unchanged once they pass: bands follow their side automatically, the
  // rest are measured from their end.
  return { ...b, [d]: b[d] + delta, cuts, angleCuts, holes, curves, profiles };
}

/** A placeholder profile carrying one station through `rebaseProfiles` (only its `run` is read). */
const PROBE: Omit<ProfileCut, 'run'> = { id: '', face: 'max', kind: 'roundover', size: 0, facing: 'face' };

/** `list` mapped by `f`; the SAME array when every entry comes back as the same object. */
function sameList<T>(list: T[], f: (x: T, i: number) => T): T[] {
  const out = list.map(f);
  return out.every((x, i) => x === list[i]) ? list : out;
}
