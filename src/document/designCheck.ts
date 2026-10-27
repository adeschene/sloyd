import type { Board, FlatDocument } from './document';
import type { Dovetail, Region } from './types';
import type { RejectedPart } from './generated';
import { pocketCells } from './cuts';
import { clipConvex } from './bodies';
import type { BodyFace } from './bodies';
import { splitRegion, taperFields, touchedRegion } from './angleCuts';
import type { AngleConflict, TaperConflict } from './angledRefusal';
import { SNAP_INCHES, axisFrame, boardExtents, spanToWorldOffset } from './geometry';
import { localToDir } from './taperWorld';
import { leans } from './lean';
import { partBounds } from './worldBounds';
import { LEVEL_EPS, levelFaces, overlapArea, worldBodyFaces, type LevelFace } from './leanContacts';
import { REST_AREA, TOUCH } from './checkTolerances';
import { builtTenons, shoulderAt } from './roundTenons';
import { builtDovetails, dovetailLayout, jointLineOf } from './dovetails';
import { tenonJoints, tenonMeetsBore, withoutTenon, type TenonJoint } from './tenonJoints';
import { floorToTick, formatLength, formatMm, isMetric, type Units } from '../units/length';

/**
 * The checks a generated design is held to (spec §4.3). Pure, against the
 * rounded and migrated boards — the exact values that will be stored.
 *
 * Messages are written FOR THE MODEL, in decimal inches, naming parts by
 * their STORED (post-dedupe) names and the axis involved, so they are
 * actionable. The Joinery and Refine dialogs show them too, so in a METRIC
 * project a message with a length also carries `shown`, the same words with
 * the lengths in mm (0.1 mm: a fault's size can sit under a whole mm; fu 355) —
 * the → units edge. An imperial violation carries no `shown`: byte-for-byte as
 * before (inv 52). The display units are a parameter, not read off the checked
 * document alone, because Refine checks the model's (imperial) conversion of a
 * metric project.
 *
 * `hangs` (fu 165): every part off the floor must be held: resting, between, or lapped (inv 39).
 * `tips` (fu 165): the grounded parts' volume-weighted centre of mass sits at least min(1in, s/4) inside the floor footprint's hull.
 *
 * Overlap is measured between SOLIDS (invariant 38): a cut explains an overlap by
 * removing the stock. Do not raise TOUCH to make joints pass.
 * Contacts, grounding and the tip footprint read `contactSolids` (an angled part counts only where it is flat; a sloped face
 * is never a contact); overlap stays on `worldSolids` except for a pair with an angled part, measured on real bodies (fu 302);
 * the tip check weighs an angled part by its real bodies (`partMass`, fu 303).
 *
 * A LEANING part (splayed legs spec §7) is extended onto, never weakened: its box is its real bounds (`partBounds`, R2),
 * its overlap and weight read its leaned bodies, and it touches only by RESTING — a level face of it on a level face of
 * the other part (`LeanView`). Every unleaned pair takes the code above untouched, and a lean-free document never builds
 * the view (inv 39's PROHIBITION stands as written).
 *
 * A ROUND TENON (round tenons spec §5.2) seated in a matching bore (`tenonJoints`, the ONE exception to "holes are ignored
 * by every check", inv 38) is a JOINT: its round wood is not measured against its socket's part (`withoutTenon`, that pair
 * only — the shoulder still is), it connects its two parts in the grounding walk, and it holds both (`isHeld`'s clause
 * (d), joined: a full alternative to (a)–(c), for any part, leaning or not, by a partner still grounded without it). A
 * part with a BUILT tenon is measured on its real bodies (`realBodied`; one whose tenons are all faulted checks as its
 * tenon-free twin), and a built tenon's wood, its tip disc included, is never a contact anywhere: not a rest, not the
 * floor, not grounding's `connected`, not the tip footprint — an unleaned part reads `contactRegions` (trimmed to the
 * shoulders; its floor test too, `stands`), a leaning one `checkedLevelFaces` (its bodies cut at the shoulders). So a part
 * standing only on a foot tenon's tip is not on the floor. A tenon-free document scans for tenons once and takes every path
 * above unchanged.
 */
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts' | 'hangs' | 'tips' | 'angle-joint' | 'feature-turned' | 'hole-fault' | 'band-fault' | 'profile-fault';
export interface Violation {
  kind: ViolationKind;
  message: string;
  parts: string[];
  /** The person's copy when it differs from `message` (a metric project's lengths in mm; fu 355). */
  shown?: string;
}
/** The text a dialog shows for a violation. */
export const shownText = (v: Violation) => v.shown ?? v.message;
export interface DesignLimits { width: number | null; depth: number | null; height: number | null; maxParts: number }

/** `TOUCH` and `REST_AREA` live in the leaf `checkTolerances.ts` (no import cycle through here); re-exported. */
export { TOUCH, REST_AREA };
export const MIN_SIDE = 1 / 8;

const AXES = ['X', 'Y', 'Z'] as const;
const inches = (v: number) => `${+v.toFixed(3)}in`;

/** Writes a length into a message. */
type Len = (v: number) => string;
/** `message` with lengths in inches; `shown` with them in mm when `display` is metric (and the text differs). */
function worded(display: Units, text: (len: Len) => string): { message: string; shown?: string } {
  const message = text(inches);
  if (!isMetric(display)) return { message };
  const shown = text((v) => formatMm(v, 1));
  return shown === message ? { message } : { message, shown };
}

export interface Box { name: string; min: number[]; max: number[] }

/** Length of the shared span on one axis; negative is a gap. */
const shared = (a: Box, b: Box, i: number) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);

/**
 * Connected for support: no gap wider than TOUCH on any axis, and real
 * shared span (> TOUCH) on at least two. Face contact and interpenetration
 * both qualify; EDGE contact (shared span on one axis only) does not — a box
 * balanced on another's edge is a defect to report, not a joint.
 */
const connected = (a: Box, b: Box) => {
  const s = [0, 1, 2].map((i) => shared(a, b, i));
  return s.every((v) => v >= -TOUCH) && s.filter((v) => v > TOUCH).length >= 2;
};

const distance = (a: Box, b: Box) =>
  Math.hypot(...[0, 1, 2].map((i) => Math.max(0, -shared(a, b, i))));

/** Coverage a side face needs, on BOTH faces of a pair, to hold a part between two others (fu 165). */
export const HELD_COVERAGE = 0.5;

