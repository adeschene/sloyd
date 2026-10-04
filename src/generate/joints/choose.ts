import type { SloydDocument } from '../../document/document';
import type { Violation } from '../../document/designCheck';
import { SNAP_INCHES } from '../../document/geometry';
import { boxOf } from './pocket';
import type { JointChoice } from './recipes';
import { rangesOf, siteLabel, stopLabel } from './sites';
import type { JointKind, Site, StopEnd } from './sites';

const JOINTS: JointKind[] = ['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap', 'butt'];
const n = (v: number) => `${+v.toFixed(4)}`;
const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const AXES = ['X', 'Y', 'Z'] as const;

export const JOINERY_PROMPT = `You choose woodworking joints for a design in Sloyd, a woodworking planner.

You are given the design's parts and a numbered list of SITES — places where two parts meet. For EVERY site, choose one joint from that site's allowed list, with its sizes. The program builds the joints exactly; you supply judgment only.

Joints:
- mortise-tenon: the entering part grows a tenon (a third of its thickness, with shoulders) into a stopped mortise in the receiving part. Size: tenonLength, how far the tenon reaches in. About 2/3 of the receiving part's depth is typical; leave at least 1/4in of wood behind it.
- dado: the entering part's whole end is housed in a trench in the receiving part. Size: depth, about 1/3 of the receiving part's depth along the joint (its thickness, for a panel).
- stopped-dado: a dado that stops short of one edge so it does not show there; the entering part is notched to match. Sizes: depth, stopAt (one of the site's named ends, e.g. "+Z"), inset (how far short it stops).
- rabbet: a thin panel (a back or bottom) sits in a rabbet along the receiving part's edge. Size: depth, how far the rabbet reaches into the receiving part's thickness — half its thickness is typical. The panel moves into the rabbet; parts butting it are shortened to make room.
- half-lap: two crossing parts of equal thickness are each cut halfway so they lie in one plane. No sizes.
- butt: leave the site as it is. Choose it where a joint adds nothing.

Rules of thumb: rails and aprons into legs take mortise and tenon; shelves and dividers into case sides take dados, stopped at the edge that shows (usually the front); backs take rabbets; crossing stretchers take half-laps. Two tenons entering one leg from adjacent faces at the same height will collide unless both are short.

Answer for every site, using its number. All sizes are decimal inches.`;

export const JOINT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    joints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          site: { type: 'integer' },
          joint: { type: 'string', enum: JOINTS },
          tenonLength: { type: 'number' },
          depth: { type: 'number' },
          stopAt: { type: 'string' },
          inset: { type: 'number' },
        },
        required: ['site', 'joint'],
        additionalProperties: false,
      },
    },
  },
  required: ['joints'],
  additionalProperties: false,
};

const SIDE = (s: Site) => `${s.side === 1 ? '+' : '-'}${AXES[s.axis]}`;

export function siteMessage(doc: SloydDocument, sites: Site[]): string {
  const parts = doc.boards.map((b) => {
    const x = boxOf(b);
    return `- ${b.name} (${b.material}): ${n(x.max[0] - x.min[0])} x ${n(x.max[1] - x.min[1])} x ${n(x.max[2] - x.min[2])} in, ` +
      `x ${n(x.min[0])}–${n(x.max[0])}, y ${n(x.min[1])}–${n(x.max[1])}, z ${n(x.min[2])}–${n(x.max[2])}`;
  });
  const lines = sites.map((s) => {
    const r = rangesOf(s, doc);
    const opts = s.allowed.map((j) => {
      switch (j) {
        case 'mortise-tenon': return `mortise-tenon (tenonLength ${n(r.tenonLength[0])}–${n(r.tenonLength[1])})`;
        case 'dado': return `dado (depth ${n(r.dadoDepth[0])}–${n(r.dadoDepth[1])})`;
        case 'stopped-dado': return `stopped-dado (depth ${n(r.dadoDepth[0])}–${n(r.dadoDepth[1])}; stopAt ${s.stopEnds.map((e) => `${stopLabel(e)} with inset ${n(r.inset(e)[0])}–${n(r.inset(e)[1])}`).join(' or ')})`;
        case 'rabbet': return `rabbet (depth ${n(r.rabbetDepth[0])}–${n(r.rabbetDepth[1])})`;
        default: return j;
      }
    });
    return `${s.id}. ${siteLabel(s, doc).replace(': ', ' — ')}, meeting on ${AXES[s.axis]} (${doc.boards[s.enter].name}'s ${SIDE(s)} face). Allowed: ${opts.join(', ')}.`;
  });
  return `Parts:\n${parts.join('\n')}\n\nSites:\n${lines.join('\n')}`;
}

/** Depth of the receiving part along the site's axis. */
function receiveDepth(s: Site, doc: SloydDocument): number {
  const rb = boxOf(doc.boards[s.receive]);
  return rb.max[s.axis] - rb.min[s.axis];
}

/** The ONE home of the tenon default: min(1-1/4, 2/3 of the receiving part), clamped. */
function defaultTenon(s: Site, doc: SloydDocument): number {
  return clamp(Math.min(1.25, snap((2 / 3) * receiveDepth(s, doc))), rangesOf(s, doc).tenonLength);
}

