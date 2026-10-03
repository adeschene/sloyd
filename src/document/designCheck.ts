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
 * PHASE 2 NOTE (spec §4.4): `overlap` must become "interpenetration not
 * accounted for by a cut" when joinery is generated. Relax it on purpose.
 */
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts';
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

  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      const s = [0, 1, 2].map((k) => shared(boxes[i], boxes[j], k));
      if (s.every((v) => v > TOUCH)) {
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
