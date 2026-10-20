import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { cornerCurve } from './curves';
import { BAND_SIDES, BUILT_IN_BAND, BUILT_IN_BAND_ID, bandFaults } from './banding';
import { drawView, FRONT, ISO, SIDE, TOP, type Drawing, type Seg2, type View } from './drawing';
import { mirrorDim } from './frames';
import { toWorld } from './snapPoints';
import { worldParts } from './tree';
import type { Band, BandType, Board, Definition, ProfileSide, SloydDocument } from './types';

/** Edge banding chunk 2, Task 3: glue lines through the one hidden-line pass, the band tag on outline edges (Q4–Q6). */
const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };
const L0: ProfileSide = { across: 'length', from: 'min' };
const L1: ProfileSide = { across: 'length', from: 'max' };
const maple: BandType = { id: 'maple', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const types: BandType[] = [BUILT_IN_BAND, maple];
const part = (bands: Band[], over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ id: 'p', name: 'Panel', length: 36, width: 20, thickness: 0.75, material: 'plywood' }), bands, cornerRule: 'long', ...over });
const solid = (...sides: ProfileSide[]): Band[] => sides.map((side) => ({ side, type: 'maple' }));

const isBand = (s: Seg2) => s.feature !== undefined && s.feature.includes(':band:');
const proj = (v: View, p: readonly number[]): [number, number] =>
  [p[0]! * v.right[0] + p[1]! * v.right[1] + p[2]! * v.right[2], p[0]! * v.up[0] + p[1]! * v.up[1] + p[2]! * v.up[2]];
const W = (b: Board, l: number, w: number, t: number) => toWorld(b, { length: l, width: w, thickness: t });
const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
/** Screen matching: a hidden segment's ends sit up to ~1e-6 in from the edge's (the hidden spans' DRAW_EPS growth). */
const onScreen = (x: number, y: number) => Math.abs(x - y) <= 1e-5;
/** The drawn segments (either direction) between two board-local points. */
function find(list: Seg2[], v: View, b: Board, a: [number, number, number], e: [number, number, number]): Seg2[] {
  const pa = proj(v, W(b, ...a));
  const pe = proj(v, W(b, ...e));
  const same = (s: Seg2, p: [number, number], q: [number, number]) =>
    onScreen(s.a[0], p[0]) && onScreen(s.a[1], p[1]) && onScreen(s.b[0], q[0]) && onScreen(s.b[1], q[1]);
  return list.filter((s) => same(s, pa, pe) || same(s, pe, pa));
}

