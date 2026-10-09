import { describe, expect, it } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { flatDocument, migrateDocument } from '../../document/document';
import type { FlatDocument } from '../../document/document';
import { SNAP_INCHES } from '../../document/geometry';
import { GATE_REFUSAL, GATE_TOLERANCE, gateUnjoin, readJoints, rejoin, sameJoined, unjoin } from './unjoin';
import { applyJoints } from './recipes';
import type { JointChoice } from './recipes';
import { findSites, jointKey, rangesOf } from './sites';
import type { JointKind, Site } from './sites';
import { defaultChoice } from './choose';
import { boxOf } from './pocket';

// The harness and fixtures of the measured spike (126/126 exact round trips), made permanent.

type P = { name: string; at: [number, number, number]; size: [number, number, number]; material?: string };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, role: '', material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
  assemblies: [],
}).doc);

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
type Mode = 'defaults' | JointKind | 'mt+rabbet' | 'sdado+rabbet' | 'dado+rabbet';
function forced(s: Site, doc: FlatDocument, sites: Site[], kind: JointKind): JointChoice | null {
  if (!s.allowed.includes(kind)) return null;
  const def = defaultChoice(s, doc, sites);
  if (def.joint === kind) return def;
  const rg = rangesOf(s, doc);
  const rDepth = (() => { const r = boxOf(doc.boards[s.receive]); return r.max[s.axis] - r.min[s.axis]; })();
  switch (kind) {
    case 'mortise-tenon': return { site: s.id, joint: kind, tenonLength: rg.tenonLength[0] };
    case 'dado': return { site: s.id, joint: kind, depth: clamp(Math.max(0.125, snap(rDepth / 3)), rg.dadoDepth) };
    case 'stopped-dado': { const at = s.stopEnds[0]; return { site: s.id, joint: kind, depth: clamp(Math.max(0.125, snap(rDepth / 3)), rg.dadoDepth), stopAt: at, inset: clamp(0.75, rg.inset(at)) }; }
    case 'rabbet': return { site: s.id, joint: kind, depth: clamp(snap(doc.boards[s.receive].thickness / 2), rg.rabbetDepth) };
    case 'half-lap': return { site: s.id, joint: kind };
    default: return null;
  }
}
function choicesFor(mode: Mode, doc: FlatDocument, sites: Site[]): JointChoice[] {
  return sites.map((s) => {
    const butt = { site: s.id, joint: 'butt' as const };
    if (mode === 'defaults') return defaultChoice(s, doc, sites);
    if (mode === 'mt+rabbet' || mode === 'sdado+rabbet' || mode === 'dado+rabbet') {
      if (s.kind === 'face-against-edge') return forced(s, doc, sites, 'rabbet') ?? butt;
      if (s.kind === 'end-into-face') {
        const k: JointKind = mode === 'mt+rabbet' ? 'mortise-tenon' : mode === 'dado+rabbet' ? 'dado' : 'stopped-dado';
        return forced(s, doc, sites, k) ?? forced(s, doc, sites, 'dado') ?? butt;
      }
      return butt;
    }
    return forced(s, doc, sites, mode) ?? butt;
  });
}

