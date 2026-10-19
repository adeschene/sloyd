import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cornerCurve, createBoard, migrateDocument, partGeometry, DEFAULT_PROFILE_EDGE } from './document';
import type { Board, HoleRow, ProfileCut, ProfileSide } from './types';
import { archCurve, cornerFields, curveFaults, defaultCorners } from './curves';
import { defaultProfile, fallbackCause, geometryBoard, profileAsCurve, profileFaults, profileOf, runsStraight, stopFallsBack, viewProfileFaults } from './profiles';
import { builtSwept } from './sweep';
import { apronArch, loop, topCorners } from './sweepFixtures';
import { boardBodies } from './bodies';
import { isSwept, profilePath } from './profilePath';
import { drawView, FRONT, ISO, SIDE, TOP } from './drawing';
import { curveLines } from './curveText';
import { partFeatures } from './featureKeys';
import { boardSnapPoints } from './snapPoints';
import { stockProbe } from './cuts';
import { holeFaults } from './holeFaults';
import { buildDiagrams } from './diagram';
import { buildCutList } from './cutlist';
import { bodyMesh } from '../viewport/grainTiling';
import { IMPERIAL } from '../units/length';

/** Profile runs b1, the final review's findings (I1, I2): saved v18 documents loaded through `migrateDocument`, as a user's
 *  autosave or export is. */
const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
const base = { face: 'max' as const, kind: 'roundover' as const, size: 0.25, fillet: 0, facing: 'face' as const };
const e2e = (id: string, s: ProfileSide, size = 0.25): ProfileCut => ({ id, ...base, size, run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } });
const stop = (id: string, s: ProfileSide, lo: number, hi: number): ProfileCut => ({ id, ...base, run: { start: { side: s, from: 'min', at: lo }, end: { side: { ...s }, from: 'min', at: hi } } });
const corners = (r: number) => (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) => ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: r }) })));
/** One part saved in a v18 file and loaded back. */
const loaded = (part: Board): Board => migrateDocument(JSON.parse(JSON.stringify({
  version: 18, name: 'saved', units: 'imperial', stock: { kerf: 0.125 }, guides: [], boards: [part], instances: [], definitions: [], shapes: [], materials: [],
}))).boards[0] as Board;
const top = (r: number, profiles: ProfileCut[]) => createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75, curves: corners(r), profiles });

describe('I2 (the controller\'s ruling): a station run claims only its straight side chords', () => {
  it('a saved a2 stop inside a 2" corner arc beside a B10 End to end on the end: both clean, both build', () => {
    const b = loaded(top(2, [stop('a', side('width', 'min'), 1, 30), e2e('b', side('length', 'min'))]));
    expect(b.profiles.map((p) => p.id)).toEqual(['a', 'b']);
    expect(isSwept(b, b.profiles[1]!)).toBe(true);   // the end's run carries round its corners (B10)
    // b2 (Q10, changed by design): the stop is swept-shaped, so its own profileFaults is its swept judgement; it falls back
    expect(b.profiles.map((p) => profileFaults(b, p))).toEqual([[{ kind: 'overlap', other: 'b' }], []]);
    expect(viewProfileFaults(geometryBoard(b).curves.find((c) => c.id === 'a')!)).toEqual([]);   // the row's own faults
    const view = geometryBoard(b);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['b']);
    expect(view.curves.some((c) => c.id === 'a')).toBe(true);   // the stop is a2's view curve, built as a2 built it
    // both cut wood: the bodies differ from the part with either removed
    const vol = (x: Board) => boardBodies(geometryBoard(x)).length;
    expect(vol(b)).not.toBe(vol({ ...b, profiles: [b.profiles[1]!] }));
    expect(vol(b)).not.toBe(vol({ ...b, profiles: [b.profiles[0]!] }));
  });
  it('a stop that really shares the front\'s straight stretch with a swept run still overlaps (both ways)', () => {
    const b = loaded(top(2, [stop('a', side('width', 'min'), 5, 30), e2e('f', side('width', 'min'))]));
    expect(isSwept(b, b.profiles[1]!)).toBe(true);
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'overlap', other: 'f' }]);
    expect(profileFaults(b, b.profiles[1]!)).toEqual([{ kind: 'overlap', other: 'a' }]);
  });
  it('and beside a loop', () => {
    const b = loaded(top(2, [stop('a', side('width', 'min'), 5, 30), { id: 'w', ...base, run: { loop: true } }]));
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'overlap', other: 'w' }]);
  });
});

