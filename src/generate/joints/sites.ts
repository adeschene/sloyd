import type { FlatDocument } from '../../document/document';
import { TOUCH, faceContacts } from '../../document/designCheck';
import { bandRegions } from '../../document/featureRegions';
import { SNAP_INCHES, axisDimensions, endFacing, spanToWorldOffset } from '../../document/geometry';
import { boxOf } from './pocket';
import type { WorldBox } from './pocket';

export type SiteKind = 'end-into-face' | 'face-against-edge' | 'crossing';
export type JointKind = 'mortise-tenon' | 'dado' | 'stopped-dado' | 'rabbet' | 'half-lap' | 'butt';
export interface StopEnd { axis: 0 | 1 | 2; end: 'min' | 'max' }
export interface Site {
  id: number; kind: SiteKind;
  enter: number; receive: number;
  axis: 0 | 1 | 2; side: -1 | 1;
  allowed: JointKind[];
  stopEnds: StopEnd[];
}
export interface Ranges {
  tenonLength: [number, number];
  dadoDepth: [number, number];
  rabbetDepth: [number, number];
  inset(s: StopEnd): [number, number];
}

/** A face-against-edge panel is at most this thick: back and bottom panels, never tops (spec §3.2). */
export const THIN_PANEL = 0.5;

const AXES = ['X', 'Y', 'Z'] as const;
const KIND_TEXT: Record<SiteKind, string> = {
  'end-into-face': 'end into face', 'face-against-edge': 'face against edge', crossing: 'crossing',
};

/** The identity of a joint across refines: flat display names plus the meeting's axis and side. */
export const jointKey = (enter: string, receive: string, axis: number, side: number) => `${enter}→${receive}|${axis}|${side}`;
export const stopLabel = (s: StopEnd) => `${s.end === 'max' ? '+' : '-'}${AXES[s.axis]}`;
export const siteLabel = (s: Site, doc: FlatDocument) =>
  `${doc.boards[s.enter].name} → ${doc.boards[s.receive].name}: ${KIND_TEXT[s.kind]}`;

const up = (v: number) => Math.ceil(v / SNAP_INCHES - 1e-9) * SNAP_INCHES;
const down = (v: number) => Math.floor(v / SNAP_INCHES + 1e-9) * SNAP_INCHES;
const range = (lo: number, hi: number): [number, number] => [up(lo), down(hi)];

/** R's extent along the contact axis — how far a joint can reach into it. */
const depthOf = (doc: FlatDocument, s: Site) => {
  const r = boxOf(doc.boards[s.receive]);
  return r.max[s.axis] - r.min[s.axis];
};

/**
 * Final review F2 (the user's ruling, 2026-10-22): the smallest inset at stop end `st` whose groove in the RECEIVER clears
 * the receiver's band strip at that end, or null when no band counts. A band counts when it lies on R's side facing the
 * stop end — `side.across` is the dimension R carries on the stop axis (`axisDimensions`) and `side.from` the end of it
 * facing that world side (`endFacing`) — and has a strip (`bandRegions`, the joinery watch's own region rule: the type's
 * thickness in from the side; tape of thickness 0 has none; a missing type is skipped). Measured in world terms along the
 * stop axis, as `dado()` places the groove (`keep` is E's span less the inset at that end): at a min stop the groove starts
 * at `e.min + inset`, so it clears a strip ending at world `w` when `inset >= w - e.min`; at a max stop, mirrored. Flush
 * (E's stop-end face on R's edge), that is exactly the band's thickness; E set back by `g`, thickness − g.
 */
function bandClearance(doc: FlatDocument, s: Site, st: StopEnd, e: WorldBox): number | null {
  const R = doc.boards[s.receive];
  if (R.bands.length === 0) return null;
  const p = st.axis;
  const dim = axisDimensions(R)[p];
  const from = endFacing(R, p, st.end === 'min' ? -1 : 1);
  let need: number | null = null;
  for (const { band, region } of bandRegions(R, doc.bandTypes)) {
    if (!region || band.side.across !== dim || band.side.from !== from) continue;
    const [lo, hi] = spanToWorldOffset(R, p, region[dim]);
    const n = st.end === 'min' ? R.position[p] + hi - e.min[p] : e.max[p] - (R.position[p] + lo);
    need = need === null ? n : Math.max(need, n);
  }
  return need;
}

export function rangesOf(s: Site, doc: FlatDocument): Ranges {
  const rDepth = depthOf(doc, s);
  const e = boxOf(doc.boards[s.enter]);
  return {
    tenonLength: range(0.5, rDepth - 0.25),
    dadoDepth: range(0.125, rDepth / 2),
    rabbetDepth: range(0.125, doc.boards[s.receive].thickness / 2),
    // F2: the minimum is raised, at a stop end beside the receiver's edging, to the smallest inset whose groove clears it
    // (`bandClearance`); when that would pass the maximum the range is today's, and the trial rules stopped-dado out.
    inset: (st) => {
      const half = (e.max[st.axis] - e.min[st.axis]) / 2;
      const today = range(0.25, half);
      const need = bandClearance(doc, s, st, e);
      if (need === null || need <= 0.25) return today;
      const raised = range(need, half);
      return raised[0] > raised[1] ? today : raised;
    },
  };
}

