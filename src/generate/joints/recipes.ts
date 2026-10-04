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

/** Indices of parts (not `skip`) whose face butts E's `side` face on k, sharing real area. */
function buttingFace(boards: Board[], e: number, k: number, side: -1 | 1, skip: (i: number) => boolean): number[] {
  const eb = boxOf(boards[e]);
  const plane = side === 1 ? eb.max[k] : eb.min[k];
  return boards.map((_, i) => i).filter((i) => {
    if (i === e || skip(i)) return false;
    const xb = boxOf(boards[i]);
    const xFace = side === 1 ? xb.min[k] : xb.max[k];
    const shares = [0, 1, 2].filter((a) => a !== k)
      .every((a) => Math.min(eb.max[a], xb.max[a]) - Math.max(eb.min[a], xb.min[a]) > TOUCH);
    return Math.abs(xFace - plane) <= TOUCH && shares;
  });
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
    halfLapPartners: new Set(sites.filter((s) => byId.get(s.id)?.joint === 'half-lap').map((s) => `${s.enter}->${s.receive}`)),
  };

  for (const site of sites) {
    const c = byId.get(site.id);
    const joint: JointKind = c?.joint ?? 'butt';
    if (joint === 'butt') { applied.push({ site: site.id, joint }); continue; }
    const E = boards[site.enter];
    const R = boards[site.receive];
    const k = site.axis;
    const side = site.side;
    const panelAlreadyIn = (joint === 'rabbet' || joint === 'half-lap') && state.movedFace.get(site.enter) === `${k}|${side}`;
    if (!panelAlreadyIn && !touching(E, R, k, side)) {
      skipped.push({ site: site.id, reason: `${E.name} no longer meets ${R.name} after an earlier joint` });
      continue;
    }
    switch (joint) {
      case 'mortise-tenon': mortiseTenon(E, R, k, side, c!.tenonLength!); break;
      case 'dado': dado(E, R, k, side, c!.depth!); break;
      case 'stopped-dado': dado(E, R, k, side, c!.depth!, { at: c!.stopAt!, inset: c!.inset! }); break;
      default: {
        const blocked = rest(joint, site, boards, state, c!);
        if (blocked) { skipped.push({ site: site.id, reason: blocked }); continue; }
      }
    }
    applied.push({ site: site.id, joint });
  }

  // A rabbeted bottom moves up into its frame; if the design stood on the
  // floor, lower everything back onto it (spec §4.7).
  const lowest = (bs: Board[]) => Math.min(...bs.map((b) => boxOf(b).min[1]));
  if (doc.boards.length > 0 && lowest(doc.boards) <= TOUCH) {
    const drop = lowest(boards);
    for (const b of boards) b.position[1] -= drop;
  }
  const out = migrateDocument({ ...doc, version: CURRENT_VERSION, boards });
  return {
    doc: out, applied, skipped,
    moved: [...moved], trimmed: [...trimmed],
    sizeBefore: overall(doc.boards), sizeAfter: overall(out.boards),
  };
}

type State = { moved: Set<string>; trimmed: Set<string>; movedFace: Map<number, string>; rabbetReceivers: Set<string>; halfLapPartners: Set<string> };

function rest(joint: JointKind, site: Site, boards: Board[], state: State, c: JointChoice): string | null {
  if (joint === 'rabbet') { rabbet(site, boards, state, c.depth!); return null; }
  if (joint === 'half-lap') return halfLap(site, boards, state);
  throw new Error(`applyJoints: unknown joint ${joint}`);
}

/**
 * Rabbet (spec §4.5). The panel moves ONCE toward its receivers by its own
 * thickness, and every OTHER part butting the face that moves is shortened by
 * the same amount first — otherwise the back drives into the shelves. Each
 * receiver gets a rabbet t deep from its edge and r in from its inner face,
 * and the panel is trimmed back to the rabbet line.
 */