// ── I1 (the user's ruling, "Fall back to straight") ─────────────────────────────────────────────────────────────────────

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
function meshHash(board: Board): string {
  const { bodies, holes } = partGeometry(board);
  const h = createHash('sha256');
  for (const body of bodies) {
    const m = bodyMesh(board, body, holes, bodies);
    h.update(Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength));
    h.update(Buffer.from(m.uvs.buffer, m.uvs.byteOffset, m.uvs.byteLength));
    if (m.normals) h.update(Buffer.from(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength));
    h.update(JSON.stringify(m.groups));
  }
  return h.digest('hex').slice(0, 16);
}
/** A 1/4" bore 1" along and 0.3" in from the width min side: inside a 3/8" roundover's waste on that side. */
const bore: HoleRow = { id: 'h1', face: 'thickness', from: 'max', along: 'length', alongFrom: 'min', acrossFrom: 'min', station: 1, inset: 0.3, diameter: 0.25, depth: 0.5, count: 1, pitch: 0 };
/** Every reader's output for one part, hashed. The SAME function, run on the deployed a2 source (`git archive 65947fd`,
 *  in a scratch tree beside this one), produced the constants below. */
function fingerprint(b: Board): Record<string, string> {
  const g = partGeometry(b);
  const probe = stockProbe(b);
  const pts: boolean[] = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 12; j++) for (let k = 0; k <= 6; k++) pts.push(probe({ length: b.length * i / 40, width: b.width * j / 12, thickness: b.thickness * k / 6 }));
  const withHole: Board = { ...b, holes: [bore] };
  const view = geometryBoard(b);
  return {
    view: sha({ curves: view.curves, profiles: view.profiles }),
    bodies: sha(g.bodies), edges: sha(g.edges), mesh: meshHash(b),
    draw: sha([FRONT, SIDE, TOP, ISO].map((v) => drawView([b], v))),
    lines: JSON.stringify(curveLines(b, IMPERIAL)),
    keys: sha(partFeatures(b, IMPERIAL)),
    snaps: sha(boardSnapPoints(b)), probe: sha(pts), holes: sha(holeFaults(withHole, bore)),
    diagrams: sha(buildDiagrams(b, IMPERIAL)),
    cutlist: sha(buildCutList({ version: 18, name: 's', units: 'imperial', stock: { kerf: 0.125 }, guides: [], boards: [b], instances: [], definitions: [], shapes: [], materials: [] } as never)),
  };
}
const ROUNDOVER_LINE = 'Roundover 3/8" on the edge between the width face (min side) and the thickness face (max side), along the length';
const A2: Record<'top' | 'small', Record<string, string>> = {
  top: { view: '88ad05c68a982f69', bodies: 'f7e7224112991910', edges: 'f1037b23dc355ad7', mesh: '27b521b0eb43bfd1', draw: '0d6a45f7ea6c2054',
    lines: JSON.stringify(['Round all four corners to a 1/4" radius', ROUNDOVER_LINE]),
    keys: 'b494a3deea6bc299', snaps: 'dff6ae2caffb158c', probe: '26701fdad7a05b42', holes: 'af9a5d2dbe9dd34d', diagrams: 'cbe65cb50e3fcf46', cutlist: '09541b8e75776d50' },
  small: { view: 'a541946cedc2080f', bodies: '0ac96a0b955eb86a', edges: '3ba6b71b52e1559b', mesh: 'deb130556bbfcb23', draw: '93cc0fd5a90d4cd2',
    lines: JSON.stringify(['Round all four corners to a 1/2" radius', 'Thumbnail 3/4" × 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length, top on the thickness face (max side)']),
    keys: 'f4cdd90159799dc7', snaps: 'cfdb92cd5908861c', probe: '64b94ccc294559f0', holes: '4f53cda18c2baa0c', diagrams: 'e2c98d6037ed5645', cutlist: '74a35266d76ccd1c' },
};
/** The reviewer's two scenarios, saved and loaded: a 36 × 20 × 3/4 top with four 1/4" corners and a 3/8" roundover End to
 *  end on the front; the default Thumbnail on a 10 × 2 × 3/4 part with its default 1/2" corners. */