/** Builder's copy (round tenons spec §5.2): an overlap where a tenon runs where a socket is that does not fit it. */
export const TENON_HINT = ' — its round tenon doesn\'t match the socket there';

/** Inches the centre of mass must sit inside the floor footprint; shrinks to s/4 for a footprint under 4in across (fu 165). */
export const TIP_MARGIN = 1;

type P2 = [number, number];
/** Andrew's monotone chain, counter-clockwise in (x, z); collinear points dropped. */
function hull(points: P2[]): P2[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(ps), ...half([...ps].reverse())];
}

/**
 * STABLE (fu 165): the volume-weighted centre of mass of the GROUNDED parts
 * must sit at least min(TIP_MARGIN, s/4) inside the convex hull of the
 * on-the-floor parts' plan corners. Floating parts are left out — they are
 * already `unsupported`, and one fault gets one report.
 */
function tipsMessage(boxes: Box[], grounded: Set<number>, onFloor: (i: number) => boolean, footprint: (i: number) => Box[], mass: (i: number) => { v: number; c: number[] } | null): ((len: Len) => string) | null {
  const floor = boxes.flatMap((_, i) => (onFloor(i) ? footprint(i) : []));
  if (floor.length === 0) return null;
  let vol = 0, cx = 0, cz = 0;
  for (const i of grounded) {
    // An angled part weighs its real solid (fu 303); every other part its box, by the same arithmetic as before.
    const real = mass(i);
    if (real) {
      // A part its cuts consumed has no wood and no weight (its centre would be NaN and poison the sum).
      if (real.v > 0) {
        vol += real.v;
        cx += real.v * real.c[0]!;
        cz += real.v * real.c[2]!;
      }
      continue;
    }
    const b = boxes[i];
    const v = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
    vol += v;
    cx += v * (b.min[0] + b.max[0]) / 2;
    cz += v * (b.min[2] + b.max[2]) / 2;
  }
  const c: P2 = [cx / vol, cz / vol];
  const h = hull(floor.flatMap((b): P2[] => [
    [b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]],
  ]));
  if (h.length < 3) {
    return () => 'The piece would tip: its centre of mass is not over a usable footprint. Widen the base or move weight inward.';
  }
  const xs = h.map((p) => p[0]);
  const zs = h.map((p) => p[1]);
  const s = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const m = Math.min(TIP_MARGIN, s / 4);
  let d = Infinity;
  let normal: P2 = [1, 0];
  h.forEach((a, k) => {
    const b = h[(k + 1) % h.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    const dist = (ex * (c[1] - a[1]) - ez * (c[0] - a[0])) / len; // + inside (CCW: interior on the left)
    if (dist < d) { d = dist; normal = [ez / len, -ex / len]; }   // outward = right of the edge
  });
  if (d >= m) return null;
  const dir = Math.abs(normal[0]) >= Math.abs(normal[1])
    ? `${normal[0] >= 0 ? '+' : '-'}X`
    : `${normal[1] >= 0 ? '+' : '-'}Z`;
  return (len) => `The piece would tip toward ${dir}: its centre of mass is ${len(Math.abs(d))} ${d >= 0 ? 'inside' : 'beyond'} the edge of what touches the floor; keep it at least ${len(m)} inside. Widen the base or move weight inward.`;
}

/**
 * The parts connected to the floor through touching parts, optionally with one part removed from the design. The ONE
 * grounding walk (inv 39): with a `lean` view, a pair with a leaning part is joined only when one RESTS on the other and a
 * leaning part starts the walk only from a level foot on the floor (splayed legs §7.2); every other pair and part is
 * judged exactly as without it. `joint` adds the seated-tenon pairs (round tenons §5.2); `stands`, when given, is each
 * part's floor test on its tenon-trimmed wood (a built tenon is never a contact), replacing the box's.
 */
function groundedSet(boxes: Box[], touching: Box[][], tapered: boolean[], skip: number | null = null, lean: LeanView | null = null, joint: ((i: number, j: number) => boolean) | null = null, stands: readonly boolean[] | null = null): Set<number> {
  const plain = (i: number, j: number) => (tapered[i] || tapered[j]
    ? touching[i].some((a) => touching[j].some((b) => connected(a, b)))
    : connected(boxes[i], boxes[j]));
  const touches = lean
    ? (i: number, j: number) => (lean.leaning[i] || lean.leaning[j] ? lean.rests(i, j) > 0 || lean.rests(j, i) > 0 : plain(i, j))
    : plain;
  // Round tenons §5.2: a seated tenon connects its two parts, asked BEFORE the leaning rule, so a leaning part is connected
  // by its joint too. No tenon in the document: `joint` is null and the walk is exactly as before.
  const joined = joint ? (i: number, j: number) => joint(i, j) || touches(i, j) : touches;
  const grounded = new Set<number>();
  const queue = boxes.flatMap((b, i) => (i !== skip && (lean ? lean.floor[i] : stands ? stands[i] : b.min[1] <= TOUCH) ? [i] : []));
  queue.forEach((i) => grounded.add(i));
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((_, j) => {
      if (j !== skip && !grounded.has(j) && joined(i, j)) {
        grounded.add(j);
        queue.push(j);
      }
    });
  }
  return grounded;
}

/** One face contact ON a box: which face (axis, side), who touches it, over what area. `rest`: a RESTING contact of a pair
 *  with a leaning part (splayed legs §7.2; always axis 1), which only clause (a) of `isHeld` reads. */
interface Contact { other: number; axis: number; side: -1 | 1; area: number; rest?: true }

/**
 * Face contacts per box: face planes coincide within TOUCH on one axis, and
 * the shared span is > TOUCH on BOTH others. Disjoint from overlap BY
 * DEFINITION — coincident planes mean a shared span <= TOUCH on that axis —
 * so an interpenetrating pair is never a contact here.
 */
function contactsOf(boxes: Box[]): Contact[][] {
  return solidContactsOf(boxes.map((b) => [b]));
}

/**
 * Face contacts between parts, measured between their SOLIDS (spec §6.3): a
 * seated tenon's box interpenetrates its leg's box, but its solid does not, so
 * only solids can say what is touching what. Aggregated per part — any solid of
 * i against any solid of j (i !== j); solids of the SAME part are ignored.
 * A cut-free part has one solid, equal to its box, so this is `contactsOf`'s
 * old behaviour exactly.
 */
