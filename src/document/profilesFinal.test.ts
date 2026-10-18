import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cornerCurve, createBoard, migrateDocument, partGeometry, DEFAULT_PROFILE_EDGE } from './document';
import type { Board, HoleRow, ProfileCut, ProfileSide } from './types';
import { archCurve, cornerFields, curveFaults, defaultCorners } from './curves';
import { defaultProfile, geometryBoard, profileAsCurve, profileFaults, profileOf, runsStraight, viewProfileFaults } from './profiles';
import { builtSwept } from './sweep';
import { loop, topCorners } from './sweepFixtures';
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
    expect(b.profiles.map((p) => profileFaults(b, p))).toEqual([[], []]);
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
