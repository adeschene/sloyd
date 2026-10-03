import type { SloydDocument } from './document';
import type { RejectedPart } from './generated';
import { boardExtents } from './geometry';

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
 *
 * PHASE 2 NOTE (spec §4.4): `overlap` must become "interpenetration not
 * accounted for by a cut" when joinery is generated. Relax it on purpose.
 */
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts' | 'hangs' | 'tips';
export interface Violation { kind: ViolationKind; message: string }
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
 * pair covered >= HELD_COVERAGE, or (c) any contact on a broad face (normal to
 * its smallest extent; ties all count). (c) is what lets a backrest or an
 * apron screwed to a post's face pass — without it, ordinary face-mounted
 * parts fail and cost repair rounds for nothing. Coverage, not two-sidedness,
 * is what catches the workbench shelf: it touched legs on BOTH ends, 19% each.
 */
function hangsMessage(b: Box, cs: Contact[], boxes: Box[]): string | null {
  if (cs.some((c) => c.axis === 1 && c.side === -1)) return null;
  const pairs = [0, 2].map((axis) => ({ axis, lo: coverage(b, cs, axis, -1), hi: coverage(b, cs, axis, 1) }));
  if (pairs.some((p) => p.lo >= HELD_COVERAGE && p.hi >= HELD_COVERAGE)) return null;
  const ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const thin = Math.min(...ext);
  if (cs.some((c) => ext[c.axis] - thin <= 1e-9)) return null;

  // The pair closest to passing: larger smaller-coverage; a tie keeps X.
  const best = Math.min(pairs[1].lo, pairs[1].hi) > Math.min(pairs[0].lo, pairs[0].hi) ? pairs[1] : pairs[0];
  const who = [...new Set(cs.filter((c) => c.axis === best.axis).map((c) => c.other))].sort((x, y) => x - y);
  const by = who.length ? ` (by ${who.map((k) => boxes[k].name).join(', ')})` : '';
  const pct = (v: number) => Math.round(100 * v);
  return `${b.name} is not held: nothing is under it, and its ${AXES[best.axis]} sides are covered ${pct(best.lo)}% and ${pct(best.hi)}%${by}; each needs ${pct(HELD_COVERAGE)}%. Rest it on a part below, fit it between two parts that cover its sides, or fasten its broad face to another part.`;
}

export function checkDesign(doc: SloydDocument, limits: DesignLimits): Violation[] {
  const boxes: Box[] = doc.boards.map((b) => {
    const e = boardExtents(b);
    return { name: b.name, min: [...b.position], max: b.position.map((p, i) => p + e[i]) };
  });
  const out: Violation[] = [];

  for (const b of boxes) {
    const i = [0, 1, 2].find((k) => b.max[k] - b.min[k] < MIN_SIDE - 1e-9);
    if (i !== undefined) {
      out.push({ kind: 'too-small', message: `${b.name} is ${inches(b.max[i] - b.min[i])} along ${AXES[i]}; the minimum is ${inches(MIN_SIDE)}.` });
    }
  }

  const overlapping = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      const s = [0, 1, 2].map((k) => shared(boxes[i], boxes[j], k));
      if (s.every((v) => v > TOUCH)) {
        overlapping.add(i);
        overlapping.add(j);
        const axis = s.indexOf(Math.min(...s));
        out.push({ kind: 'overlap', message: `${boxes[i].name} passes ${inches(s[axis])} into ${boxes[j].name} along ${AXES[axis]}.` });
      }
    }
  }

  const grounded = new Set<number>();
  const queue = boxes.flatMap((b, i) => (b.min[1] <= TOUCH ? [i] : []));
  queue.forEach((i) => grounded.add(i));
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((b, j) => {
      if (!grounded.has(j) && connected(boxes[i], b)) {
        grounded.add(j);
        queue.push(j);
      }
    });
  }
  boxes.forEach((b, i) => {
    if (grounded.has(i)) return;
    const near = [...grounded].map((g) => boxes[g]).sort((p, q) => distance(b, p) - distance(b, q))[0];
    const hint = near ? `; the nearest supported part is ${near.name}, ${inches(distance(b, near))} away` : '';
    out.push({ kind: 'unsupported', message: `${b.name} is not connected to the floor through touching parts${hint}.` });
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
        out.push({ kind: 'too-large', message: `Overall ${label} ${inches(actual)} exceeds the ${inches(limit)} limit.` });
      }
    }
  }

  if (boxes.length > limits.maxParts) {
    out.push({ kind: 'too-many-parts', message: `${boxes.length} parts; the limit is ${limits.maxParts}.` });
  }

  // Held (fu 165). One fault, one report: a part on the floor, already
  // unsupported, or named in an overlap is never also reported as hanging.
  const contacts = contactsOf(boxes);
  boxes.forEach((b, i) => {
    if (b.min[1] <= TOUCH || !grounded.has(i) || overlapping.has(i)) return;
    const message = hangsMessage(b, contacts[i], boxes);
    if (message) out.push({ kind: 'hangs', message });
  });
  return out;
}

/** Parts the converter could not turn into boards, reported in the same voice. */
export function rejectedViolations(rejected: RejectedPart[]): Violation[] {
  return rejected.map((r) => ({
    kind: 'too-small' as const,
    message: r.reason === 'not-finite'
      ? `${r.name} has a position or size that is not a finite number.`
      : `${r.name} has a size of zero or less after rounding to 1/16in.`,
  }));
}