function solidContactsOf(solids: Box[][]): Contact[][] {
  const out: Contact[][] = solids.map(() => []);
  solids.forEach((as, i) => {
    solids.forEach((bs, j) => {
      if (i === j) return;
      for (const a of as) for (const b of bs) {
        for (const axis of [0, 1, 2]) {
          const [p, q] = [0, 1, 2].filter((k) => k !== axis);
          const sp = shared(a, b, p);
          const sq = shared(a, b, q);
          if (sp <= TOUCH || sq <= TOUCH) continue;
          if (Math.abs(a.min[axis] - b.max[axis]) <= TOUCH) out[i].push({ other: j, axis, side: -1, area: sp * sq });
          else if (Math.abs(a.max[axis] - b.min[axis]) <= TOUCH) out[i].push({ other: j, axis, side: 1, area: sp * sq });
        }
      }
    });
  });
  return out;
}

/** Fraction of one face of `b` covered by its contacts, capped at 1. */
function coverage(b: Box, cs: Contact[], axis: number, side: -1 | 1): number {
  const [p, q] = [0, 1, 2].filter((k) => k !== axis);
  const face = (b.max[p] - b.min[p]) * (b.max[q] - b.min[q]);
  const touched = cs.filter((c) => c.axis === axis && c.side === side).reduce((s, c) => s + c.area, 0);
  return Math.min(1, touched / face);
}

/**
 * HELD (fu 165, inv 39): (a) something under it, (b) both faces of the X or Z
 * pair covered >= HELD_COVERAGE, or (c) a contact on a broad face (normal to its
 * smallest extent; ties all count). On the TOP (+Y) broad face a contact counts
 * only when the part above is held WITHOUT this part: it is on the floor, or it
 * meets (a), (b) or (c) using its own contacts with this part removed, one level
 * only (in that inner test a +Y contact never counts, so there is no recursion).
 * It must also still be connected to the floor with this part removed from the
 * design (the grounding walk, skipping this part): otherwise a box, or two lapped
 * uprights, standing on a hanging shelf hold each other and so "hold" the shelf,
 * when without the shelf they connect to nothing.
 * Why: cleats and battens screwed up under a seat are real construction, but a
 * crate sitting on a shelf is held only by the shelf, so it must not hold the
 * shelf up. (c) is what lets a backrest or an apron screwed to a post's face
 * pass; coverage, not two-sidedness, is what catches the workbench shelf: it
 * touched legs on BOTH ends, 19% each.
 * (d) JOINED (round tenons spec §5.2): a seated tenon joins its part and its socket's part (`partners`, either way round),
 * and either is held by the other (`without` excluded, as for every clause) — but only when that partner reaches the
 * floor without `i` (`groundedWithout(i)`, the top-face clause's own guard), so two parts never hold each other up off
 * the ground. A full alternative to (a)–(c), for any part,
 * leaning or not, with no coverage threshold (that belongs to the contact clauses). It is ADDED: (a), (b), (c), the
 * coverage threshold and both halves of the top-face clause run exactly as before (inv 39's PROHIBITION).
 */
function isHeld(i: number, boxes: Box[], contacts: Contact[][], without: number | null, allowTop: boolean, groundedWithout: (skip: number) => Set<number>, lean: LeanView | null, partners: readonly number[][] | null, stands: readonly boolean[] | null): boolean {
  const b = boxes[i];
  const all = without === null ? contacts[i] : contacts[i].filter((c) => c.other !== without);
  if (all.some((c) => c.axis === 1 && c.side === -1)) return true;
  // (d), above the leaning rule: a leaning part is held by a joint too. Only by a partner still grounded WITHOUT this part
  // (ruling T7g, the top-face clause's guard): a peg seated in a hanging shelf holds nothing up.
  if (partners && partners[i]!.some((o) => o !== without && groundedWithout(i).has(o))) return true;
  // Splayed legs §7.2: a leaning part is held only by resting (a); "between" and "lapped" never apply to it, and a pair
  // with a leaning part touches only by resting, so its contacts never feed (b) or (c) of an unleaned part.
  if (lean?.leaning[i]) return false;
  const cs = lean ? all.filter((c) => !c.rest) : all;
  if ([0, 2].some((axis) => coverage(b, cs, axis, -1) >= HELD_COVERAGE && coverage(b, cs, axis, 1) >= HELD_COVERAGE)) return true;
  const ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const thin = Math.min(...ext);
  return cs.some((c) => {
    if (ext[c.axis] - thin > 1e-9) return false;
    if (!(c.axis === 1 && c.side === 1)) return true;
    if (!allowTop) return false;
    const o = c.other;
    // `o` never leans here (a leaning part's contacts are rests, filtered out above), so its box is its floor test — its
    // trimmed wood when it has a built tenon (`stands`, ruling T7f).
    return (stands ? stands[o]! : boxes[o].min[1] <= TOUCH) || (groundedWithout(i).has(o) && isHeld(o, boxes, contacts, i, false, groundedWithout, lean, partners, stands));
  });
}

function hangsMessage(i: number, boxes: Box[], contacts: Contact[][], groundedWithout: (skip: number) => Set<number>, lean: LeanView | null, partners: readonly number[][] | null, stands: readonly boolean[] | null): string | null {
  if (isHeld(i, boxes, contacts, null, true, groundedWithout, lean, partners, stands)) return null;
  const b = boxes[i];
  const cs = contacts[i];
  const pairs = [0, 2].map((axis) => ({ axis, lo: coverage(b, cs, axis, -1), hi: coverage(b, cs, axis, 1) }));

  // The pair closest to passing: larger smaller-coverage; a tie keeps X.
  const best = Math.min(pairs[1].lo, pairs[1].hi) > Math.min(pairs[0].lo, pairs[0].hi) ? pairs[1] : pairs[0];
  const who = [...new Set(cs.filter((c) => c.axis === best.axis).map((c) => c.other))].sort((x, y) => x - y);
  const by = who.length ? ` (by ${who.map((k) => boxes[k].name).join(', ')})` : '';
  const pct = (v: number) => Math.floor(100 * v + 1e-9);
  return `${b.name} is not held: nothing is under it, and its ${AXES[best.axis]} sides are covered ${pct(best.lo)}% and ${pct(best.hi)}%${by}; each needs ${pct(HELD_COVERAGE)}%. Rest it on a part below, fit it between two parts that cover its sides, or fasten its broad face to another part.`;
}

const boxesOf = (doc: FlatDocument): Box[] => doc.boards.map((b) => {
  const e = boardExtents(b);
  return { name: b.name, min: [...b.position], max: b.position.map((p, i) => p + e[i]) };
});

