import { CURRENT_VERSION, migrateDocument } from '../../document/document';
import type { Board, SloydDocument } from '../../document/document';
import { TOUCH } from '../../document/designCheck';
import { SNAP_INCHES, axisDimensions } from '../../document/geometry';
import { boxOf, pocketFor } from './pocket';
import type { V3, WorldBox } from './pocket';
import type { JointKind, Site, StopEnd } from './sites';

export interface JointChoice { site: number; joint: JointKind; tenonLength?: number; depth?: number; stopAt?: StopEnd; inset?: number }
export interface JoinResult {
  doc: SloydDocument;
  applied: { site: number; joint: JointKind }[];
  skipped: { site: number; reason: string }[];
  moved: string[];
  trimmed: string[];
  sizeBefore: V3;
  sizeAfter: V3;
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

export const tenonSection = (thickness: number, width: number) => {
  const tenon = Math.max(0.25, snap(thickness / 3));
  return { tenon, cheek: (thickness - tenon) / 2, shoulder: Math.min(0.5, snap(width / 4)) };
};

/** `base` with some axes' spans replaced. */
const withSpans = (base: WorldBox, spans: Partial<Record<number, [number, number]>>): WorldBox => {
  const min = [...base.min] as V3;
  const max = [...base.max] as V3;
  for (const [k, s] of Object.entries(spans)) { min[+k] = s![0]; max[+k] = s![1]; }
  return { min, max };
};
const positive = (b: WorldBox) => [0, 1, 2].every((k) => b.max[k] - b.min[k] > 1e-9);
const span = (b: WorldBox, k: number): [number, number] => [b.min[k], b.max[k]];

/** Grow (or, negative, shrink) a part along world axis k on its `side` face. */
function resize(b: Board, k: number, side: -1 | 1, amount: number) {
  const d = axisDimensions(b)[k];
  b[d] = b[d] + amount;
  if (side === -1) b.position[k] -= amount;
}

/** The slab E grows into, on its `side` face along k, `amount` deep. */
const extension = (before: WorldBox, k: number, side: -1 | 1, amount: number): [number, number] =>
  side === 1 ? [before.max[k], before.max[k] + amount] : [before.min[k] - amount, before.min[k]];

/** Face contact on k between E's `side` face and R, within TOUCH, with real shared span. */
function touching(E: Board, R: Board, k: number, side: -1 | 1): boolean {
  const e = boxOf(E);
  const r = boxOf(R);
  const plane = side === 1 ? e.max[k] : e.min[k];
  const opposite = side === 1 ? r.min[k] : r.max[k];
  return Math.abs(plane - opposite) <= TOUCH &&
    [0, 1, 2].filter((i) => i !== k).every((i) => Math.min(e.max[i], r.max[i]) - Math.max(e.min[i], r.min[i]) > TOUCH);
}

function mortiseTenon(E: Board, R: Board, k: number, side: -1 | 1, L: number) {
  const before = boxOf(E);
  resize(E, k, side, L);
  const ext = extension(before, k, side, L);
  const dims = axisDimensions(E);
  const tAx = dims.indexOf('thickness');
  const wAx = dims.indexOf('width');
  const { cheek: c, shoulder: sh } = tenonSection(E.thickness, E.width);
  const [t0, t1] = span(before, tAx);
  const [w0, w1] = span(before, wAx);
  const box = (t: [number, number], w: [number, number]) => withSpans(before, { [k]: ext, [tAx]: t, [wAx]: w });
  for (const waste of [box([t0, t0 + c], [w0, w1]), box([t1 - c, t1], [w0, w1]), box([t0, t1], [w0, w0 + sh]), box([t0, t1], [w1 - sh, w1])]) {
    if (positive(waste)) E.cuts.push(pocketFor(E, waste));
  }
  R.cuts.push(pocketFor(R, box([t0 + c, t1 - c], [w0 + sh, w1 - sh])));
}

function dado(E: Board, R: Board, k: number, side: -1 | 1, d: number, stop?: { at: StopEnd; inset: number }) {
  const before = boxOf(E);
  resize(E, k, side, d);
  const ext = extension(before, k, side, d);
  let pocket = withSpans(before, { [k]: ext });
  if (stop) {
    const p = stop.at.axis;
    const [lo, hi] = span(before, p);
    const keep: [number, number] = stop.at.end === 'min' ? [lo + stop.inset, hi] : [lo, hi - stop.inset];
    const strip: [number, number] = stop.at.end === 'min' ? [lo, lo + stop.inset] : [hi - stop.inset, hi];
    pocket = withSpans(pocket, { [p]: keep });
    E.cuts.push(pocketFor(E, withSpans(before, { [k]: ext, [p]: strip })));
  }
  R.cuts.push(pocketFor(R, pocket));
}

const overall = (boards: Board[]): V3 => {
  const boxes = boards.map(boxOf);
  return [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k]))) as V3;
};

