import type { SloydDocument } from './document';
import type { RejectedPart } from './generated';
import { boardSolids } from './cuts';
import { axisDimensions, boardExtents } from './geometry';

/**
 * The checks a generated design is held to (spec §4.3). Pure, against the
 * rounded and migrated boards — the exact values that will be stored.
 *
 * Messages are written FOR THE MODEL, in decimal inches, naming parts by
 * their STORED (post-dedupe) names and the axis involved, so they are
 * actionable. Not a person-facing string, which is why this module does not
 * take the → units edge (CLAUDE.md, Architecture).
 *
 * `hangs` (fu 165): every part off the floor must be held: resting, between, or lapped (inv 39).
 * `tips` (fu 165): the grounded parts' volume-weighted centre of mass sits at least min(1in, s/4) inside the floor footprint's hull.
 *
 * Overlap is measured between SOLIDS (invariant 38): a cut explains an overlap by
 * removing the stock. Do not raise TOUCH to make joints pass.
 */
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts' | 'hangs' | 'tips';
export interface Violation { kind: ViolationKind; message: string; parts: string[] }
export interface DesignLimits { width: number | null; depth: number | null; height: number | null; maxParts: number }

export const TOUCH = 1 / 32;
export const MIN_SIDE = 1 / 8;

const AXES = ['X', 'Y', 'Z'] as const;
const inches = (v: number) => `${+v.toFixed(3)}in`;

interface Box { name: string; min: number[]; max: number[] }

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
function tipsMessage(boxes: Box[], grounded: Set<number>): string | null {
  const floor = boxes.filter((b) => b.min[1] <= TOUCH);
  if (floor.length === 0) return null;
  let vol = 0, cx = 0, cz = 0;
  for (const i of grounded) {
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
    return 'The piece would tip: its centre of mass is not over a usable footprint. Widen the base or move weight inward.';
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
  return `The piece would tip toward ${dir}: its centre of mass is ${inches(Math.abs(d))} ${d >= 0 ? 'inside' : 'beyond'} the edge of what touches the floor; keep it at least ${inches(m)} inside. Widen the base or move weight inward.`;
}

/** The parts connected to the floor through touching parts, optionally with one part removed from the design. */
function groundedSet(boxes: Box[], skip: number | null = null): Set<number> {
  const grounded = new Set<number>();
  const queue = boxes.flatMap((b, i) => (i !== skip && b.min[1] <= TOUCH ? [i] : []));
  queue.forEach((i) => grounded.add(i));
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((b, j) => {
      if (j !== skip && !grounded.has(j) && connected(boxes[i], b)) {
        grounded.add(j);
        queue.push(j);
      }
    });
  }
  return grounded;
}

/** One face contact ON a box: which face (axis, side), who touches it, over what area. */
interface Contact { other: number; axis: number; side: -1 | 1; area: number }

/**
 * Face contacts per box: face planes coincide within TOUCH on one axis, and
 * the shared span is > TOUCH on BOTH others. Disjoint from overlap BY
 * DEFINITION — coincident planes mean a shared span <= TOUCH on that axis —
 * so an interpenetrating pair is never a contact here.
 */