/** One local box in world space: invariant 2's mapping, the ONE home (worldSolids and worldBodies use it). */
export function worldBox(b: Board, s: Region): Box {
  const frame = axisFrame(b);
  const spans = [0, 1, 2].map((i) => spanToWorldOffset(b, i, s[frame[i]!.dim]));
  return { name: b.name, min: spans.map(([lo], i) => b.position[i]! + lo), max: spans.map(([, hi], i) => b.position[i]! + hi) };
}

/**
 * A part's SOLIDS in world space — invariant 2's mapping, position plus the
 * local span on the dimension each axis shows, reflected on any axis the turn
 * reverses (spanToWorldOffset). NOT solidWorldBox, which is
 * centre-relative (the snapPoints.ts per-file rule in docs/module-map.md
 * warns about exactly this). Exported as the ONE home of this mapping:
 * joinery's blockers judge the same solids (fu 203).
 * Boxes: rectangular cuts only, angle cuts ignored — `drawing.ts`'s `worldBodies` adds angle
 * cuts for the drawings (spec §3.5). Overlap and joinery's blockers/trims are measured on these
 * solids; held/hangs contacts, grounding and the tip footprint read `contactSolids` when a part is
 * angled (unangled parts keep these solids for contacts, and their whole boxes for grounding and
 * the footprint). Joinery refuses any angle cut running into a joint (`generate/joints/tapers.ts`).
 */
export function worldSolids(b: Board): Box[] {
  return pocketCells(b).map((s) => worldBox(b, s));
}

/** A part carrying any angle cut: the checks read its real bodies (overlap, weight) and its flat wood (contact). */
export const isAngled = (b: Board): boolean => b.angleCuts.length > 0;

/** A part the checks read on its REAL bodies: angled (fu 302, 303), or with a BUILT round tenon (round tenons spec §5.2: a
 *  box would overstate a tenon as full-section wood and give its shoulder a flat it does not have), or with a BUILT dovetail
 *  (dovetails spec §5.3, the user's ruling: a dovetailed corner's two boxes interpenetrate, its bodies partition it). A part
 *  whose tenons or dovetails are all faulted builds none, so it checks exactly as its plain twin (ruling T7h): `isAngled`. */
export const realBodied = (b: Board): boolean => isAngled(b) || builtTenons(b).length > 0 || builtDovetails(b).length > 0;

/**
 * A part's solids AS FAR AS CONTACT CAN TRUST THEM (AI-tapers spec §3.2; AI-angles spec §2), board-local regions.
 * No angle cut: exactly `pocketCells`. Tapers first, unchanged: every pocket cell clipped, along the length, to the
 * stations no taper removes (a side face is trusted only where it is still flat — conservative for the faces beside a
 * sloped one too), plus, at each end a taper runs toward, a zero-thickness slab per cell reaching it, shrunk by each such
 * taper's amount (read through `taperFields`, so a line stored deep-end-last reads as the same taper). Then every miter,
 * bevel and chamfer splits what is left around its touched box (`splitRegion`): a sloped face is never a contact, and
 * nothing a cut removes is ever trusted. The second reader of angle cuts besides `boardBodies` (invariant 48),
 * box-valued, never over-claiming wood. A part with BUILT round tenons (round tenons spec §5.2) is trimmed to its
 * shoulders as a taper's stations are, so its contacts, its connection in the grounding walk, its floor test (`stands`)
 * and its tip footprint all read the shoulder side: a tenon's round wood and its tip are never a contact. (A leaning part
 * touches through `checkedLevelFaces`, trimmed the same way.) A part with BUILT dovetails (dovetails spec §5.3, the user's
 * ruling 2026-10-27) last: every region is trimmed on each dovetail's `dim` to the wood behind its baseline, then each
 * tail (tails part) or pin and half pin (pins part) adds the box INSCRIBED at its narrowest span on J — a tail's baseline
 * span, a pin's outside-face span — over the dovetail's whole depth and the region's thickness, intersected with every
 * region from before the trim. The angled cheeks are never contacts; a tail's flat underside meets the pin part's wood
 * behind its baseline, and the two parts' inscribed boxes only ever touch. No new kind of support (inv 39 untouched).
 */
export function contactRegions(b: Board): Region[] {
  const cells = pocketCells(b);
  if (!realBodied(b)) return cells;
  const tapers = b.angleCuts.filter((c) => c.kind === 'taper').map((c) => taperFields(c, b)).filter((t) => t.amount > 0);
  const L = b.length;
  let lo = 0;
  let hi = L;
  for (const t of tapers) {
    if (t.end === 'min') lo = Math.max(lo, t.start);
    else hi = Math.min(hi, L - t.start);
  }
  for (const t of builtTenons(b)) {
    if (t.end === 'min') lo = Math.max(lo, shoulderAt(b, t));
    else hi = Math.min(hi, shoulderAt(b, t));
  }
  let out: Region[] = [];
  for (const r of cells) {
    const l0 = Math.max(r.length[0], lo);
    const l1 = Math.min(r.length[1], hi);
    if (l0 <= l1) out.push({ ...r, length: [l0, l1] });
  }
  for (const end of ['min', 'max'] as const) {
    const here = tapers.filter((t) => t.end === end);
    if (here.length === 0) continue;
    const at = end === 'min' ? 0 : L;
    for (const r of cells) {
      if (r.length[0] > at || r.length[1] < at) continue;
      const slab: Region = { ...r, length: [at, at] };
      for (const t of here) {
        const [a, z] = slab[t.face];
        slab[t.face] = t.from === 'min' ? [Math.max(a, t.amount), z] : [a, Math.min(z, b[t.face] - t.amount)];
      }
      if (slab.width[0] < slab.width[1] && slab.thickness[0] < slab.thickness[1]) out.push(slab);
    }
  }
  for (const c of b.angleCuts) {
    if (c.kind === 'taper') continue;
    const t = touchedRegion(b, c);
    if (t) out = out.flatMap((r) => splitRegion(r, t, c));
  }
  const dovetails = builtDovetails(b);
  if (dovetails.length > 0) out = dovetailContacts(b, dovetails, out);
  return out;
}

/** `contactRegions`' dovetail step (spec §5.3): `regions` trimmed behind every baseline, plus every inscribed tail or pin box
 *  intersected with `regions` (the untrimmed list, so one end's trim never cuts the other end's boxes). Empty pieces drop. */