function defaultDado(s: Site, doc: SloydDocument): number {
  return clamp(Math.max(0.125, snap(receiveDepth(s, doc) / 3)), rangesOf(s, doc).dadoDepth);
}

function defaultRabbet(s: Site, doc: SloydDocument): number {
  return clamp(snap(doc.boards[s.receive].thickness / 2), rangesOf(s, doc).rabbetDepth);
}

export function defaultChoice(s: Site, doc: SloydDocument): JointChoice {
  const E = doc.boards[s.enter];
  const R = doc.boards[s.receive];
  const has = (j: JointKind) => s.allowed.includes(j);
  if (s.kind === 'end-into-face') {
    // Spec §5.3 (as corrected): legs and posts take tenons, panels take dados.
    const postLike = R.width <= 2 * R.thickness;
    const wide = E.width > 6 * E.thickness;
    if (postLike && !wide && has('mortise-tenon')) return { site: s.id, joint: 'mortise-tenon', tenonLength: defaultTenon(s, doc) };
    if (has('dado')) return { site: s.id, joint: 'dado', depth: defaultDado(s, doc) };
    return { site: s.id, joint: 'butt' };
  }
  if (s.kind === 'face-against-edge') {
    return has('rabbet') ? { site: s.id, joint: 'rabbet', depth: defaultRabbet(s, doc) } : { site: s.id, joint: 'butt' };
  }
  return { site: s.id, joint: 'half-lap' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate the model's answer against each site (spec §5.2). Every substitution
 * — a missing site, a disallowed joint, a missing or out-of-range size, a bad
 * stopAt — falls back per site and leaves a NOTE for the person.
 */
export function parseChoices(json: unknown, sites: Site[], doc: SloydDocument): { choices: JointChoice[]; notes: string[] } {
  const given = new Map<number, Record<string, unknown>>();
  if (isObj(json) && Array.isArray(json.joints)) {
    for (const j of json.joints) if (isObj(j) && typeof j.site === 'number') given.set(j.site, j);
  }
  const notes: string[] = [];
  const choices = sites.map((s): JointChoice => {
    const label = `Site ${s.id} (${siteLabel(s, doc)})`;
    const g = given.get(s.id);
    const fallback = defaultChoice(s, doc);
    if (!g) { if (given.size > 0) notes.push(`${label}: no answer; used ${fallback.joint}.`); return fallback; }
    const joint = g.joint as JointKind;
    if (typeof g.joint !== 'string') { notes.push(`${label}: no joint given; used ${fallback.joint}.`); return fallback; }
    if (!s.allowed.includes(joint)) { notes.push(`${label}: ${g.joint} is not possible there; used ${fallback.joint}.`); return fallback; }
    const r = rangesOf(s, doc);
    const size = (key: 'tenonLength' | 'depth' | 'inset', rng: [number, number], dflt: number) => {
      const v = g[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) { notes.push(`${label}: no ${key}; used ${n(dflt)}.`); return dflt; }
      const out = clamp(snap(v), rng);
      if (out !== v) notes.push(`${label}: ${key} ${n(v)} became ${n(out)}.`);
      return out;
    };
    switch (joint) {
      case 'mortise-tenon': return { site: s.id, joint, tenonLength: size('tenonLength', r.tenonLength, defaultTenon(s, doc)) };
      case 'dado': return { site: s.id, joint, depth: size('depth', r.dadoDepth, defaultDado(s, doc)) };
      case 'stopped-dado': {
        let at: StopEnd | undefined = s.stopEnds.find((e) => stopLabel(e) === g.stopAt);
        if (!at) {
          at = s.stopEnds[0];
          notes.push(typeof g.stopAt === 'string'
            ? `${label}: stopAt ${g.stopAt} is not one of ${s.stopEnds.map(stopLabel).join(', ')}; used ${stopLabel(at)}.`
            : `${label}: no stopAt given; used ${stopLabel(at)}.`);
        }
        const insetRange = r.inset(at);
        return { site: s.id, joint, depth: size('depth', r.dadoDepth, defaultDado(s, doc)), stopAt: at, inset: size('inset', insetRange, clamp(0.75, insetRange)) };
      }
      case 'rabbet': return { site: s.id, joint, depth: size('depth', r.rabbetDepth, defaultRabbet(s, doc)) };
      default: return { site: s.id, joint };
    }
  });
  return { choices, notes };
}

export function jointsRepairMessage(v: Violation[]): string {
  return `The joints you chose cause ${v.length} new problem${v.length === 1 ? '' : 's'}:\n${v.map((x) => `- ${x.message}`).join('\n')}\n\nReturn the whole joint list again, changed to avoid them (for example, shorter tenons where two meet).`;
}

export function jointsUnusableMessage(reason: 'truncated' | 'unparseable'): string {
  return reason === 'truncated'
    ? 'Your response was cut off. Return the whole joint list again, more compactly.'
    : 'Your response was not a usable joint list. Return it again, matching the schema.';
}