// ---- fixtures ----
const orders = <T,>(xs: T[]): T[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
const CASE201: P[] = [
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Top', at: [0.75, 29.25, 0], size: [22.5, 0.75, 11.25] },
  { name: 'Bottom', at: [0.75, 0, 0], size: [22.5, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, -0.25], size: [24, 30, 0.25], material: 'plywood' },
];
const CASE183: P[] = [
  { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
  { name: 'RightSide', at: [20.75, 0, 0], size: [0.75, 30, 12] },
  { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
];
const lapStack: Record<string, P> = {
  A: { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
  B: { name: 'B', at: [9, 0.75, -10], size: [3, 0.75, 30] },
  C: { name: 'C', at: [0, 1.5, 16], size: [20, 0.75, 3] },
};
const legs: P[] = [
  { name: 'Leg XL', at: [0, 0, 13.5], size: [3, 30, 3] }, { name: 'Leg XR', at: [33, 0, 13.5], size: [3, 30, 3] },
  { name: 'Leg ZF', at: [16.5, 0, -3], size: [3, 30, 3] }, { name: 'Leg ZB', at: [16.5, 0, 30], size: [3, 30, 3] },
];
const rails: P[] = [{ name: 'Rail A', at: [3, 20, 13.5], size: [30, 1, 3] }, { name: 'Rail B', at: [16.5, 21, 0], size: [3, 1, 30] }];

const FIXTURES: [string, () => FlatDocument][] = [
  ['leg+rail', () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] })],
  ['side+shelf', () => design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] })],
  ['rail between legs (2 ends)', () => design({ name: 'Leg A', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Leg B', at: [19.75, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] })],
  ['corner leg, 2 rails', () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] }, { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3, 18] })],
  ['workbench (turned rails)', () => flatDocument(migrateDocument(JSON.parse(workbenchRaw)))],
  ['half-lap pair', () => design({ name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] }, { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] })],
  ['stretcher grid', () => design(
    { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] }, { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
    { name: 'UpA', at: [2, 5.75, -4], size: [2, 0.75, 20] }, { name: 'UpB', at: [12, 5.75, -4], size: [2, 0.75, 20] })],
  ...orders(['A', 'B', 'C']).map((o) => [`3-stack ${o.join('')}`, () => design(...o.map((n) => lapStack[n]))] as [string, () => FlatDocument]),
  ['5-part lap grid', () => design(
    { name: 'A1', at: [0, 0, 2], size: [20, 0.75, 3] }, { name: 'A2', at: [0, 0, 15], size: [20, 0.75, 3] },
    { name: 'B1', at: [3, 0.75, 0], size: [3, 0.75, 20] }, { name: 'B2', at: [14, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'C', at: [0, 1.5, 8.5], size: [20, 0.75, 3] })],
  ['tenons+lap (legs first)', () => design(...legs, ...rails)],
  ['tenons+lap (rails first)', () => design(...rails, ...legs)],
  ['rabbet: back on +Z, shelf', () => design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] }, { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] })],
  ['drawer (lowered)', () => design(
    { name: 'SideL', at: [0, 0.25, 0], size: [0.5, 4, 12] }, { name: 'SideR', at: [9.5, 0.25, 0], size: [0.5, 4, 12] },
    { name: 'Front', at: [0.5, 0.25, 0], size: [9, 4, 0.5] }, { name: 'BackP', at: [0.5, 0.25, 11.5], size: [9, 4, 0.5] },
    { name: 'Bottom', at: [0, 0, 0], size: [10, 0.25, 12] })],
  ['case + cleat (fu 183)', () => design(...CASE183, { name: 'Cleat', at: [0.75, 26, -1], size: [20, 3, 0.75] })],
  ['case + shelf butting back (fu 201)', () => design(...CASE201, { name: 'Shelf', at: [0.75, 15, 0], size: [22.5, 0.75, 11.25] })],
  ['case + shelf 1/8 short (fu 201)', () => design(...CASE201, { name: 'Shelf', at: [0.75, 15, 0.125], size: [22.5, 0.75, 11.125] })],
  ['tenoned shelf behind rabbet', () => design(
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] }, { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] })],
  ['bookcase (cutlines)', () => design(
    { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] }, { name: 'Left side', at: [0, 0, 0], size: [0.75, 72, 11.25] },
    { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 72, 11.25] }, { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
    { name: 'Top', at: [0.75, 71.25, 0], size: [30, 0.75, 11.25] }, { name: 'Shelf 1', at: [0.75, 24, 0], size: [30, 0.75, 11.25] },
    { name: 'Shelf 2', at: [0.75, 48, 0], size: [30, 0.75, 11.25] })],
  ['bookcase raised bottom (BOOK)', () => design(
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 36, 11.25] }, { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 36, 11.25] },
    { name: 'Top', at: [0.75, 35.25, 0], size: [22.5, 0.75, 11.25] }, { name: 'Bottom', at: [0.75, 2, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Shelf', at: [0.75, 18, 0], size: [22.5, 0.75, 11.25] }, { name: 'Back', at: [0, 0, -0.25], size: [24, 36, 0.25], material: 'plywood' })],
];
const MODES: Mode[] = ['defaults', 'mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap', 'mt+rabbet', 'dado+rabbet', 'sdado+rabbet'];

function roundTrip(P: FlatDocument, mode: Mode) {
  const sites = findSites(P);
  const choices = choicesFor(mode, P, sites);
  if (mode !== 'defaults' && choices.every((c) => c.joint === 'butt')) return null;
  const J = applyJoints(P, sites, choices).doc;
  const g = gateUnjoin(J);
  return { J, g, P };
}

/** Every fixture x mode that joins something and survives the gate (so unjoin succeeds on it). */
function allJoinedCases(): FlatDocument[] {
  return FIXTURES.flatMap(([, f]) => MODES.map((m) => roundTrip(f(), m))).filter((r): r is NonNullable<typeof r> => !!r && !('refused' in r.g)).map((r) => r.J);
}
const bookcaseFixture = () => FIXTURES.find(([n]) => n === 'bookcase (cutlines)')![1]();
const joinAllDefaults = (P: FlatDocument, pick: (s: Site) => boolean = () => true) => {
  const s = findSites(P);
  return applyJoints(P, s, s.map((x) => (pick(x) ? defaultChoice(x, P, s) : { site: x.id, joint: 'butt' as const }))).doc;
};
/** The bookcase joined with defaults plus one hand-added cut on Shelf 1; says where the cut went. */
function withHandCut() {
  const flat = structuredClone(joinAllDefaults(bookcaseFixture()));
  const part = flat.boards.findIndex((b) => b.name === 'Shelf 1');
  flat.boards[part]!.cuts.push({ id: 'hand', face: 'thickness', from: 'min', across: 'width', offset: 8, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
  return { flat, part, cut: flat.boards[part]!.cuts.length - 1 };
}

describe('unjoin — every fixture × mode re-joins exactly (the spike, made permanent)', () => {
  const cases = FIXTURES.flatMap(([name, f]) => MODES.map((m) => [name, m, f] as const));
  it.each(cases)('%s / %s', (_name, mode, f) => {
    const r = roundTrip(f(), mode);
    if (!r) return;
    expect('refused' in r.g ? r.g.refused : null).toBeNull();
  });

  it('every fixture input is uncut, and 126 fixture × mode cases join something (the spike\'s count)', () => {
    for (const [name, f] of FIXTURES) expect(f().boards.every((b) => b.cuts.length === 0), name).toBe(true);
    const joined = FIXTURES.flatMap(([, f]) => MODES.map((m) => roundTrip(f(), m))).filter(Boolean);
    expect(joined.length).toBe(126);
  });

  it('recovers the original plain design, except the documented ambiguities', () => {
    const ambiguous = new Set(['case + shelf 1/8 short (fu 201)']);
    for (const [name, f] of FIXTURES) for (const m of MODES) {
      const r = roundTrip(f(), m);
      if (!r || 'refused' in r.g) continue;
      const plain = { ...r.J, boards: r.g.plain };
      expect(sameJoined(plain, r.P) || ambiguous.has(name), `${name}/${m}`).toBe(true);
    }
  });

  it('assumes a shelf short of the back was butting it (spec §3.1)', () => {
    const short = FIXTURES.find(([n]) => n === 'case + shelf 1/8 short (fu 201)')![1]();
    const r = roundTrip(short, 'rabbet')!;
    if ('refused' in r.g) throw new Error(r.g.refused);
    const shelf = r.g.plain.find((b) => b.name === 'Shelf')!;
    expect(shelf.width).toBe(11.25); // butting: the full depth, not 11.125
  });
});

describe('gateUnjoin refusals (review focus 2)', () => {
  const bookcase = () => FIXTURES.find(([n]) => n === 'bookcase (cutlines)')![1]();
  const joinAll = (P: FlatDocument, pick: (s: Site) => boolean = () => true) => {
    const s = findSites(P);
    return applyJoints(P, s, s.map((x) => (pick(x) ? defaultChoice(x, P, s) : { site: x.id, joint: 'butt' as const }))).doc;
  };

  it('refuses a hand-added cut', () => {
    const J = joinAll(bookcase());
    const extra = structuredClone(J);
    const t = extra.boards.find((b) => b.name === 'Top')!;
    t.cuts.push({ id: 'hand', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
    expect(gateUnjoin(extra)).toEqual({ refused: GATE_REFUSAL });
    // unjoin's own reason is internal and names the cut; the gate replaces it.
    const u = unjoin(extra);
    expect('refused' in u && u.refused.startsWith('unexplained cuts on Top')).toBe(true);
  });

  it('refuses a project joined twice, dados before rabbets', () => {
    const P = bookcase();
    const J1 = joinAll(P, (s) => s.kind === 'end-into-face');
    const J = joinAll(J1, (s) => s.kind === 'face-against-edge');
    expect(gateUnjoin(J)).toEqual({ refused: GATE_REFUSAL });
  });

  it('refuses a joined part resized by hand', () => {
    const J = structuredClone(joinAll(bookcase()));
    J.boards.find((b) => b.name === 'Shelf 1')!.length += 0.5;
    expect('refused' in gateUnjoin(J)).toBe(true);
  });

  it('accepts an unjoined design (nothing to explain)', () => {
    const r = gateUnjoin(bookcase());
    expect('refused' in r ? r.refused : null).toBeNull();
    if (!('refused' in r)) expect(r.joints).toEqual([]);
  });
});

describe('records', () => {
  it('key each joint by names, axis and side (review focus 5)', () => {
    const corner = FIXTURES.find(([n]) => n === 'corner leg, 2 rails')![1]();
    const r = roundTrip(corner, 'mortise-tenon')!;
    if ('refused' in r.g) throw new Error(r.g.refused);
    const keys = r.g.joints.map((j) => jointKey(j.enter, j.receive, j.axis, j.side));
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.g.joints.every((j) => j.choice.joint === 'mortise-tenon' && typeof j.choice.tenonLength === 'number')).toBe(true);
  });

  it('carry only the sizes their kind uses, with no undefined keys', () => {
    for (const [name, f] of FIXTURES) for (const m of MODES) {
      const r = roundTrip(f(), m);
      if (!r || 'refused' in r.g) continue;
      for (const j of r.g.joints) expect(Object.values(j.choice).some((v) => v === undefined), `${name}/${m}`).toBe(false);
    }
  });

  it('keep two meetings of one pair apart by axis and by side (review focus 5)', () => {
    // Boxes touch on at most one face plane per pair, so no plain fixture has two
    // sites for one pair; the separation is pinned on the key itself.
    expect(jointKey('Rail', 'Leg', 0, 1)).toBe('Rail→Leg|0|1');
    expect(jointKey('Rail', 'Leg', 0, 1)).not.toBe(jointKey('Rail', 'Leg', 2, 1));
    expect(jointKey('Rail', 'Leg', 0, 1)).not.toBe(jointKey('Rail', 'Leg', 0, -1));
  });
});

describe('sameJoined', () => {
  it('can fail on a 1/16 nudge and on a cut depth', () => {
    const J = (() => { const P = FIXTURES[0][1](); const s = findSites(P); return applyJoints(P, s, s.map((x) => defaultChoice(x, P, s))).doc; })();
    expect(sameJoined(J, structuredClone(J))).toBe(true);
    const a = structuredClone(J); a.boards[1].position[0] += 1 / 16;
    expect(sameJoined(a, J)).toBe(false);
    const b = structuredClone(J); b.boards[0].cuts[0].depth += 1 / 16;
    expect(sameJoined(b, J)).toBe(false);
  });
});

describe('the gate compares numbers within GATE_TOLERANCE (refine-joined spec §3.2, final-review ruling)', () => {
  // Metric stock: none of these numbers is a binary fraction, so cut fields recomputed from world
  // coordinates come back off in the last bit. `exact` keeps designToDocument from snapping them.
  const mm = (v: number) => v / 25.4;
  const exactDesign = (...parts: P[]) => {
    const nums = new Set(parts.flatMap((p) => [...p.at, ...p.size]));
    return flatDocument(designToDocument({
      name: 'M', assemblies: [],
      parts: parts.map((p) => ({ name: p.name, role: '', material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
    }, { exact: nums }).doc);
  };
  const t = mm(18), H = mm(720), D = mm(300), W = mm(600), b = mm(6);
  const metric = () => exactDesign(
    { name: 'Left side', at: [0, 0, 0], size: [t, H, D] },
    { name: 'Right side', at: [W - t, 0, 0], size: [t, H, D] },
    { name: 'Top', at: [t, H - t, 0], size: [W - 2 * t, t, D] },
    { name: 'Bottom', at: [t, 0, 0], size: [W - 2 * t, t, D] },
    { name: 'Shelf', at: [t, 3.3 + mm(250), 0], size: [W - 2 * t, t, D] },
    { name: 'Back', at: [0, 0, -b], size: [W, H, b], material: 'plywood' },
  );
  const joinDefaults = (P: FlatDocument) => { const s = findSites(P); return applyJoints(P, s, s.map((x) => defaultChoice(x, P, s))).doc; };

  it('GATE_TOLERANCE is 1e-9in', () => {
    expect(GATE_TOLERANCE).toBe(1e-9);
  });

  it('the metric fixture really is metric, and joins something', () => {
    const P = metric();
    expect(P.boards.find((x) => x.name === 'Left side')!.thickness).toBe(18 / 25.4);
    expect(P.boards.find((x) => x.name === 'Back')!.thickness).toBe(6 / 25.4);
    expect(joinDefaults(P).boards.some((x) => x.cuts.length > 0)).toBe(true);
  });

  it('accepts a metric cabinet joined with the defaults', () => {
    const g = gateUnjoin(joinDefaults(metric()));
    expect('refused' in g ? g.refused : null).toBeNull();
    if (!('refused' in g)) expect(g.joints.length).toBeGreaterThan(0);
  });

  it('accepts a defaults-joined design moved +3.3in in y after joining', () => {
    for (const [name, f] of FIXTURES.filter(([n]) => n === 'bookcase (cutlines)' || n === 'corner leg, 2 rails' || n === 'rabbet: back on +Z, shelf')) {
      const J = structuredClone(joinDefaults(f()));
      for (const x of J.boards) x.position[1] += 3.3;
      const g = gateUnjoin(J);
      expect('refused' in g ? g.refused : null, name).toBeNull();
    }
  });

  it('accepts the metric cabinet moved +3.3in in y after joining', () => {
    const J = structuredClone(joinDefaults(metric()));
    for (const x of J.boards) x.position[1] += 3.3;
    const g = gateUnjoin(J);
    expect('refused' in g ? g.refused : null).toBeNull();
  });

  it('sameJoined passes a 1e-12 difference in a position, a size and a cut depth, and fails 1e-6 and 1/16', () => {
    const J = joinDefaults(FIXTURES[0][1]());
    const tweak = (f: (d: FlatDocument) => void) => { const d = structuredClone(J); f(d); return d; };
    const cutPart = J.boards.findIndex((x) => x.cuts.length > 0);
    // The expectations are written out, not derived from GATE_TOLERANCE, so a changed tolerance goes red.
    for (const [e, ok] of [[1e-12, true], [1e-6, false], [1 / 16, false]] as const) {
      expect(sameJoined(tweak((d) => { d.boards[1].position[0] += e; }), J), `position ${e}`).toBe(ok);
      expect(sameJoined(tweak((d) => { d.boards[1].length += e; }), J), `length ${e}`).toBe(ok);
      expect(sameJoined(tweak((d) => { d.boards[cutPart].cuts[0].depth += e; }), J), `cut depth ${e}`).toBe(ok);
      expect(sameJoined(tweak((d) => { d.boards[cutPart].cuts[0].offset += e; }), J), `cut offset ${e}`).toBe(ok);
    }
  });

  it('sameJoined stays exact on names and non-numeric cut fields', () => {
    const J = joinDefaults(FIXTURES[0][1]());
    const cutPart = J.boards.findIndex((x) => x.cuts.length > 0);
    const a = structuredClone(J); a.boards[0].name += ' ';
    expect(sameJoined(a, J)).toBe(false);
    const c = structuredClone(J); c.boards[cutPart].cuts[0].from = c.boards[cutPart].cuts[0].from === 'min' ? 'max' : 'min';
    expect(sameJoined(c, J)).toBe(false);
  });
});

describe('readJoints (repair-joints spec §2 step 3)', () => {
  it('agrees with unjoin wherever unjoin succeeds, with nothing unexplained', () => {
    const cases = allJoinedCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const joined of cases) {
      const u = unjoin(joined); const r = readJoints(joined);
      if ('refused' in u || 'refused' in r) throw new Error('expected success');
      expect(r.unexplained).toEqual([]);
      expect(r.plain).toEqual(u.plain);
      expect(r.joints).toEqual(u.joints);
    }
  });
  it('names the hand-added cut by part and cut index instead of refusing', () => {
    const { flat, part, cut } = withHandCut();
    const r = readJoints(flat);
    if ('refused' in r) throw new Error('expected a read');
    expect(r.unexplained).toEqual([{ part, cut }]);
    expect(unjoin(flat)).toHaveProperty('refused');
  });
});

describe('rejoin', () => {
  const joinedWithJoints = () => joinAllDefaults(bookcaseFixture());
  it('reproduces a joined design from its read-back', () => {
    const joined = joinedWithJoints();
    const r = readJoints(joined); if ('refused' in r) throw new Error('read');
    expect(r.joints.length).toBeGreaterThan(0);
    expect(sameJoined(rejoin({ ...joined, boards: r.plain }, r.joints)!, joined)).toBe(true);
  });
  it('is null when a recorded joint has no site', () => {
    const joined = joinedWithJoints();
    const r = readJoints(joined); if ('refused' in r) throw new Error('read');
    expect(rejoin({ ...joined, boards: r.plain }, [{ ...r.joints[0]!, enter: 'Nobody' }])).toBeNull();
  });
});