/**
 * Build the chosen joints (spec §4). Pure. Recipes run in site order on a
 * COPY of the boards, and each reads the CURRENT geometry, so a site whose
 * part an earlier site already moved is recomputed rather than reused —
 * and skipped, with a reason, when its parts no longer touch.
 */
export function applyJoints(doc: SloydDocument, sites: Site[], choices: JointChoice[]): JoinResult {
  const boards: Board[] = structuredClone(doc.boards);
  const byId = new Map(choices.map((c) => [c.site, c]));
  const applied: JoinResult['applied'] = [];
  const skipped: JoinResult['skipped'] = [];
  const moved = new Set<string>();
  const trimmed = new Set<string>();
  const state: State = {
    moved, trimmed, movedFace: new Map(),
    // Every "<enter>-><receive>" pair joined by a rabbet: a panel's own
    // receivers keep their length when it moves; everything else butting it
    // is trimmed (Task 5).
    rabbetReceivers: new Set(sites.filter((s) => byId.get(s.id)?.joint === 'rabbet').map((s) => `${s.enter}->${s.receive}`)),
  };

  for (const site of sites) {
    const c = byId.get(site.id);
    const joint: JointKind = c?.joint ?? 'butt';
    if (joint === 'butt') { applied.push({ site: site.id, joint }); continue; }
    const E = boards[site.enter];
    const R = boards[site.receive];
    const k = site.axis;
    const side = site.side;
    const panelAlreadyIn = joint === 'rabbet' && state.movedFace.get(site.enter) === `${k}|${side}`;
    if (!panelAlreadyIn && !touching(E, R, k, side)) {
      skipped.push({ site: site.id, reason: `${E.name} no longer meets ${R.name} after an earlier joint` });
      continue;
    }
    switch (joint) {
      case 'mortise-tenon': mortiseTenon(E, R, k, side, c!.tenonLength!); break;
      case 'dado': dado(E, R, k, side, c!.depth!); break;
      case 'stopped-dado': dado(E, R, k, side, c!.depth!, { at: c!.stopAt!, inset: c!.inset! }); break;
      default: rest(joint, site, boards, state, c!); break;
    }
    applied.push({ site: site.id, joint });
  }

  const out = migrateDocument({ ...doc, version: CURRENT_VERSION, boards });
  return {
    doc: out, applied, skipped,
    moved: [...moved], trimmed: [...trimmed],
    sizeBefore: overall(doc.boards), sizeAfter: overall(out.boards),
  };
}

type State = { moved: Set<string>; trimmed: Set<string>; movedFace: Map<number, string>; rabbetReceivers: Set<string> };

/** Task 5 fills this in: rabbet and half-lap. */
function rest(joint: JointKind, _site: Site, _boards: Board[], _state: State, _c: JointChoice): void {
  throw new Error(`applyJoints: ${joint} is not built yet`);
}