const tightTop = () => loaded(top(0.25, [e2e('p', side('width', 'min'), 0.375)]));
const small = createBoard({ id: 'sm', name: 'Small', length: 10, width: 2, thickness: 0.75 });
const smallCorners = (defaultCorners(small) ?? []).map((c, i) => ({ ...c, id: `k${i}` }));
const tightSmall = () => loaded({ ...small, curves: smallCorners, profiles: [{ ...profileOf(defaultProfile(small, 'thumbnail', DEFAULT_PROFILE_EDGE))!, id: 't' }] });

describe('I1: an End to end too tight to follow its curve is built exactly as a2 built it', () => {
  it.each([['top', tightTop], ['small', tightSmall]] as const)('%s: swept-shaped, too tight as swept, clean as straight', (_n, make) => {
    const b = make();
    expect(cornerFields(b.curves[0]! as never)).toBeTruthy();
    expect(isSwept(b, b.profiles[0]!)).toBe(true);
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);   // authoring still judges it swept
  });
  it.each([['top', tightTop], ['small', tightSmall]] as const)('%s: every reader equals a2\'s output (hashed on 65947fd)', (name, make) => {
    expect(fingerprint(make())).toEqual(A2[name]);
  });
  it('the view holds it as chunk 1\'s curve, faultless, and flagged as running straight', () => {
    const b = tightTop();
    const view = geometryBoard(b);
    expect(view.profiles).toEqual([]);
    const c = view.curves.find((x) => x.id === 'p')!;
    expect(c).toEqual(profileAsCurve(b.profiles[0]!));
    expect(viewProfileFaults(c)).toEqual([]);
    expect(runsStraight(c)).toBe(true);
    expect(runsStraight(view.curves[0]!)).toBe(false);   // a corner curve
  });
  it('a fitting End to end (2" corners) still follows the curve', () => {
    const b = loaded(top(2, [e2e('p', side('width', 'min'), 0.375)]));
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['p']);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['p']);
    expect(runsStraight(view.profiles[0]!)).toBe(false);
  });
  it('a loop never falls back: too tight, it stays swept and builds nothing', () => {
    const b = loaded(top(0.25, [{ id: 'w', ...base, size: 0.375, run: { loop: true } }]));
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['w']);
    expect(viewProfileFaults(view.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    expect(builtSwept(view)).toEqual([]);
    expect(view.curves.some((c) => c.id === 'w')).toBe(false);
  });
  it('no fallback when the straight form faults too: a stop overlapping it on the same side (a2\'s rule)', () => {
    const b = loaded(top(0.25, [e2e('p', side('width', 'min'), 0.375), stop('a', side('width', 'min'), 5, 30)]));
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['p']);
    expect(viewProfileFaults(view.profiles[0]!)).toEqual([{ kind: 'too-tight' }, { kind: 'overlap', other: 'a' }]);
    expect(builtSwept(view)).toEqual([]);
  });
  it('no fallback when the straight form\'s chunk 1 curve faults: a 1" roundover on a 3/4" part runs off either way', () => {
    const b = loaded(top(0.25, [e2e('p', side('width', 'min'), 1)]));
    expect(curveFaults(b, profileAsCurve(b.profiles[0]!)).length).toBeGreaterThan(0);
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['p']);
    expect(viewProfileFaults(view.profiles[0]!).map((f) => f.kind)).toContain('runs-off');
  });
});

describe('I1: a resize that makes a following End to end too tight falls back; growing it back follows again', () => {
  // The notch is stored from the length min end (14" to 16"); shortened to 16.2" it sits 0.2" from the max end, where the
  // 3/8" roundover's offset swallows the end chord (the Task 3 ruling's too-tight).
  const notch = () => loaded(createBoard({ id: 'apron', name: 'Apron', length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) }],
    profiles: [e2e('p', side('width', 'min'), 0.375)] }));
  it('follows at 30"; runs straight at 16.2", built as its plain chunk 1 curve; follows again at 30"', () => {
    const b = notch();
    expect(geometryBoard(b).profiles.map((p) => p.id)).toEqual(['p']);
    const short: Board = { ...b, length: 16.2 };
    expect(profileFaults(short, short.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    const view = geometryBoard(short);
    expect(view.profiles).toEqual([]);
    expect(runsStraight(view.curves.find((c) => c.id === 'p')!)).toBe(true);
    expect(boardBodies(view)).toEqual(boardBodies({ ...short, curves: [...short.curves, profileAsCurve(short.profiles[0]!)], profiles: [] }));
    expect(geometryBoard({ ...short, length: 30 }).profiles.map((p) => p.id)).toEqual(['p']);
  });
});

