import { describe, expect, it } from 'vitest';
import { cornerCurve, createBoard, migrateDocument } from './document';
import type { Board, ProfileCut, ProfileSide } from './types';
import { geometryBoard, profileFaults } from './profiles';
import { builtSwept } from './sweep';
import { boardBodies } from './bodies';
import { isSwept } from './profilePath';

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
}))).boards[0]!;
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