describe('drawView: glue lines (edge banding chunk 2, Q4/Q5)', () => {
  const four = part(solid(...BAND_SIDES));
  it('glue lines are tagged segments: four on the near broad face in Plan, at the glue offsets', () => {
    const d = drawView([four], TOP, undefined, { bandTypes: types });
    const T = 0.75;
    const glue: [[number, number, number], [number, number, number]][] = [
      [[0, 0.25, T], [36, 0.25, T]], [[0, 19.75, T], [36, 19.75, T]],
      [[0.25, 0.25, T], [0.25, 19.75, T]], [[35.75, 0.25, T], [35.75, 19.75, T]],
    ];
    for (const [a, e] of glue) {
      const hit = find(d.visible, TOP, four, a, e);
      expect(hit).toHaveLength(1);
      expect(hit[0]!.feature).toBe('p:band:maple');
    }
    // Every visible band segment is a glue line or an outline edge on a banded side's plane: 4 + 4.
    expect(d.visible.filter(isBand)).toHaveLength(8);
    // The near face's glue lines are visible; the far face's (thickness 0) lie behind it, on the same screen lines.
    expect(d.hidden.filter(isBand).length).toBeGreaterThanOrEqual(4);
  });
  it('Front sees the broad faces edge-on: the long glue lines are hidden (they graze the wood), none visible', () => {
    const d = drawView([four], FRONT, undefined, { bandTypes: types });
    const plain = drawView([{ ...four, bands: [] }], FRONT);
    // Each long glue line at thickness 0 and at the thickness projects onto the outline's line there: on that screen line
    // the near outline edge stays the one visible segment (on width max's plane, so tagged), and the far outline edge and
    // the two glue lines are hidden, all three tagged.
    for (const t of [0, 0.75]) {
      expect(find(d.visible, FRONT, four, [0, 0, t], [36, 0, t]).map((s) => s.feature)).toEqual(['p:band:maple']);
      const h = find(d.hidden, FRONT, four, [0, 0, t], [36, 0, t]);
      expect(h).toHaveLength(3);
      expect(h.every((s) => s.feature === 'p:band:maple')).toBe(true);
    }
    expect(d.visible).toHaveLength(plain.visible.length);
    expect(d.hidden).toHaveLength(plain.hidden.length + 4);   // the end glue lines run along the view: points, not drawn
  });
  it('outline edges on a straight banded side carry the tag; every other edge has no feature key', () => {
    const b = part([{ side: W0, type: BUILT_IN_BAND_ID }]);
    const d = drawView([b], ISO, undefined, { bandTypes: types });
    const all = [...d.visible, ...d.hidden];
    expect(all).toHaveLength(12);
    const onW0: [[number, number, number], [number, number, number]][] = [
      [[0, 0, 0], [36, 0, 0]], [[0, 0, 0.75], [36, 0, 0.75]], [[0, 0, 0], [0, 0, 0.75]], [[36, 0, 0], [36, 0, 0.75]],
    ];
    for (const [a, e] of onW0) {
      const hit = find(all, ISO, b, a, e);
      expect(hit).toHaveLength(1);
      expect(hit[0]!.feature).toBe('p:band:band-iron-on');
    }
    const untagged = all.filter((s) => !isBand(s));
    expect(untagged).toHaveLength(8);
    expect(untagged.every((s) => !('feature' in s))).toBe(true);
  });
  it('a corner edge takes the first side\'s tag (BAND_SIDES order), once', () => {
    const corner = (b: Board, d: Drawing) => find([...d.visible, ...d.hidden], FRONT, b, [0, 0, 0], [0, 0, 0.75]);
    // In Front, (length 0, width 0) is the FAR corner: hidden behind (length 0, width 20), which shares its screen line.
    const one = part(solid(W0, L0));
    const d1 = drawView([one], FRONT, undefined, { bandTypes: types });
    const h1 = find(d1.hidden, FRONT, one, [0, 0, 0], [0, 0, 0.75]);
    expect(h1).toHaveLength(1);
    expect(h1[0]!.feature).toBe('p:band:maple');
    expect(corner(one, d1).filter((s) => s.feature === 'p:band:maple')).toHaveLength(2);   // the far edge once, the near once
    const mixed = part([{ side: W0, type: BUILT_IN_BAND_ID }, { side: L0, type: 'maple' }]);
    expect(bandFaults(mixed, types)).toEqual([]);
    const d2 = drawView([mixed], FRONT, undefined, { bandTypes: types });
    const h2 = find(d2.hidden, FRONT, mixed, [0, 0, 0], [0, 0, 0.75]);
    expect(h2).toHaveLength(1);
    expect(h2[0]!.feature).toBe('p:band:band-iron-on');   // width-min comes first
    // The near edge (length 0, width 20) lies on length-min's plane only.
    const v2 = find(d2.visible, FRONT, mixed, [0, 20, 0], [0, 20, 0.75]);
    expect(v2).toHaveLength(1);
    expect(v2[0]!.feature).toBe('p:band:maple');
    // Seen in Side, the same far corner edge: hidden, the first side's tag.
    const s2 = drawView([mixed], SIDE, undefined, { bandTypes: types });
    const hs = find(s2.hidden, SIDE, mixed, [0, 0, 0], [0, 0, 0.75]);
    expect(hs).toHaveLength(1);
    expect(hs[0]!.feature).toBe('p:band:band-iron-on');
  });
  it('tape on a side with rounded corners: its straight outline edges carry the band tag, the arcs keep theirs (final review 2)', () => {
    // A side whose stretch carries round its corner arcs is more than one chord; its straight chord still lies on the plane.
    const corners = (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) =>
      ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: 2 }) })));
    const b = part([{ side: W0, type: BUILT_IN_BAND_ID }], { curves: corners });
    expect(bandFaults(b, types)).toEqual([]);
    const d = drawView([b], TOP, undefined, { bandTypes: types });
    const all = [...d.visible, ...d.hidden];
    const T = 0.75;
    // The near (top) straight edge at width 0, visible, tagged; the far one lies behind it on the same screen line.
    const near = find(d.visible, TOP, b, [2, 0, T], [34, 0, T]);
    expect(near).toHaveLength(1);
    expect(near[0]!.feature).toBe('p:band:band-iron-on');
    // Every band-tagged segment is one of those straight edges at width 0: none elsewhere, none on an arc.
    const bands = all.filter(isBand);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    const onW0 = find(all, TOP, b, [2, 0, T], [34, 0, T]);
    expect(bands.every((s) => onW0.includes(s))).toBe(true);
    expect(onW0.every((s) => s.feature === 'p:band:band-iron-on')).toBe(true);
    // The corner arcs keep their own curve tags, all four of them.
    const curveTags = new Set(all.flatMap((s) => (s.feature?.includes(':curve:') ? [s.feature] : [])));
    expect([...curveTags].sort()).toEqual(['p:curve:cmaxmax', 'p:curve:cmaxmin', 'p:curve:cminmax', 'p:curve:cminmin']);
  });
  it('no band types → no band segments: exactly what a band-free copy draws', () => {
    const plain = { ...four, bands: [] };
    for (const v of [FRONT, SIDE, TOP, ISO]) {
      expect(drawView([four], v)).toEqual(drawView([plain], v));
      expect(drawView([four], v, undefined, { bandTypes: [] })).toEqual(drawView([plain], v));
      expect(drawView([plain], v, undefined, { bandTypes: types })).toEqual(drawView([plain], v));
    }
  });
  it('a section removes the far side\'s glue line', () => {
    // Turned 90°: width runs along world X, so a Side section (x = at) cuts across the width.
    const turned = part(solid(W0, W1), { rotation: 90 });
    expect(near(W(turned, 0, 10, 0)[0], 10)).toBe(true);
    const section = { axis: 'side' as const, at: 10, flip: false };
    expect(W(turned, 0, 0, 0)[0] < W(turned, 0, 20, 0)[0]).toBe(true);   // width min is kept (x <= 10)
    const d = drawView([turned], TOP, undefined, { bandTypes: types, section });
    const glue = (w: number) => [...d.visible, ...d.hidden].filter((s) => s.feature === 'p:band:maple')
      .filter((s) => near(s.a[0], W(turned, 0, w, 0.75)[0]) && near(s.b[0], s.a[0]));
    expect(glue(0.25).length).toBeGreaterThan(0);
    expect(glue(19.75)).toHaveLength(0);
    const whole = drawView([turned], TOP, undefined, { bandTypes: types });
    expect([...whole.visible, ...whole.hidden].filter((s) => s.feature === 'p:band:maple' && near(s.a[0], W(turned, 0, 19.75, 0.75)[0]) && near(s.b[0], s.a[0])).length).toBeGreaterThan(0);
  });
  it('a mirrored instance: the glue line lies where the reflected width-min side lands (the world part\'s width-max)', () => {
    const inner = part(solid(W0), { posture: 'upright', id: 'q' });
    expect(mirrorDim(inner)).toBe('width');
    const def: Definition = { id: 'd', boards: [inner], instances: [] };
    const doc = (mirrored: boolean): SloydDocument => ({
      ...createDocument('M'), bandTypes: types, definitions: [def],
      instances: [{ id: 'i', name: 'A', definition: 'd', position: [40, 0, 0], rotation: 0, ...(mirrored ? { mirrored: true } : {}) }],
    });
    const glueX = (d: Drawing) => d.visible.filter((s) => s.feature === 'i/q:band:maple' && near(s.a[0], s.b[0])).map((s) => s.a[0]);
    const plainParts = worldParts(doc(false));
    const mirroredParts = worldParts(doc(true));
    const xu = glueX(drawView(plainParts, FRONT, undefined, { bandTypes: types }));
    const xm = glueX(drawView(mirroredParts, FRONT, undefined, { bandTypes: types }));
    // Unmirrored: width along +X from x = 40, the glue line 1/4" in from width min. Visible on the near face only.
    expect(xu.filter((x) => near(x, 40.25))).toHaveLength(1);
    // Mirrored across the instance's x = 0: reflected independently, 2·40 − 40.25.
    expect(xm.filter((x) => near(x, 2 * 40 - 40.25))).toHaveLength(1);
    expect(xm.filter((x) => near(x, 40.25))).toHaveLength(0);
    expect(mirroredParts[0]!.id).toBe('i/q');   // the world part's id is its occurrence path
    expect(mirroredParts[0]!.bands).toEqual([{ side: W1, type: 'maple' }]);
  });
  it('faulted bands draw nothing: too-thick ends', () => {
    const thick: BandType = { ...maple, id: 'thick', thickness: 18 };
    const b = part([{ side: L0, type: 'thick' }, { side: L1, type: 'thick' }]);
    const all = [...types, thick];
    expect(bandFaults(b, all).map((f) => f.kind)).toEqual(['too-thick', 'too-thick']);
    for (const v of [FRONT, SIDE, TOP, ISO]) {
      const d = drawView([b], v, undefined, { bandTypes: all });
      expect([...d.visible, ...d.hidden].filter(isBand)).toHaveLength(0);
      expect(d).toEqual(drawView([{ ...b, bands: [] }], v));
    }
  });
});