function rabbet(site: Site, boards: Board[], state: State, r: number) {
  const E = boards[site.enter];
  const R = boards[site.receive];
  const k = site.axis;
  const side = site.side;
  const t = E.thickness;
  const faceKey = `${k}|${side}`;
  const rb = boxOf(R);

  if (state.movedFace.get(site.enter) !== faceKey) {
    // Rabbet receivers of this panel keep their length; everyone else
    // butting the moving face is shortened on that face.
    for (const i of buttingFace(boards, site.enter, k, side, (j) => j === site.receive || state.rabbetReceivers.has(`${site.enter}->${j}`))) {
      resize(boards[i], k, (side === 1 ? -1 : 1) as -1 | 1, -t);
      state.trimmed.add(boards[i].name);
    }
    E.position[k] += side * t;
    state.moved.add(E.name);
    state.movedFace.set(site.enter, faceKey);
  }

  const P = side === -1 ? rb.max[k] : rb.min[k];
  const kSpan: [number, number] = side === -1 ? [P - t, P] : [P, P + t];
  const nAx = axisDimensions(R).indexOf('thickness');
  const q = [0, 1, 2].find((a) => a !== k && a !== nAx)!;
  const eb = boxOf(E);
  const inner = (eb.min[nAx] + eb.max[nAx]) / 2 >= (rb.min[nAx] + rb.max[nAx]) / 2 ? 'max' : 'min';
  const nSpan: [number, number] = inner === 'max' ? [rb.max[nAx] - r, rb.max[nAx]] : [rb.min[nAx], rb.min[nAx] + r];
  const qSpan: [number, number] = [Math.max(eb.min[q], rb.min[q]), Math.min(eb.max[q], rb.max[q])];
  R.cuts.push(pocketFor(R, withSpans(rb, { [k]: kSpan, [nAx]: nSpan, [q]: qSpan })));

  if (inner === 'max' && eb.min[nAx] < nSpan[0] - 1e-9) {
    resize(E, nAx, -1, -(nSpan[0] - eb.min[nAx]));
    state.trimmed.add(E.name);
  } else if (inner === 'min' && eb.max[nAx] > nSpan[1] + 1e-9) {
    resize(E, nAx, 1, -(eb.max[nAx] - nSpan[1]));
    state.trimmed.add(E.name);
  }
}

/**
 * Half-lap (spec §4.6). E — the part on the +axis side — drops by t into R's
 * plane; each is notched by half where they cross, E on R's original side.
 */
function halfLap(site: Site, boards: Board[], state: State): string | null {
  const E = boards[site.enter];
  const R = boards[site.receive];
  const k = site.axis;
  const side = site.side;
  const faceKey = `${k}|${side}`;
  if (state.movedFace.get(site.enter) !== faceKey) {
    // Dropping E must not drive it into anything but its own lap partners.
    const blocker = buttingFace(boards, site.enter, k, side, (j) => state.halfLapPartners.has(`${site.enter}->${j}`))[0];
    if (blocker !== undefined) return `moving ${E.name} would drive it into ${boards[blocker].name}`;
    // All of E's lap partners must share one plane, or E cannot drop into all.
    const partners = [...state.halfLapPartners].filter((p) => p.startsWith(`${site.enter}->`)).map((p) => boxOf(boards[+p.split('->')[1]]));
    if (partners.some((p) => Math.abs(p.min[k] - partners[0].min[k]) > TOUCH || Math.abs(p.max[k] - partners[0].max[k]) > TOUCH)) {
      return `${E.name}'s half-lap partners do not lie in one plane`;
    }
    // ALIGN rather than move by t: E's touching face lands exactly on R's
    // opposite face, so a TOUCH-sized gap or thickness difference cannot
    // leave E out of R's plane.
    const eNow = boxOf(E);
    const rNow = boxOf(R);
    E.position[k] += side === -1 ? rNow.min[k] - eNow.min[k] : rNow.max[k] - eNow.max[k];
    state.moved.add(E.name);
    state.movedFace.set(site.enter, faceKey);
  }
  // Defensive guard: through applyJoints E was just aligned onto the first
  // partner and the pre-check proved the rest coplanar within TOUCH, so only
  // a thickness difference beyond TOUCH (which rule 4 forbids) could trip it.
  if (Math.abs(boxOf(E).min[k] - boxOf(R).min[k]) > TOUCH || Math.abs(boxOf(E).max[k] - boxOf(R).max[k]) > TOUCH) {
    return `${E.name} no longer lies in ${R.name}'s plane after an earlier half-lap`;
  }
  const eb = boxOf(E);
  const rb = boxOf(R);
  const mid = (rb.min[k] + rb.max[k]) / 2;
  const lower: [number, number] = [rb.min[k], mid];
  const upper: [number, number] = [mid, rb.max[k]];
  const cross = (a: number): [number, number] => [Math.max(eb.min[a], rb.min[a]), Math.min(eb.max[a], rb.max[a])];
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const crossing = { [p]: cross(p), [q]: cross(q) };
  E.cuts.push(pocketFor(E, withSpans(eb, { ...crossing, [k]: side === -1 ? lower : upper })));
  R.cuts.push(pocketFor(R, withSpans(rb, { ...crossing, [k]: side === -1 ? upper : lower })));
  return null;
}
