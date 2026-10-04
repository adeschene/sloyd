import type { SloydDocument } from '../../document/document';
import { TOUCH, faceContacts } from '../../document/designCheck';
import { SNAP_INCHES, axisDimensions } from '../../document/geometry';
import { boxOf } from './pocket';

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

export const stopLabel = (s: StopEnd) => `${s.end === 'max' ? '+' : '-'}${AXES[s.axis]}`;
export const siteLabel = (s: Site, doc: SloydDocument) =>
  `${doc.boards[s.enter].name} → ${doc.boards[s.receive].name}: ${KIND_TEXT[s.kind]}`;

const up = (v: number) => Math.ceil(v / SNAP_INCHES - 1e-9) * SNAP_INCHES;
const down = (v: number) => Math.floor(v / SNAP_INCHES + 1e-9) * SNAP_INCHES;
const range = (lo: number, hi: number): [number, number] => [up(lo), down(hi)];

/** R's extent along the contact axis — how far a joint can reach into it. */
const depthOf = (doc: SloydDocument, s: Site) => {
  const r = boxOf(doc.boards[s.receive]);
  return r.max[s.axis] - r.min[s.axis];
};

export function rangesOf(s: Site, doc: SloydDocument): Ranges {
  const rDepth = depthOf(doc, s);
  const e = boxOf(doc.boards[s.enter]);
  return {
    tenonLength: range(0.5, rDepth - 0.25),
    dadoDepth: range(0.125, rDepth / 2),
    rabbetDepth: range(0.125, doc.boards[s.receive].thickness / 2),
    inset: (st) => range(0.25, (e.max[st.axis] - e.min[st.axis]) / 2),
  };
}

function allowedFor(kind: SiteKind, s: Omit<Site, 'id' | 'allowed'>, doc: SloydDocument): JointKind[] {
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
export function findSites(doc: SloydDocument): Site[] {
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