describe('I1 beside B1a (recorded for a ruling, not decided here)', () => {
  it('a fitting End to end still mitres at a shared corner arc against a neighbour that runs straight', () => {
    // 1/2" corners: a 5/8" roundover on the front is too tight and runs straight; a 1/4" one on the length min end fits.
    // B1a's mitre reads the neighbour's stored presence, so the end's band stops at the arc's middle, and the front half of
    // that corner arc is left as a2's prism leaves it. Final-fix report: "Ruling needed".
    const b = loaded(top(0.5, [e2e('f', side('width', 'min'), 0.625), e2e('l', side('length', 'min'), 0.25)]));
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['l']);
    expect(runsStraight(view.curves.find((c) => c.id === 'f')!)).toBe(true);
    expect(profilePath(b, b.profiles[1]!)!.ends!.map((e) => e.kind)).toEqual(['station', 'mitre']);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['l']);
  });
});

describe('M1: profile faults memoised with the geometry view', () => {
  it('a stored part\'s view faults are computed once, frozen; a resized part (a new object) is judged afresh', () => {
    const b = topCorners(2, loop('p1'));
    const view = geometryBoard(b);
    const vp = view.profiles[0]!;
    const once = viewProfileFaults(vp);
    expect(viewProfileFaults(vp)).toBe(once);
    expect(Object.isFrozen(once)).toBe(true);
    expect(profileFaults(b, b.profiles[0]!)).toBe(profileFaults(b, b.profiles[0]!));
    const tight: Board = { ...b, curves: corners(0.2) };
    expect(viewProfileFaults(geometryBoard(tight).profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    expect(once).toEqual([]);
  });
  it('a part with no view (a panel\'s trial edit) is never memoised', () => {
    const b = topCorners(2, loop('p1'));
    const trial: Board = { ...b, profiles: [...b.profiles] };
    expect(profileFaults(trial, trial.profiles[0]!)).not.toBe(profileFaults(trial, trial.profiles[0]!));
  });
  it('the straight and judged faults are cached apart: a fallen-back End to end keeps too-tight for authoring', () => {
    const b = tightTop();
    const c = geometryBoard(b).curves.find((x) => x.id === 'p')!;
    expect(viewProfileFaults(c)).toEqual([]);
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    expect(profileFaults(b, b.profiles[0]!, { straight: true })).toEqual([]);
  });
});

// ── b2: Q10, saved a2 stops on a turned path (B10 for stops) ──────────────────────────────────────────────────────────────

/** Every reader's output on b1 (`git archive dc49b01`, the same `fingerprint`, in a scratch tree beside this one), where a
 *  station run was always a2's view curve. */
const B1_STOPS: Record<'tightStop' | 'i2Pair' | 'halfPair' | 'pairStops' | 'neighbour' | 'twoHalves', Record<string, string>> = {
  tightStop: { view: "1054ecf87297fb07", bodies: "dfb29cb158c78bbb", edges: "dbee615cebf7af6e", mesh: "b9d0078d006e6ef0", draw: "c122975151bda641", lines: "[\"Round all four corners to a 1/4\\\" radius\",\"Roundover 3/8\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from 1/8\\\" to 30\\\" (stopped)\"]", keys: "281b8bca8d673e23", snaps: "a6f79def32fe1688", probe: "cc4fe20f91aa6de0", holes: "483e5592e3019aca", diagrams: "55167618198983f8", cutlist: "756df6d46713b83d" },
  i2Pair: { view: "28b92e78f1a823bc", bodies: "04542209e67e4e21", edges: "fdef9d305c978416", mesh: "651f78ec1cf9f151", draw: "5b82f644ae8072f2", lines: "[\"Round all four corners to a 2\\\" radius\",\"Roundover 1/4\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from 1\\\" to 30\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the length min end and the thickness face (max side), along the width, round the corners\"]", keys: "3ba5b48e50e9c45a", snaps: "510287cd171e1619", probe: "6faca64595193e6c", holes: "50b347f9f2d15bbe", diagrams: "956f366ea7172127", cutlist: "e1af034ccf1c36d2" },
  halfPair: { view: "07b88ed5231062ab", bodies: "486aaa995dc928b6", edges: "36ab9e631c4cc884", mesh: "855a83d98a6dae88", draw: "d26a032dc562ba3d", lines: "[\"Round all four corners to a 2\\\" radius\",\"Arch on the width min side, from 14\\\" to 14-3/8\\\" from the length min end: 3/16\\\" rise (radius 3/16\\\")\",\"Roundover 1/4\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from the length min end to 30\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the length min end and the thickness face (max side), along the width, round the corners\"]", keys: "3b3d54d7f78f25dd", snaps: "950d87d25b0efb17", probe: "6faca64595193e6c", holes: "50b347f9f2d15bbe", diagrams: "757504a8b465a7a2", cutlist: "8736ea5c3268cdb6" },
  pairStops: { view: "01deadbe799cb11a", bodies: "0aa15dd77bc4418e", edges: "6c20c0801052e7c5", mesh: "d2f1127c9be96252", draw: "b7e4d4c4d8d77794", lines: "[\"Round the corner of the length min end and the width min side to a 2\\\" radius\",\"Arch on the width min side, from 14\\\" to 14-3/8\\\" from the length min end: 3/16\\\" rise (radius 3/16\\\")\",\"Roundover 1/4\\\" on the edge between the length min end and the thickness face (max side), along the width, from 1/2\\\" to 4\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from 1/2\\\" to 20\\\" (stopped)\"]", keys: "010f2a1d7bd834b9", snaps: "43c5cb5fe2f5699d", probe: "fc31011d835641c5", holes: "d8f69535b34e7910", diagrams: "b4b4f6d1154e0488", cutlist: "c007553ac7438733" },
  neighbour: { view: "eb0e169308706c87", bodies: "8d31836f87c451fe", edges: "5fec6cf9b860de93", mesh: "191496d72d2f0ff8", draw: "9983fe1c265844b0", lines: "[\"Round all four corners to a 1/4\\\" radius\",\"Roundover 1/4\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from the length min end to 1/8\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the length min end and the thickness face (max side), along the width, round the corners\"]", keys: "0ac7184bb93dfae5", snaps: "67122402cda428c0", probe: "948f258c4ffe2a53", holes: "4f53cda18c2baa0c", diagrams: "4b6ba820d5ba3375", cutlist: "22c6ec9ea55c9ce5" },
  twoHalves: { view: "71009bf6fce360ca", bodies: "fef026931f0f62e2", edges: "8707cd9428be8849", mesh: "702d4b714314ecb8", draw: "a17155b35b680249", lines: "[\"Round all four corners to a 1/4\\\" radius\",\"Roundover 1/4\\\" on the edge between the width face (min side) and the thickness face (max side), along the length, from the length min end to 1/8\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the width face (max side) and the thickness face (max side), along the length, from the length min end to 1/8\\\" (stopped)\",\"Roundover 1/4\\\" on the edge between the length min end and the thickness face (max side), along the width, round the corners\"]", keys: "dd5060c2a63ee38e", snaps: "d2ee9d0248454693", probe: "948f258c4ffe2a53", holes: "4f53cda18c2baa0c", diagrams: "f15afb7b0c19ff19", cutlist: "3ae2260765ad4e3a" },
};
/** `fits`' bodies on dc49b01 (a2's prism over the arch): b2 makes it follow, so its bodies differ (the B10 change). */
const B1_FITS_BODIES = '1a9fef6716d8cd09';
const halfStop = (id: string, s: ProfileSide, hi: number, size: number): ProfileCut => ({ id, ...base, size, run: { start: { side: s, through: 'min' }, end: { side: { ...s }, from: 'min', at: hi } } });

describe('Q10: saved a2 stops on a turned path (B10 for stops)', () => {
  const tightStop = () => loaded(top(0.25, [{ ...stop('s', side('width', 'min'), 0.1, 30), size: 0.375 }]));
  const i2Pair = () => loaded(top(2, [stop('a', side('width', 'min'), 1, 30), e2e('b', side('length', 'min'))]));
  /** 2" corners and a half-round notch on the front tighter than the bearing (r 3/16): a front half-stop out through the
   *  length min end round the corner to 30" would run through the notch (too tight), so it falls back; an End to end on the
   *  length min end fits round the corner. */
  const halfPair = () => loaded(createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75,
    curves: [...corners(2), { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 0.4, rise: 0.2 }) }],
    profiles: [halfStop('q', side('width', 'min'), 30, 0.25), e2e('p', side('length', 'min'))] }));
  const fits = () => loaded({ ...apronArch, profiles: [stop('a', side('width', 'min'), 10, 20)] });
  it('too tight: swept-shaped, too-tight as swept, held as its a2 view curve with its span; every reader equals b1', () => {
    const b = tightStop();
    expect(isSwept(b, b.profiles[0]!)).toBe(true);
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    expect(stopFallsBack(b, b.profiles[0]!)).toBe(true);
    const view = geometryBoard(b);
    expect(view.profiles).toEqual([]);
    const c = view.curves.find((x) => x.id === 's')!;
    expect(c).toEqual({ ...profileAsCurve(b.profiles[0]!), span: { lo: 0.1, hi: 30, stopLo: true, stopHi: true } });
    expect(viewProfileFaults(c)).toEqual([]);
    expect(runsStraight(c)).toBe(true);
    expect(fingerprint(b)).toEqual(B1_STOPS.tightStop);
  });
  it('I2\'s pair: the stop runs straight, the End to end builds swept, every reader equals b1', () => {
    const b = i2Pair();
    const view = geometryBoard(b);
    expect(view.curves.some((c) => c.id === 'a')).toBe(true);
    expect(runsStraight(view.curves.find((c) => c.id === 'a')!)).toBe(true);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['b']);
    expect(fingerprint(b)).toEqual(B1_STOPS.i2Pair);
  });
  it('M-g / m1: a B10 End to end beside a fallen-back half-stop builds exactly as on b1, no half-arc left unprofiled', () => {
    const b = halfPair();
    expect(stopFallsBack(b, b.profiles[0]!)).toBe(true);
    const view = geometryBoard(b);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['p']);
    // the End to end's FAULT path carries round the shared corner as its built path does (no mitre against a2's prism)
    expect(profilePath(b, b.profiles[1]!)!.ends!.map((e) => e.kind)).toEqual(['station', 'station']);
    expect(b.profiles.map((p) => profileFaults(b, p))).toEqual([[{ kind: 'too-tight' }], []]);
    expect(fingerprint(b)).toEqual(B1_STOPS.halfPair);
    // the wood: a point 0.02" inside the 2" corner arc's FRONT half (240°) and 0.02" below the top — in the End to end's
    // waste, outside the stop's a2 prism (found on dc49b01) — is air: the End to end takes the whole arc. With only the stop
    // it is wood: a mitre against the a2 prism would leave it so.
    const probe = stockProbe(b), alone = stockProbe({ ...b, profiles: [b.profiles[0]!] });
    const pt = { length: 2 + 1.98 * Math.cos(4 * Math.PI / 3), width: 2 + 1.98 * Math.sin(4 * Math.PI / 3), thickness: 0.73 };
    expect(alone(pt)).toBe(true);
    expect(probe(pt)).toBe(false);
  });
  it('stops are decided FIRST, each against the others by their shape: two saved stops sharing only a corner arc', () => {
    // A 30 × 5 apron, a 2" corner and a notch tighter than the bearing on the front. A: the length min end from 4" to 1/2"
    // (round onto the corner arc); B: the front from 1/2" (on the arc) to 20" (through the notch: too tight). Their paths
    // share a stretch of the corner arc only. B falls back (too tight); A, judged against B by its SHAPE (phase 1), would
    // overlap it, while its straight form is clean — so A falls back too, as on b1. Decided with B already resolved (phase
    // 2), A would follow: the hash below catches that.
    const b = loaded(createBoard({ id: 'apron', name: 'Apron', length: 30, width: 5, thickness: 0.75, curves: [
      { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) },
      { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 0.4, rise: 0.2 }) }],
      profiles: [stop('A', side('length', 'min'), 4, 0.5), stop('B', side('width', 'min'), 0.5, 20)] }));
    expect(b.profiles.map((p) => isSwept(b, p))).toEqual([true, true]);
    expect(b.profiles.map((p) => stopFallsBack(b, p))).toEqual([true, true]);
    const view = geometryBoard(b);
    expect(view.profiles).toEqual([]);
    expect(['A', 'B'].map((id) => runsStraight(view.curves.find((c) => c.id === id)!))).toEqual([true, true]);
    expect(['A', 'B'].map((id) => fallbackCause(view.curves.find((c) => c.id === id)!))).toEqual(['overlap', 'too-tight']);
    expect(fingerprint(b)).toEqual(B1_STOPS.pairStops);
  });
  it('a stop that follows never changes a neighbour\'s build (Task 3 fix round 1, I2): b1\'s End to end beside a saved half-stop', () => {
    // 1/4" corners, Roundover 1/4": an End to end on the length min end (b1 built it round its corners) and a saved a2
    // half-stop on the front out through the length min end to 0.1" (on the corner arc). Following, the half-stop would be
    // the End to end's B1a partner and make it too tight (a mitre on 1/4" corners), so it falls back; both build as on b1.
    for (const order of [['b', 'a'], ['a', 'b']]) {
      const ps = { a: halfStop('a', side('width', 'min'), 0.1, 0.25), b: e2e('b', side('length', 'min')) } as Record<string, ProfileCut>;
      const b = loaded(top(0.25, order.map((id) => ps[id]!)));
      const ia = order.indexOf('a'), ib = order.indexOf('b');
      expect(stopFallsBack(b, b.profiles[ia]!)).toBe(true);
      const view = geometryBoard(b);
      expect(builtSwept(view).map((p) => p.id)).toEqual(['b']);
      expect(runsStraight(view.curves.find((c) => c.id === 'a')!)).toBe(true);
      expect(profileFaults(b, b.profiles[ib]!)).toEqual([]);
      expect(profileFaults(b, b.profiles[ia]!)).toEqual([{ kind: 'too-tight' }]);   // the fault its following would cause
      const fresh = { ...b };   // judged afresh (no view cache): the same answer
      expect(profileFaults(fresh, fresh.profiles[ia]!)).toEqual([{ kind: 'too-tight' }]);
      expect(profileFaults(fresh, fresh.profiles[ib]!)).toEqual([]);
      expect(fallbackCause(view.curves.find((c) => c.id === 'a')!)).toBe('too-tight');
      expect(fingerprint(b)).toEqual(B1_STOPS.neighbour);
    }
  });
  it('two half-stops that only TOGETHER would change the End to end (one at each of its corners) both fall back', () => {
    // 1/4" corners: the End to end on the length min end, a front half-stop out through its min corner to 0.1", and a back
    // half-stop from 0.1" out through its min corner. Either alone mitres one of the End to end's corners; the harm is judged
    // against b1's baseline (every station run straight), so each is charged with it, whatever the other does.
    const halfAt = (id: string, s: ProfileSide, at: number, first: boolean): ProfileCut => ({ ...e2e(id, s),
      run: first ? { start: { side: s, through: 'min' }, end: { side: { ...s }, from: 'min', at } } : { start: { side: s, from: 'min', at }, end: { side: { ...s }, through: 'min' } } });
    const b = loaded(top(0.25, [e2e('b', side('length', 'min')), halfAt('a', side('width', 'min'), 0.1, true), halfAt('c', side('width', 'max'), 0.1, false)]));
    expect(b.profiles.map((p) => stopFallsBack(b, p))).toEqual([false, true, true]);
    expect(builtSwept(geometryBoard(b)).map((p) => p.id)).toEqual(['b']);
    expect(fingerprint(b)).toEqual(B1_STOPS.twoHalves);
  });
  it('a stop that fits FOLLOWS: in builtSwept, its bodies differ from b1\'s (the B10 change, recorded)', () => {
    const b = fits();
    const view = geometryBoard(b);
    expect(view.profiles.map((p) => p.id)).toEqual(['a']);
    expect(builtSwept(view).map((p) => p.id)).toEqual(['a']);
    expect(sha(partGeometry(b).bodies)).not.toBe(B1_FITS_BODIES);
  });
  it('fallbackCause names the cause: too-tight for the tight stop, overlap for I2\'s stop; null for a following one', () => {
    const t = geometryBoard(tightStop()), i = geometryBoard(i2Pair()), f = geometryBoard(fits());
    expect(fallbackCause(t.curves.find((c) => c.id === 's')!)).toBe('too-tight');
    expect(fallbackCause(i.curves.find((c) => c.id === 'a')!)).toBe('overlap');
    expect(fallbackCause(f.profiles[0]!)).toBeNull();
    expect(fallbackCause(t.curves[0]!)).toBeNull();   // a corner curve
  });
});