function dovetailContacts(b: Board, dovetails: readonly Dovetail[], regions: Region[]): Region[] {
  const meet = (r: Region, q: Partial<Region>): Region | null => {
    const out = { ...r };
    for (const k of ['length', 'width', 'thickness'] as const) {
      const span = q[k];
      if (!span) continue;
      const lo = Math.max(r[k][0], span[0]);
      const hi = Math.min(r[k][1], span[1]);
      if (!(lo < hi)) return null;
      out[k] = [lo, hi];
    }
    return out;
  };
  const behind: Partial<Region> = {};
  for (const d of dovetails) {
    const [lo, hi] = behind[d.dim] ?? [0, b[d.dim]];
    behind[d.dim] = d.end === 'min' ? [Math.max(lo, d.depth), hi] : [lo, Math.min(hi, b[d.dim] - d.depth)];
  }
  const out = regions.flatMap((r) => meet(r, behind) ?? []);
  for (const d of dovetails) {
    const J = jointLineOf(d.dim);
    const { bounds, N } = dovetailLayout(b[J], d.count, d.slope, d.pin);
    const run: [number, number] = d.end === 'min' ? [0, d.depth] : [b[d.dim] - d.depth, b[d.dim]];
    const w = d.depth / d.slope;
    // Tail k: [bounds[2k+1], bounds[2k+2]] at the end face, narrowest at the baseline. Pin k (half pins k = 0, N):
    // [bounds[2k], bounds[2k+1]], narrowest on the outside face.
    const spans: [number, number][] = d.role === 'tails'
      ? Array.from({ length: N }, (_, k) => [bounds[2 * k + 1]! + w, bounds[2 * k + 2]! - w])
      : Array.from({ length: N + 1 }, (_, k) => [bounds[2 * k]!, bounds[2 * k + 1]!]);
    for (const span of spans) {
      const box: Partial<Region> = { [d.dim]: run, [J]: span };
      for (const r of regions) {
        const m = meet(r, box);
        if (m) out.push(m);
      }
    }
    // Half-blind (half-blind spec §3.4): a pins entry with a lap also keeps its LAP SLAB, solid across all of J from the outside
    // face to the lap plane. A faulted dovetail never reaches here (builtDovetails), so the lap is inside the thickness.
    if (d.role === 'pins' && d.lap !== undefined) {
      const slab: Partial<Region> = {
        [d.dim]: run,
        thickness: d.outside === 'max' ? [b.thickness - d.lap, b.thickness] : [0, d.lap],
      };
      for (const r of regions) {
        const m = meet(r, slab);
        if (m) out.push(m);
      }
    }
  }
  return out;
}

/** `contactRegions` in world space; exactly `worldSolids` for a part with no angle cut, no built round tenon and no built
 *  dovetail. */
export function contactSolids(b: Board): Box[] {
  if (!realBodied(b)) return worldSolids(b);
  return contactRegions(b).map((s) => worldBox(b, s));
}
const solidBoxesOf = (doc: FlatDocument): Box[][] => doc.boards.map(worldSolids);

type P3 = [number, number, number];
const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** The checks' body crossing (the lean included) lives in `leanContacts.ts`, beside the level faces it feeds. */
export { worldBodyFaces };

/** The world extents of two convex bodies' intersection, or null when they do not meet in a solid (fu 302). */
function bodyOverlap(p: BodyFace[], q: BodyFace[]): number[] | null {
  let faces = p;
  for (const f of q) {
    // Inside q's face: n·(x − v0) <= 0, i.e. (−n)·x + n·v0 >= 0.
    faces = clipConvex(faces, { n: [-f.n[0], -f.n[1], -f.n[2]], d: dot3(f.n, f.verts[0]!) });
    if (faces.length < 4) return null;
  }
  const vs = faces.flatMap((f) => f.verts);
  return [0, 1, 2].map((k) => Math.max(...vs.map((v) => v[k]!)) - Math.min(...vs.map((v) => v[k]!)));
}

/**
 * A part's volume and world centre for the tip check (fu 303). Unangled and unleaned: its box, by the same arithmetic as before
 * (a notched part still weighs its box). Angled or leaning: its real (leaned) bodies, each split into tetrahedra from an interior point
 * (the mean of its vertices: a convex body contains it), volumes and centroids summed.
 */
export function partMass(b: Board): { v: number; c: P3 } {
  // A leaning part weighs its leaned bodies (splayed legs §7.1): its box is not where its wood is. A tenoned one its real
  // bodies, the tenon's round wood included (round tenons spec §5.2).
  if (!realBodied(b) && !leans(b)) {
    const e = boardExtents(b);
    return { v: e[0] * e[1] * e[2], c: [0, 1, 2].map((i) => b.position[i]! + e[i]! / 2) as P3 };
  }
  let v = 0;
  const m: P3 = [0, 0, 0];
  for (const faces of worldBodyFaces(b)) {
    const all = faces.flatMap((f) => f.verts);
    const r = [0, 1, 2].map((k) => all.reduce((s, p) => s + p[k]!, 0) / all.length) as P3;
    for (const f of faces) {
      const a = f.verts[0]!;
      for (let i = 1; i + 1 < f.verts.length; i += 1) {
        const bb = f.verts[i]!;
        const c = f.verts[i + 1]!;
        const u = [a[0] - r[0], a[1] - r[1], a[2] - r[2]];
        const w1 = [bb[0] - r[0], bb[1] - r[1], bb[2] - r[2]];
        const w2 = [c[0] - r[0], c[1] - r[1], c[2] - r[2]];
        const t = Math.abs(dot3(u, [w1[1]! * w2[2]! - w1[2]! * w2[1]!, w1[2]! * w2[0]! - w1[0]! * w2[2]!, w1[0]! * w2[1]! - w1[1]! * w2[0]!])) / 6;
        v += t;
        for (let k = 0; k < 3; k += 1) m[k] += t * (r[k]! + a[k]! + bb[k]! + c[k]!) / 4;
      }
    }
  }
  return { v, c: [m[0] / v, m[1] / v, m[2] / v] };
}

export interface FaceContact { a: number; b: number; axis: number; side: -1 | 1; area: number }

/** Every face contact once, a < b; `side` is a's touching face (-1 min, +1 max). */
export function faceContacts(doc: FlatDocument): FaceContact[] {
  return contactsOf(boxesOf(doc)).flatMap((cs, a) =>
    cs.filter((c) => c.other > a).map((c) => ({ a, b: c.other, axis: c.axis, side: c.side, area: c.area })));
}