function contactsOf(boxes: Box[]): Contact[][] {
  const out: Contact[][] = boxes.map(() => []);
  boxes.forEach((a, i) => {
    boxes.forEach((b, j) => {
      if (i === j) return;
      for (const axis of [0, 1, 2]) {
        const [p, q] = [0, 1, 2].filter((k) => k !== axis);
        const sp = shared(a, b, p);
        const sq = shared(a, b, q);
        if (sp <= TOUCH || sq <= TOUCH) continue;
        if (Math.abs(a.min[axis] - b.max[axis]) <= TOUCH) out[i].push({ other: j, axis, side: -1, area: sp * sq });
        else if (Math.abs(a.max[axis] - b.min[axis]) <= TOUCH) out[i].push({ other: j, axis, side: 1, area: sp * sq });
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
 */
function isHeld(i: number, boxes: Box[], contacts: Contact[][], without: number | null, allowTop: boolean, groundedWithout: (skip: number) => Set<number>): boolean {
  const b = boxes[i];
  const cs = without === null ? contacts[i] : contacts[i].filter((c) => c.other !== without);
  if (cs.some((c) => c.axis === 1 && c.side === -1)) return true;
  if ([0, 2].some((axis) => coverage(b, cs, axis, -1) >= HELD_COVERAGE && coverage(b, cs, axis, 1) >= HELD_COVERAGE)) return true;
  const ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const thin = Math.min(...ext);
  return cs.some((c) => {
    if (ext[c.axis] - thin > 1e-9) return false;
    if (!(c.axis === 1 && c.side === 1)) return true;
    if (!allowTop) return false;
    const o = c.other;
    return boxes[o].min[1] <= TOUCH || (groundedWithout(i).has(o) && isHeld(o, boxes, contacts, i, false, groundedWithout));
  });
}

function hangsMessage(i: number, boxes: Box[], contacts: Contact[][], groundedWithout: (skip: number) => Set<number>): string | null {
  if (isHeld(i, boxes, contacts, null, true, groundedWithout)) return null;
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

const boxesOf = (doc: SloydDocument): Box[] => doc.boards.map((b) => {
  const e = boardExtents(b);
  return { name: b.name, min: [...b.position], max: b.position.map((p, i) => p + e[i]) };
});

/**
 * A part's SOLIDS in world space — invariant 2's mapping, position plus the
 * local span on the dimension each axis shows. NOT solidWorldBox, which is
 * centre-relative (CLAUDE.md warns about exactly this).
 */
const solidBoxesOf = (doc: SloydDocument): Box[][] => doc.boards.map((b) => {
  const dims = axisDimensions(b);
  return boardSolids(b).map((s) => ({
    name: b.name,
    min: [0, 1, 2].map((i) => b.position[i] + s[dims[i]][0]),
    max: [0, 1, 2].map((i) => b.position[i] + s[dims[i]][1]),
  }));
});

export interface FaceContact { a: number; b: number; axis: number; side: -1 | 1; area: number }

/** Every face contact once, a < b; `side` is a's touching face (-1 min, +1 max). */
export function faceContacts(doc: SloydDocument): FaceContact[] {
  return contactsOf(boxesOf(doc)).flatMap((cs, a) =>
    cs.filter((c) => c.other > a).map((c) => ({ a, b: c.other, axis: c.axis, side: c.side, area: c.area })));
}

export function checkDesign(doc: SloydDocument, limits: DesignLimits): Violation[] {
  const boxes = boxesOf(doc);
  const out: Violation[] = [];

  for (const b of boxes) {
    const i = [0, 1, 2].find((k) => b.max[k] - b.min[k] < MIN_SIDE - 1e-9);
    if (i !== undefined) {
      out.push({ kind: 'too-small', message: `${b.name} is ${inches(b.max[i] - b.min[i])} along ${AXES[i]}; the minimum is ${inches(MIN_SIDE)}.`, parts: [b.name] });
    }
  }

  // Invariant 38, rewritten for phase 2: overlap is measured between SOLIDS,
  // the stock left after cuts, so a tenon in its mortise is not overlap and a
  // tenon with no mortise is. A design with no cuts has one solid per part,
  // equal to its box — Generate's behaviour is unchanged by construction.
  const solids = solidBoxesOf(doc);
  const overlapping = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      let worst: number[] | null = null;
      for (const p of solids[i]) {
        for (const q of solids[j]) {
          const s = [0, 1, 2].map((k) => shared(p, q, k));
          if (s.every((v) => v > TOUCH) && (!worst || Math.min(...s) > Math.min(...worst))) worst = s;
        }
      }
      if (worst) {
        overlapping.add(i);
        overlapping.add(j);
        const axis = worst.indexOf(Math.min(...worst));
        out.push({ kind: 'overlap', message: `${boxes[i].name} passes ${inches(worst[axis])} into ${boxes[j].name} along ${AXES[axis]}.`, parts: [boxes[i].name, boxes[j].name] });
      }
    }
  }

  const grounded = groundedSet(boxes);
  boxes.forEach((b, i) => {
    if (grounded.has(i)) return;
    const near = [...grounded].map((g) => boxes[g]).sort((p, q) => distance(b, p) - distance(b, q))[0];
    const hint = near ? `; the nearest supported part is ${near.name}, ${inches(distance(b, near))} away` : '';
    out.push({ kind: 'unsupported', message: `${b.name} is not connected to the floor through touching parts${hint}.`, parts: [b.name] });
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
        out.push({ kind: 'too-large', message: `Overall ${label} ${inches(actual)} exceeds the ${inches(limit)} limit.`, parts: [] });
      }
    }
  }

  if (boxes.length > limits.maxParts) {
    out.push({ kind: 'too-many-parts', message: `${boxes.length} parts; the limit is ${limits.maxParts}.`, parts: [] });
  }

  // Held (fu 165). One fault, one report: a part on the floor, already
  // unsupported, or named in an overlap is never also reported as hanging.
  const contacts = contactsOf(boxes);
  const memo = new Map<number, Set<number>>();
  const groundedWithout = (skip: number) => {
    if (!memo.has(skip)) memo.set(skip, groundedSet(boxes, skip));
    return memo.get(skip)!;
  };
  boxes.forEach((b, i) => {
    if (b.min[1] <= TOUCH || !grounded.has(i) || overlapping.has(i)) return;
    const message = hangsMessage(i, boxes, contacts, groundedWithout);
    if (message) out.push({ kind: 'hangs', message, parts: [boxes[i].name] });
  });

  const tip = tipsMessage(boxes, grounded);
  if (tip) out.push({ kind: 'tips', message: tip, parts: [] });
  return out;
}

/** Parts the converter could not turn into boards, reported in the same voice. */
export function rejectedViolations(rejected: RejectedPart[]): Violation[] {
  return rejected.map((r) => ({
    kind: 'too-small' as const,
    message: r.reason === 'not-finite'
      ? `${r.name} has a position or size that is not a finite number.`
      : `${r.name} has a size of zero or less after rounding to 1/16in.`,
    parts: [r.name],
  }));
}