function allowedFor(kind: SiteKind, s: Omit<Site, 'id' | 'allowed'>, doc: FlatDocument): JointKind[] {
  const E = doc.boards[s.enter];
  const R = doc.boards[s.receive];
  const rDepth = depthOf(doc, s as Site);
  const out: JointKind[] = [];
  if (kind === 'end-into-face') {
    if (E.thickness >= 0.5 && rDepth >= 0.75) out.push('mortise-tenon');
    if (rDepth >= 0.25) out.push('dado');
    if (rDepth >= 0.25 && s.stopEnds.length > 0) out.push('stopped-dado');
  } else if (kind === 'face-against-edge') {
    if (R.thickness >= 0.25) out.push('rabbet');
  } else {
    out.push('half-lap');
  }
  return [...out, 'butt'];
}

/** The two in-plane axes for a contact on `axis`. */
const inPlane = (axis: number) => [0, 1, 2].filter((k) => k !== axis) as (0 | 1 | 2)[];

/**
 * Every place two parts meet that a joint can serve (spec §3). Pure. Sites
 * come from BOX face contacts, so a pair already joined — interpenetrating —
 * is never a contact and is never joined twice.
 */
export function findSites(doc: FlatDocument): Site[] {
  const boxes = doc.boards.map(boxOf);
  const found: Omit<Site, 'id' | 'allowed'>[] = [];
  const kinds: SiteKind[] = [];

  for (const c of faceContacts(doc)) {
    const A = doc.boards[c.a];
    const B = doc.boards[c.b];
    const da = axisDimensions(A)[c.axis];
    const db = axisDimensions(B)[c.axis];
    const axis = c.axis as 0 | 1 | 2;
    const endArea = (i: number) => doc.boards[i].width * doc.boards[i].thickness;
    const push = (kind: SiteKind, enter: number, receive: number, side: -1 | 1) => {
      const stopEnds: StopEnd[] = [];
      if (kind === 'end-into-face') {
        const e = boxes[enter];
        const r = boxes[receive];
        for (const p of inPlane(axis)) {
          // inset's range is empty when E is under 1/2in along p: no stop there.
          if (e.max[p] - e.min[p] < 0.5 - 1e-9) continue;
          if (Math.abs(e.min[p] - r.min[p]) <= TOUCH) stopEnds.push({ axis: p, end: 'min' });
          if (Math.abs(e.max[p] - r.max[p]) <= TOUCH) stopEnds.push({ axis: p, end: 'max' });
        }
      }
      found.push({ kind, enter, receive, axis, side, stopEnds });
      kinds.push(kind);
    };

    // Rule 1: two ends meeting.
    if (da === 'length' && db === 'length') continue;
    // Rule 2: a whole end inside the contact.
    if (da === 'length' && c.area >= endArea(c.a) - 1e-6) { push('end-into-face', c.a, c.b, c.side); continue; }
    if (db === 'length' && c.area >= endArea(c.b) - 1e-6) { push('end-into-face', c.b, c.a, (-c.side) as -1 | 1); continue; }
    // Rule 3: a THIN panel's face against an edge AT THE PANEL'S OWN EDGE —
    // a side framing a back, never a shelf meeting the back mid-panel (that
    // one butts, and is trimmed when the panel moves).
    // The edge is measured along R's THICKNESS axis (the direction the
    // rabbet's trim acts), so a centre partition — whose contact spans the
    // panel's full height but not its width — is not a site.
    const atPanelEdge = (panel: number, other: number) => {
      const p = axisDimensions(doc.boards[other]).indexOf('thickness');
      const lo = Math.max(boxes[panel].min[p], boxes[other].min[p]);
      const hi = Math.min(boxes[panel].max[p], boxes[other].max[p]);
      return lo <= boxes[panel].min[p] + TOUCH || hi >= boxes[panel].max[p] - TOUCH;
    };
    if (da === 'thickness' && db === 'width' && A.thickness <= THIN_PANEL && atPanelEdge(c.a, c.b)) { push('face-against-edge', c.a, c.b, c.side); continue; }
    if (db === 'thickness' && da === 'width' && B.thickness <= THIN_PANEL && atPanelEdge(c.b, c.a)) { push('face-against-edge', c.b, c.a, (-c.side) as -1 | 1); continue; }
    // Rule 4: equal-thickness parts crossing.
    if (da === 'thickness' && db === 'thickness' && Math.abs(A.thickness - B.thickness) <= TOUCH) {
      const [p, q] = inPlane(axis);
      const beyond = (x: number, y: number, k: number) =>
        boxes[x].min[k] < boxes[y].min[k] - TOUCH && boxes[x].max[k] > boxes[y].max[k] + TOUCH;
      const crosses = (beyond(c.a, c.b, p) && beyond(c.b, c.a, q)) || (beyond(c.a, c.b, q) && beyond(c.b, c.a, p));
      if (crosses) {
        // The part on the +axis side moves; `side` is its touching face.
        if (c.side === 1) push('crossing', c.b, c.a, -1);
        else push('crossing', c.a, c.b, -1);
      }
    }
  }

  return found
    .map((s, i) => ({ s, kind: kinds[i] }))
    .sort((x, y) => x.s.enter - y.s.enter || x.s.receive - y.s.receive || x.s.axis - y.s.axis)
    .map(({ s, kind }, i) => ({ ...s, id: i + 1, allowed: allowedFor(kind, s, doc) }));
}