/**
 * What the checks know of the LEANING parts (splayed legs spec §7.2). Built once per check, and only when some part leans,
 * so a lean-free document never builds it and every walk takes today's code (Global Constraints: byte for byte).
 */
interface LeanView {
  /** Per part: it leans (`leans`). */
  leaning: boolean[];
  /** Per part: on the floor. A leaning part by a level DOWN face at |y| <= TOUCH (an edge or a corner on the floor is not
   *  standing: it rocks); any other part by its box, as before (min y <= TOUCH). */
  floor: boolean[];
  /** Per part: a leaning part with no level down face at all (its foot is not cut level): the `unsupported` hint. */
  unlevelled: boolean[];
  /** The plan area by which part i RESTS on part j — a level down face of i within TOUCH in y of a level up face of j —
   *  for a pair with a leaning part; 0 when it does not. */
  rests(i: number, j: number): number;
  /** A leaning part's footprint: its level faces on the floor, as one zero-size box per polygon vertex (so the tip hull is
   *  the feet's own hull, never their bounding boxes'). */
  feet(i: number): Box[];
}

/**
 * A leaning part's level faces AS THE CHECKS TRUST THEM (ruling T7f): `levelFaces`, except that a part with built tenons
 * reads its bodies cut at every shoulder (`withoutTenon`), so a tip disc never rests, stands or makes a footprint. Local
 * to the checks: `levelFaces` itself keeps the tips, which Bore leg sockets finds legs by (`legsUnder`, `staleSocketOf`).
 * The face rule is `levelFaces`' own (unit normal within LEVEL_EPS of ±Y, height the vertices' mean); a shoulder is square
 * to a leaning axis, so it is never level.
 */
function checkedLevelFaces(b: Board): LevelFace[] {
  const ts = builtTenons(b);
  if (ts.length === 0) return levelFaces(b);
  let bodies = worldBodyFaces(b);
  for (const t of ts) bodies = withoutTenon(bodies, b, t);
  const out: LevelFace[] = [];
  for (const body of bodies) {
    for (const f of body) {
      const len = Math.hypot(f.n[0], f.n[1], f.n[2]);
      if (!(len > 0) || f.verts.length < 3) continue;
      if (Math.abs(f.n[0] / len) > LEVEL_EPS || Math.abs(f.n[2] / len) > LEVEL_EPS) continue;
      const y = f.verts.reduce((acc, v) => acc + v[1]!, 0) / f.verts.length;
      out.push({ y, up: f.n[1] > 0, poly: f.verts.map((v) => [v[0]!, v[2]!]) });
    }
  }
  return out;
}

/**
 * The view, for `boxes` (a leaning part's its real bounds) and `touching` (an unleaned part's contact solids). An unleaned
 * part's level faces are its contact solids' top and bottom (flat wood only, inv 38); a leaning part's are `levelFaces`.
 */
function leanView(doc: FlatDocument, boxes: Box[], touching: Box[][], leaning: boolean[], stands: readonly boolean[] | null): LeanView {
  const n = boxes.length;
  const faces: (LevelFace[] | undefined)[] = [];
  const facesOf = (k: number): LevelFace[] => {
    let f = faces[k];
    if (!f) {
      f = leaning[k] ? checkedLevelFaces(doc.boards[k]!) : touching[k].flatMap((s): LevelFace[] => {
        const poly: [number, number][] = [[s.min[0], s.min[2]], [s.max[0], s.min[2]], [s.max[0], s.max[2]], [s.min[0], s.max[2]]];
        return [{ y: s.min[1], up: false, poly }, { y: s.max[1], up: true, poly }];
      });
      faces[k] = f;
    }
    return f;
  };
  const onFloor = (f: LevelFace) => !f.up && Math.abs(f.y) <= TOUCH;
  const memo = new Map<number, number>();
  const rests = (i: number, j: number): number => {
    const key = i * n + j;
    let a = memo.get(key);
    if (a === undefined) {
      a = 0;
      // Real bounds that do not come within TOUCH cannot hold faces that do.
      if ([0, 1, 2].every((k) => shared(boxes[i], boxes[j], k) >= -TOUCH)) {
        const ups = facesOf(j).filter((f) => f.up);
        for (const d of facesOf(i)) {
          if (d.up) continue;
          for (const u of ups) {
            if (Math.abs(d.y - u.y) > TOUCH) continue;
            const s = overlapArea(d.poly, u.poly);
            if (s > REST_AREA) a += s;
          }
        }
      }
      memo.set(key, a);
    }
    return a;
  };
  return {
    leaning,
    floor: boxes.map((b, k) => (leaning[k] ? facesOf(k).some(onFloor) : stands ? stands[k]! : b.min[1] <= TOUCH)),
    unlevelled: leaning.map((l, k) => l && !facesOf(k).some((f) => !f.up)),
    rests,
    // One zero-size box per foot VERTEX, so the hull of the boxes' corners is exactly the hull of the feet (final review
    // I1): a levelled foot is a parallelogram skewed along the sightline, and its bounding box reaches out where no wood is.
    feet: (k) => facesOf(k).filter(onFloor).flatMap((f) => f.poly.map(([x, z]): Box => ({ name: boxes[k].name, min: [x, f.y, z], max: [x, f.y, z] }))),
  };
}

/** RESTING contacts (splayed legs §7.2) for every pair with a leaning part, added to `contacts`: i's bottom on j's top. */
function addRests(contacts: Contact[][], lean: LeanView): void {
  const n = contacts.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j || !(lean.leaning[i] || lean.leaning[j])) continue;
      const area = lean.rests(i, j);
      if (area <= 0) continue;
      contacts[i].push({ other: j, axis: 1, side: -1, area, rest: true });
      contacts[j].push({ other: i, axis: 1, side: 1, area, rest: true });
    }
  }
}

/** `display`: the units the person reads (default the document's; Refine passes the original project's). */
export function checkDesign(doc: FlatDocument, limits: DesignLimits, display: Units = doc.units): Violation[] {
  // Splayed legs §7: which parts lean, once per part. None: `lean` stays null and every check below is today's code.
  const leaning = doc.boards.map(leans);
  const anyLean = leaning.some(Boolean);
  // A leaning part's box is its real bounds (§7.3, R2): too-small, too-large and the distances read its real extent.
  const boxes = anyLean
    ? boxesOf(doc).map((b, k) => (leaning[k] ? { name: b.name, ...partBounds(doc.boards[k]!) } as Box : b))
    : boxesOf(doc);
  const leanAt = (k: number) => anyLean && leaning[k]!;
  // Round tenons §5.2: ONE scan. None: `joints` stays empty, `partners` and `joint` null, and every check below is as before.
  const anyTenon = doc.boards.some((b) => builtTenons(b).length > 0);
  const joints: TenonJoint[] = anyTenon ? tenonJoints(doc) : [];
  const partners: number[][] | null = anyTenon ? doc.boards.map(() => []) : null;
  for (const j of joints) { partners![j.a]!.push(j.b); partners![j.b]!.push(j.a); }
  const joint = partners ? (i: number, j: number) => partners[i]!.includes(j) : null;
  const out: Violation[] = [];

  for (const b of boxes) {
    const i = [0, 1, 2].find((k) => b.max[k] - b.min[k] < MIN_SIDE - 1e-9);
    if (i !== undefined) {
      out.push({ kind: 'too-small', ...worded(display, (len) => `${b.name} is ${len(b.max[i] - b.min[i])} along ${AXES[i]}; the minimum is ${len(MIN_SIDE)}.`), parts: [b.name] });
    }
  }

  // Invariant 38, rewritten for phase 2: overlap is measured between SOLIDS,
  // the stock left after cuts, so a tenon in its mortise is not overlap and a
  // tenon with no mortise is. A design with no cuts has one solid per part,
  // equal to its box — Generate's behaviour is unchanged by construction.
  const solids = solidBoxesOf(doc);
  // World bodies, built once per part and only for a part in a tapered pair whose boxes overlap (fu 302).
  const bodyCache = new Map<number, BodyFace[][]>();
  const bodiesOf = (k: number) => {
    let w = bodyCache.get(k);
    if (!w) { w = worldBodyFaces(doc.boards[k]!); bodyCache.set(k, w); }
    return w;
  };
  // A joint's tenon is not measured against its socket's part (§5.2): `k`'s bodies against `other`, its seated tenons cut
  // away at their shoulders. Every other pair, and this pair's other bodies (the shoulder), as before.
  const pairBodies = (k: number, other: number): BodyFace[][] => {
    let w = bodiesOf(k);
    for (const jn of joints) {
      if (jn.a !== k || jn.b !== other) continue;
      w = withoutTenon(w, doc.boards[k]!, builtTenons(doc.boards[k]!).find((t) => t.id === jn.tenon)!);
    }
    return w;
  };
  // The hint (§5.2): part `x` has a tenon, not seated in `y`, running where one of `y`'s single bores is.
  const mismatch = (x: number, y: number) => builtTenons(doc.boards[x]!).some((t) =>
    !joints.some((jn) => jn.a === x && jn.b === y && jn.tenon === t.id) && tenonMeetsBore(doc.boards[x]!, t, doc.boards[y]!));
  const overlapping = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      let worst: number[] | null = null;
      // A pair with an angled part is measured on real solids (fu 302): a box would claim wood an angle cut removed. Only
      // when the boxes overlap at all: a body lies inside its cell, so the bodies cannot overlap where the boxes do not.
      const meet = (ps: Box[], qs: Box[]) => ps.some((p) => qs.some((q) => [0, 1, 2].every((k) => shared(p, q, k) > TOUCH)));
      // A pair with a leaning part is measured on its LEANED bodies only (§7.1), even with no angle cut: its solids are its
      // pre-lean boxes, so it is gated on its real bounds, which hold its bodies, and never falls back to boxes.
      const leanPair = leanAt(i) || leanAt(j);
      const real = leanPair
        ? meet(leanAt(i) ? [boxes[i]] : solids[i], leanAt(j) ? [boxes[j]] : solids[j])
        : (realBodied(doc.boards[i]!) || realBodied(doc.boards[j]!)) && meet(solids[i], solids[j]);
      // Each side's bodies once per pair (final review M3: `pairBodies` re-clips a seated tenon's part per call).
      const sideBodies = (k: number, other: number) => (anyTenon ? pairBodies(k, other) : bodiesOf(k));
      const pairs: [Box | BodyFace[], Box | BodyFace[]][] = real
        ? (() => {
          const pi = sideBodies(i, j);
          const pj = sideBodies(j, i);
          return pi.flatMap((p) => pj.map((q) => [p, q] as [BodyFace[], BodyFace[]]));
        })()
        : leanPair ? [] : solids[i].flatMap((p) => solids[j].map((q) => [p, q] as [Box, Box]));
      for (const [p, q] of pairs) {
        const s = Array.isArray(p) ? bodyOverlap(p, q as BodyFace[]) : [0, 1, 2].map((k) => shared(p, q as Box, k));
        if (s && s.every((v) => v > TOUCH) && (!worst || Math.min(...s) > Math.min(...worst))) worst = s;
      }
      if (worst) {
        overlapping.add(i);
        overlapping.add(j);
        const axis = worst.indexOf(Math.min(...worst));
        const by = worst[axis]!;
        // A tenon that misses its socket names the cure (§5.2), its part named first so "its" reads right.
        const [p, q, hint] = !anyTenon ? [i, j, ''] : mismatch(i, j) ? [i, j, TENON_HINT] : mismatch(j, i) ? [j, i, TENON_HINT] : [i, j, ''];
        out.push({ kind: 'overlap', ...worded(display, (len) => `${boxes[p].name} passes ${len(by)} into ${boxes[q].name} along ${AXES[axis]}${hint}.`), parts: [boxes[p].name, boxes[q].name] });
      }
    }
  }

  // Contact trusts only flat wood (AI-tapers spec §3.3; a tenon's round wood, round tenons §5.2); overlap above stays on the
  // full solids.
  const tapered = doc.boards.map(realBodied);
  // A leaning part touches through its level faces only (§7.2), never its pre-lean solids.
  const touching = doc.boards.map((b, i) => (leanAt(i) ? [] : tapered[i] ? contactSolids(b) : solids[i]));
  // Ruling T7f: an unleaned part with a built tenon stands on its TRIMMED wood (`touching`, cut at the shoulders), never on a
  // tip, so grounding agrees with the footprint. No tenon: null, and every floor test is the box's, as before.
  const stands = anyTenon ? boxes.map((b, k) => (builtTenons(doc.boards[k]!).length > 0 ? touching[k]!.some((s) => s.min[1] <= TOUCH) : b.min[1] <= TOUCH)) : null;
  const lean = anyLean ? leanView(doc, boxes, touching, leaning, stands) : null;
  const grounded = groundedSet(boxes, touching, tapered, null, lean, joint, stands);
  boxes.forEach((b, i) => {
    if (grounded.has(i)) return;
    const near = [...grounded].map((g) => boxes[g]).sort((p, q) => distance(b, p) - distance(b, q))[0];
    const hint = (len: Len) => (near ? `; the nearest supported part is ${near.name}, ${len(distance(b, near))} away` : '');
    // An unlevelled leg stands on an edge or a corner, so it rocks: name the action that cuts its foot flat (§7.2).
    const levelHint = lean?.unlevelled[i] ? '; it leans, and its foot is not level: Level the ends' : '';
    out.push({ kind: 'unsupported', ...worded(display, (len) => `${b.name} is not connected to the floor through touching parts${hint(len)}${levelHint}.`), parts: [b.name] });
  });

  if (boxes.length > 0) {
    const size = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k])));
    const checks: [string, number | null, number][] = [
      ['width', limits.width, size[0]],
      ['depth', limits.depth, size[2]],
      ['height', limits.height, size[1]],
    ];
    for (const [label, limit, actual] of checks) {
      if (limit !== null && actual > limit + 1e-9) {
        // Inches for the person too: the limit was typed in inches (Generate's and Refine's limit fields; spec §7), and the
        // fault reads in the unit typed (the user's ruling, fu 355).
        out.push({ kind: 'too-large', message: `Overall ${label} ${inches(actual)} exceeds the ${inches(limit)} limit.`, parts: [] });
      }
    }
  }

  if (boxes.length > limits.maxParts) {
    out.push({ kind: 'too-many-parts', message: `${boxes.length} parts; the limit is ${limits.maxParts}.`, parts: [] });
  }

  // Held (fu 165). One fault, one report: a part on the floor, already
  // unsupported, or named in an overlap is never also reported as hanging.
  const contacts = solidContactsOf(touching);
  if (lean) addRests(contacts, lean);
  const onFloor = (i: number) => (lean ? lean.floor[i]! : stands ? stands[i]! : boxes[i].min[1] <= TOUCH);
  const memo = new Map<number, Set<number>>();
  const groundedWithout = (skip: number) => {
    if (!memo.has(skip)) memo.set(skip, groundedSet(boxes, touching, tapered, skip, lean, joint, stands));
    return memo.get(skip)!;
  };
  boxes.forEach((_, i) => {
    if (onFloor(i) || !grounded.has(i) || overlapping.has(i)) return;
    const message = hangsMessage(i, boxes, contacts, groundedWithout, lean, partners, stands);
    if (message) out.push({ kind: 'hangs', message, parts: [boxes[i].name] });
  });

  // A leaning part stands on its level feet and weighs its leaned bodies (§7.1, §7.2).
  const tip = tipsMessage(boxes, grounded, onFloor,
    (i) => (lean?.leaning[i] ? lean.feet(i) : tapered[i] ? touching[i].filter((s) => s.min[1] <= TOUCH) : [boxes[i]]),
    (i) => (tapered[i] || leanAt(i) ? partMass(doc.boards[i]!) : null));
  if (tip) out.push({ kind: 'tips', ...worded(display, tip), parts: [] });
  return out;
}

/** Parts (and assemblies) the converter could not build, reported in the same voice. */
export function rejectedViolations(rejected: RejectedPart[]): Violation[] {
  const say: Record<RejectedPart['reason'], (n: string) => string> = {
    'not-finite': (n) => `${n} has a position or size that is not a finite number or is beyond 10,000in.`,
    'too-small': (n) => `${n} has a size of zero or less after rounding to 1/16in.`,
    unplaced: (n) => `${n} is an assembly with no usable placement, so none of its parts were built.`,
    empty: (n) => `${n} is an assembly with no usable parts.`,
    taper: (n) => `${n} has a taper that cannot be built.`,
    angle: (n) => `${n} has a miter, bevel or chamfer that cannot be built.`,
    hole: (n) => `${n} has a hole row that cannot be built.`,
    band: (n) => `${n} has edging that cannot be built.`,
    profile: (n) => `${n} has an edge profile that cannot be built.`,
  };
  return rejected.map((r) => ({ kind: 'too-small' as const, message: r.detail ?? say[r.reason](r.name), parts: [r.name] }));
}

/**
 * The angle-at-joint rule as a DESIGN fault (AI-tapers spec §5.3; AI-angles spec §5.4), for the model: world words,
 * plain decimal inches, one per part — a taper conflict's wording (unchanged) when the part has one, else its angle
 * conflict's. The taper advice is a LIMIT floored to SNAP_INCHES: the converter snaps `start` to 1/16, so advice off
 * that grid would snap past the meeting and conflict again. Multiples of 1/16 print exactly. Not part of checkDesign
 * (joinery's gate); evaluateDesign adds it.
 */
export function jointViolations(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[], display: Units = flat.units): Violation[] {
  const out: Violation[] = tapers.map(({ part, other, end, nearest }) => {
    const b = flat.boards[part]!;
    const o = flat.boards[other]!;
    const dir = localToDir(b, 'length', end);
    const limit = Math.floor(nearest / SNAP_INCHES + 1e-9) * SNAP_INCHES;
    const advice = (at: string) => `${b.name}'s taper toward ${dir} runs into where it meets ${o.name} (a joint goes there) \u2014 start it ${at} or less from its ${dir} end, or remove it.`;
    if (limit === 0) {
      const message = `${b.name}'s taper toward ${dir} runs to its ${dir} end, where it meets ${o.name} (a joint goes there) \u2014 taper the other end, or remove the taper.`;
      return { kind: 'angle-joint' as const, message, parts: [b.name, o.name] };
    }
    // The person's limit is floored to THEIR grid (whole mm), as the taper refusal's is (angledRefusal): a limit rounded
    // up would conflict again. limit > 0 means nearest ≥ 1/16in, so the floored mm is at least 1.
    const shown = isMetric(display) ? { shown: advice(formatLength(floorToTick(nearest, display), display)) } : {};
    return { kind: 'angle-joint' as const, message: advice(`${limit}in`), ...shown, parts: [b.name, o.name] };
  });
  const tapered = new Set(tapers.map((c) => c.part));
  for (const { part, other, kind } of angles) {
    if (tapered.has(part)) continue;
    const b = flat.boards[part]!;
    const o = flat.boards[other]!;
    out.push({ kind: 'angle-joint', parts: [b.name, o.name],
      message: `${b.name}'s ${kind} runs into where it meets ${o.name} (a joint goes there) \u2014 move it off that end or face, or remove it.` });
  }
  return out;
}
