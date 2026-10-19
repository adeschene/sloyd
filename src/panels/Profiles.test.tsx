import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import {
  cornerCurve, createBoard, createDocument, curveFaults, holeFaults, defaultProfile, profileCurve, profileFields, profileOf, profileFromFields, profileToFields, profileAsCurve, geometryBoard,
  migrateDocument, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
import { Properties } from './Properties';
import { canonicalRun, endPos, profileFaults, travelSign } from '../document/profiles';
import { holeRefusal, pastHalfCircle, profileRefusal, refusalFor } from './curveRefusal';
import { apronArch, endToEnd as endToEndP, frontAndEnds, frontOnly, loop as loopP, stopOnCorner, stopped as stoppedRun, topCorners, twoSide, twoSideSharp } from '../document/sweepFixtures';
import { sweptLine } from '../document/curveText';
import { formatLength } from '../units/length';
import { isSwept } from '../document/profilePath';

const top = (over: Partial<Board> = {}) => createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard(b.id);
  render(<Properties />);
};
const add = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add profile' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const profiles = () => (useStore.getState().doc.boards[0] as Board).profiles;
const typeInto = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  const el = screen.getByLabelText(label);
  await user.clear(el); await user.type(el, `${text}{Enter}`);
  return el;
};
/** A small, shallow bore drilled down into the top face, `inset` in from the width max side, mid-length. */
const bore = (inset: number): HoleRow => ({
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min', station: 18,
  count: 1, pitch: 0, acrossFrom: 'max', inset,
});
const selected = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).selectedOptions[0]!.textContent;
const ITEMS = ['Roundover', 'Cove', 'Roman ogee', 'Bead', 'Thumbnail'];

describe('the Profiles section (edge profiles spec §3)', () => {
  it('adds a Roundover on the top long edge in one undo entry, with its bench line', async () => {
    const user = userEvent.setup();
    open(top());
    const before = useStore.getState().past.length;
    await add(user, 'Roundover');
    expect(profileToFields(profiles()[0]!)).toMatchObject({ kind: 'roundover', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.25 });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getByText(/^Roundover 1\/4" on the edge between the width face \(max side\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Profiles/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove profile \(Roundover 1\/4" on the edge/ })).toBeInTheDocument();
  });

  it('a stored through-length corner appears here as a Roundover (Review Focus 1)', () => {
    const c: CurveCut = { id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 }) };
    open(top({ profiles: [{ id: 'c1', ...profileOf(c)! }] }));
    expect((screen.getByLabelText('Profile') as HTMLSelectElement).value).toBe('roundover');
    expect(profileAsCurve(profiles()[0]!)).toEqual(c);
  });

  it('the stored through-length corner of a v17 file appears as a Roundover row after load', () => {
    const c: CurveCut = { id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 }) };
    const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), version: 17, boards: [top({ curves: [c] })] }));
    delete raw.boards[0].profiles;
    useStore.getState().replaceDocument(migrateDocument(raw));
    useStore.getState().selectBoard('top');
    render(<Properties />);
    expect(screen.getByRole('button', { name: /^Remove profile \(Roundover 3\/8"/ })).toBeInTheDocument();
    expect((useStore.getState().doc.boards[0] as Board).curves).toEqual([]);
  });

  it('Remove removes the profile', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.click(screen.getByRole('button', { name: /^Remove profile \(/ }));
    expect(profiles()).toEqual([]);
  });

  it('Radius edits the size; Fillet shows Facing; Facing flips the top', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    await typeInto(user, 'Radius', '3/8');
    expect(profileToFields(profiles()[0]!)!.size).toBe(0.375);
    expect(screen.queryByLabelText('Facing')).toBeNull();
    await typeInto(user, 'Fillet', '1/16');
    expect(profileToFields(profiles()[0]!)!.fillet).toBe(0.0625);
    await user.selectOptions(screen.getByLabelText('Facing'), 'u');
    expect(profileToFields(profiles()[0]!)!.facing).toBe('u');
  });

  it('a filleted roundover facing u, set back to no fillet, is stored at facing v: byte-equal to the corner', async () => {
    const user = userEvent.setup();
    const p = { through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'u', size: 0.25, fillet: 0.0625 } as const;
    open(top({ profiles: [{ id: 'c1', ...profileFromFields(p) }] }));
    await typeInto(user, 'Fillet', '0');
    expect(profileAsCurve(profiles()[0]!)).toEqual({ id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }) });
    expect(screen.queryByLabelText('Facing')).toBeNull();
  });

  it('Side moves the profile, keeping its size (the Edge select, ported)', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.selectOptions(screen.getByLabelText('Side'), 'Length min end');
    expect(profileToFields(profiles()[0]!)).toMatchObject({ kind: 'cove', through: 'width', uFrom: 'min', vFrom: 'max', size: 0.375 });
  });

  it('Face moves the profile to the bottom, keeping its size and side', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.selectOptions(screen.getByLabelText('Face'), 'Bottom');
    expect(profileToFields(profiles()[0]!)).toMatchObject({ kind: 'cove', through: 'length', uFrom: 'max', vFrom: 'min', size: 0.375 });
    expect(profiles()[0]!.face).toBe('min');
  });

  it('a Side change that would run off is refused in the sizer\'s words, nothing stored (the Edge select, ported)', async () => {
    const user = userEvent.setup();
    // A 3/4" radius fits the top long edge's 20" × 4" section, but not the end edge's 1/2" × 4" one.
    open(top({ length: 0.5, width: 20, thickness: 4 }));
    await add(user, 'Roundover');
    await typeInto(user, 'Radius', '3/4');
    const stored = profiles()[0]!;
    await user.selectOptions(screen.getByLabelText('Side'), 'Length min end');
    expect(profiles()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent("A radius can't run past");
    expect(selected('Side')).toBe('Width max side');
  });

  it('Profile change keeps the edge and takes the new kind\'s defaults', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    const id = profiles()[0]!.id;
    await user.selectOptions(screen.getByLabelText('Profile'), 'thumbnail');
    expect(profileToFields(profiles()[0]!)).toMatchObject({ kind: 'thumbnail', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.75, depth: 0.25 });
    expect(profiles()[0]!.id).toBe(id);
  });

  it('a Profile change from an ogee facing u to a Roundover is stored at facing v: byte-equal to the corner', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roman ogee');
    await user.selectOptions(screen.getByLabelText('Facing'), 'u');
    expect(profileToFields(profiles()[0]!)!.facing).toBe('u');
    const id = profiles()[0]!.id;
    await user.selectOptions(screen.getByLabelText('Profile'), 'roundover');
    expect(profileAsCurve(profiles()[0]!)).toEqual({ id, ...cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }) });
  });

  // The brief's "a Profile change whose default would fault" (Review Focus 4): UNREACHABLE as a curve fault. A default is
  // scaled so each canonical extent fits half the dimension it runs along, so it lies in one quadrant of the edge's
  // cross-section — it cannot run off, and a quadrant waste cannot cut the face through. Measured over every kind, edge
  // and facing on these boards: no default faults, none passes a half circle. (Ruling recorded in the task-7 report.)
  it('every kind\'s default fits every edge and facing, down to a 0.1" × 3" rail', () => {
    for (const [length, width, thickness] of [[36, 0.1, 3], [36, 3, 0.1], [0.1, 0.1, 0.1], [36, 20, 0.75]] as const) {
      const b = createBoard({ id: 'r', name: 'Rail', length, width, thickness });
      for (const kind of PROFILE_KINDS) for (const edge of PROFILE_EDGES) for (const facing of ['u', 'v'] as const) {
        const d = defaultProfile(b, kind, edge, facing);
        expect(curveFaults(b, d), `${kind} ${JSON.stringify(edge)} ${facing}`).toEqual([]);
        expect(pastHalfCircle(d)).toBe(false);
      }
    }
  });

  it('a Profile change whose default puts a hole into its waste is refused, nothing stored', async () => {
    const user = userEvent.setup();
    // 0.3" in from the edge: clear of the 1/4" roundover's waste, inside the 3/8" cove's.
    const b = top({ holes: [bore(0.3)] });
    expect(holeFaults(b, b.holes[0]!)).toEqual([]);
    open(b);
    await add(user, 'Roundover');
    const stored = profiles()[0]!;
    await user.selectOptions(screen.getByLabelText('Profile'), 'cove');
    expect(profiles()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 1 into the cove — move it first.');
    expect((screen.getByLabelText('Profile') as HTMLSelectElement).value).toBe('roundover');
  });

  // fu 388 (the user's ruling: "greying out a choice makes sense"): the Curves Kind select's rule — options judged only
  // while the select has focus, a refused one disabled with the refusal's own words up to its dash.
  const profileSelect = () => screen.getByLabelText('Profile') as HTMLSelectElement;
  it('a Profile option whose default would be refused is disabled and says why (fu 388)', async () => {
    const user = userEvent.setup();
    open(top({ holes: [bore(0.3)] }));
    await add(user, 'Roundover');
    act(() => profileSelect().focus());
    expect(screen.getByRole('option', { name: 'Cove — puts hole 1 into the cove' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Roundover' })).toBeEnabled();
  });
  it('Profile options are judged on focus, not on every render, and dropped on blur (fu 388)', async () => {
    const user = userEvent.setup();
    open(top({ holes: [bore(0.3)] }));
    await add(user, 'Roundover');
    expect(screen.getByRole('option', { name: 'Cove' })).toBeEnabled();     // not judged yet
    act(() => profileSelect().focus());
    expect(screen.getByRole('option', { name: 'Cove — puts hole 1 into the cove' })).toBeDisabled();
    act(() => profileSelect().blur());
    expect(screen.getByRole('option', { name: 'Cove' })).toBeEnabled();
  });
  it('a profile moved under the focused select is judged afresh (fu 388)', async () => {
    const user = userEvent.setup();
    open(top({ holes: [bore(0.3)] }));
    await add(user, 'Roundover');
    const stored = profiles()[0]!;
    act(() => profileSelect().focus());
    expect(screen.getByRole('option', { name: 'Cove — puts hole 1 into the cove' })).toBeDisabled();
    // Moved to the width MIN long edge, far from the bore: the cove fits there.
    const moved = profileFromFields({ ...profileToFields(stored), uFrom: 'min' });
    act(() => useStore.getState().updateProfile('top', stored.id, moved));
    expect(screen.getByRole('option', { name: 'Cove' })).toBeEnabled();
  });

  it('Thumbnail Depth must be less than its Reach', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Thumbnail');
    await typeInto(user, 'Depth', '1');
    expect(profileToFields(profiles()[0]!)!.depth).toBe(0.25);
    expect(screen.getByRole('alert')).toHaveTextContent('Depth must be less than the reach');
  });

  it('Thumbnail Reach must be more than its Depth', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Thumbnail');
    await typeInto(user, 'Reach', '1/4');
    expect(profileToFields(profiles()[0]!)!.size).toBe(0.75);
    expect(screen.getByRole('alert')).toHaveTextContent('Reach must be more than the depth');
  });

  it('Bead Quirk must be more than 0 (the field\'s own guard); a Radius that runs off is refused', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Bead');
    await typeInto(user, 'Quirk', '0');
    expect(profileToFields(profiles()[0]!)!.fillet).toBe(0.0625);
    expect(screen.getByRole('alert')).toHaveTextContent('Must be greater than zero');
    await typeInto(user, 'Radius', '1');
    expect(profileToFields(profiles()[0]!)!.size).toBe(0.25);
  });

  it('a fault a resize caused is kept and noted', () => {
    const c = { id: 'c1', ...profileOf(defaultProfile(top(), 'roundover'))! };
    open(top({ thickness: 0.125, profiles: [c] }));
    expect(profiles()[0]).toEqual(c);
    expect(screen.getByRole('status')).toHaveTextContent(/at this size\.$/);
  });

  it('every preset is offered on a plain top', async () => {
    const user = userEvent.setup();
    open(top({ profiles: [], holes: [] }));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    for (const item of ITEMS) expect(screen.getByRole('button', { name: item })).toBeInTheDocument();
  });

  // Final fix F2 (spec I1): a preset whose default puts a hole into its waste on the top long edge is not withheld any more —
  // it takes the next edge where it fits.
  it('a preset whose default puts a hole into its waste skips that edge', async () => {
    const user = userEvent.setup();
    // The bore sits clear of the roundover's waste and inside every other default's (the bore is clean on the stored part).
    const b = top({ holes: [bore(0.3)] });
    expect(holeFaults(b, b.holes[0]!)).toEqual([]);
    open(b);
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByRole('button', { name: 'Roundover' })).toHaveTextContent(/, Top · Width max side$/);
    for (const item of ['Cove', 'Roman ogee', 'Bead', 'Thumbnail']) {
      expect(screen.getByRole('button', { name: item })).toHaveTextContent(/, Top · Width min side$/);
    }
    await user.click(screen.getByRole('button', { name: 'Cove' }));
    expect(profileToFields(profiles()[0]!)).toMatchObject({ kind: 'cove', through: 'length', uFrom: 'min', vFrom: 'max' });
  });

  it('menu details read the project units (Review Focus 5)', async () => {
    const user = userEvent.setup();
    open(top());
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('1/4" radius, Top · Width max side')).toBeInTheDocument();
    expect(screen.getByText('1/4" radius, 1/16" quirk, Top · Width max side')).toBeInTheDocument();
    expect(screen.getByText('3/8", Top · Width max side')).toBeInTheDocument();
    expect(screen.getByText('3/4" × 1/4", Top · Width max side')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('6 mm radius, Top · Width max side')).toBeInTheDocument();
  });

  it('the bench line reads mm in a metric project', async () => {
    const user = userEvent.setup();
    open(top());
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await add(user, 'Roundover');
    expect(screen.getByText(/^Roundover 6 mm on the edge/)).toBeInTheDocument();
  });
});

describe('holeRefusal names a profile by its own word (Task 7 fix round 1; R3)', () => {
  it('a roundover added over a bore reads the roundover, never the rounded corner', () => {
    const b = top({ holes: [bore(0.1)] });
    const after = { ...b, profiles: [{ id: 'p1', ...profileOf(defaultProfile(b, 'roundover'))! }] };
    expect(holeRefusal(b, after)).toBe('Puts hole 1 into the roundover — move it first.');
  });
});

// Carried from the Task 6 review: the select-change sizer (control null) of refusalFor.
describe('refusalFor with no control (a select change)', () => {
  it('a thickness corner names its Radius (the cornerFields fallback)', () => {
    const b = createBoard({ id: 'a', name: 'Apron', length: 30, width: 5, thickness: 0.75 });
    const curve: CurveCut = { id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) };
    const next = cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 6 });
    expect(profileFields(curve)).toBeNull();
    expect(refusalFor({ ...b, curves: [curve] }, curve, next, null)).toMatch(/^A radius can't run past .* — reduce it first\.$/);
  });
  it('an ogee change names its Size; a thumbnail change its Reach', () => {
    const b = top();
    const profile = { id: 'c1', ...profileOf(defaultProfile(b, 'roundover'))! };
    const curve = profileAsCurve(profile);
    const view = geometryBoard({ ...b, profiles: [profile] });
    const at = { through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v' } as const;
    const ogee = profileCurve({ ...at, kind: 'ogee', size: 2, fillet: 0 });
    const thumb = profileCurve({ ...at, facing: 'u', kind: 'thumbnail', size: 2, depth: 0.25 });
    expect(refusalFor(view, curve, ogee, null)).toMatch(/^Runs past .* — reduce the Size first\.$/);
    expect(refusalFor(view, curve, thumb, null)).toMatch(/^Runs past .* — reduce the Reach first\.$/);
  });
});

// Profile runs a2, Task 8: Face, Side, Run, Start and Stop.
describe('the stopped Profiles row (profile runs a2)', () => {
  const shelf = (over: Partial<Board> = {}) => createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75, ...over });
  const dims = shelf();
  /** A stopped Roundover on the top, width max side, from `a` to `b` along the length (stations from the min end). */
  const stoppedP = (id: string, a: number, b: number, over: Record<string, unknown> = {}) => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    return { id, ...base, run: canonicalRun(dims, base.face, { start: at(a), end: at(b) }), ...over } as ReturnType<typeof profiles>[number];
  };
  const stationsOf = (i = 0) => {
    const r = profiles()[i]!.run as { start: Parameters<typeof endPos>[1]; end: Parameters<typeof endPos>[1] };
    return { start: endPos(dims, r.start), end: endPos(dims, r.end) };
  };
  const START = 'Start (from the length min end)';
  const STOP = 'Stop (from the length min end)';
  const stopSel = (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('Run'), 'Stopped');

  it('Run -> Stopped seeds 3 to L - 3 on a 30" shelf; the bench line reads from 3" to 27" (stopped)', async () => {
    const user = userEvent.setup();
    open(shelf());
    await add(user, 'Roundover');
    expect(screen.queryByLabelText(START)).toBeNull();                       // 9: an End to end row has no Start or Stop
    expect(screen.queryByLabelText(STOP)).toBeNull();
    await stopSel(user);
    const s = stationsOf();
    expect([Math.min(s.start, s.end), Math.max(s.start, s.end)]).toEqual([3, 27]);
    expect(screen.getByText(/from 3" to 27" \(stopped\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(START)).toHaveValue('3"');
    expect(screen.getByLabelText(STOP)).toHaveValue('27"');
    expect(profiles()[0]!.run).toEqual(canonicalRun(dims, 'max', profiles()[0]!.run as never));
  });

  it('a run shorter than 12" seeds a quarter of it', async () => {
    const user = userEvent.setup();
    open(shelf({ length: 8 }));
    await add(user, 'Roundover');
    await stopSel(user);
    const s = stationsOf();
    expect([Math.min(s.start, s.end), Math.max(s.start, s.end)]).toEqual([2, 6]);
  });

  it('Start 5 writes at: 5 from the min end, in canonical order', async () => {
    const user = userEvent.setup();
    open(shelf({ profiles: [stoppedP('p1', 3, 27)] }));
    await typeInto(user, START, '5');
    const r = profiles()[0]!.run as { start: { from: string; at: number }; end: { from: string; at: number } };
    // The width max side runs the other way (travelSign -1): start is the HIGH station.
    expect(stationsOf()).toEqual({ start: 27, end: 5 });
    expect(r.end).toMatchObject({ from: 'min', at: 5 });
    expect(profiles()[0]!.run).toEqual(canonicalRun(dims, 'max', profiles()[0]!.run as never));
    expect(screen.getByText(/from 5" to 27" \(stopped\)/)).toBeInTheDocument();
  });

  it('Stop 31 is refused with the stop-off words, nothing stored', async () => {
    const user = userEvent.setup();
    const p = stoppedP('p1', 3, 27);
    open(shelf({ profiles: [p] }));
    await typeInto(user, STOP, '31');
    expect(profiles()[0]).toEqual(p);
    expect(screen.getByText('A stop runs off the part — move it first.')).toBeInTheDocument();
  });

  it('a second stopped profile overlapping the first is refused with the overlap words', async () => {
    const user = userEvent.setup();
    const a = stoppedP('pa', 3, 15);
    const b = stoppedP('pb', 20, 27);
    open(shelf({ profiles: [a, b] }));
    const row = screen.getAllByLabelText(START)[1]!;
    await user.clear(row); await user.type(row, '10{Enter}');
    expect(profiles()[1]).toEqual(b);
    expect(screen.getByText('Overlaps another profile on this edge — move it first.')).toBeInTheDocument();
    // Touching is not overlap.
    await user.clear(row); await user.type(row, '15{Enter}');
    expect(stationsOf(1)).toEqual({ start: 27, end: 15 });
  });

  it('shrinking the part to 20" notes the 27" stop, and Stop 15 edits it back', async () => {
    const user = userEvent.setup();
    open(shelf({ profiles: [stoppedP('p1', 3, 27)] }));
    act(() => useStore.getState().updateBoard('top', { length: 20 }));
    expect(screen.getByRole('status')).toHaveTextContent('A stop runs off the part at this size.');
    expect(screen.getByText(/— check: a stop runs off the part/)).toBeInTheDocument();    // the bench line, from the view's curve
    expect(profiles()[0]).toEqual(stoppedP('p1', 3, 27));                                  // kept, not clamped
    await typeInto(user, STOP, '15');
    const dims20 = shelf({ length: 20 });
    const r = profiles()[0]!.run as Parameters<typeof canonicalRun>[2];
    expect([endPos(dims20, r.start), endPos(dims20, r.end)].sort((x, y) => x - y)).toEqual([3, 15]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a Side change keeps the stations', async () => {
    const user = userEvent.setup();
    open(shelf({ profiles: [stoppedP('p1', 3, 27)] }));
    await user.selectOptions(screen.getByLabelText('Side'), 'Width min side');
    const r = profiles()[0]!.run as { start: { side: { across: string; from: string } } };
    expect(r.start.side).toEqual({ across: 'width', from: 'min' });
    expect(stationsOf()).toEqual({ start: 3, end: 27 });                                   // travelSign +1 now
  });

  it('a Face change keeps the stations too', async () => {
    const user = userEvent.setup();
    open(shelf({ profiles: [stoppedP('p1', 3, 27)] }));
    await user.selectOptions(screen.getByLabelText('Face'), 'Bottom');
    expect(profiles()[0]!.face).toBe('min');
    expect(stationsOf()).toEqual({ start: 3, end: 27 });
  });

  it('Run -> End to end drops the stations', async () => {
    const user = userEvent.setup();
    open(shelf({ profiles: [stoppedP('p1', 3, 27)] }));
    await user.selectOptions(screen.getByLabelText('Run'), 'End to end');
    expect(profiles()[0]!.run).toMatchObject({ start: { through: 'min' }, end: { through: 'max' } });
    expect(screen.queryByLabelText(START)).toBeNull();
  });

  it('each refused option is greyed with its reason, on focus only (fu 388)', async () => {
    const other = stoppedP('pb', 3, 15);                                                  // B, on the same edge
    const a = stoppedP('pa', 20, 27);
    const under = { ...stoppedP('pc', 3, 27), id: 'pc', face: 'min' as const };           // C, the same side on the bottom
    open(shelf({ profiles: [other, a, under] }));
    const row = 1;                                                                        // A's row (20..27)
    const sel = (l: string) => screen.getAllByLabelText(l)[row] as HTMLSelectElement;
    expect(within(sel('Run')).getByRole('option', { name: 'End to end' })).toBeEnabled();  // not judged yet
    act(() => sel('Run').focus());
    expect(within(sel('Run')).getByRole('option', { name: 'End to end — overlaps another profile on this edge' })).toBeDisabled();
    act(() => sel('Run').blur());
    expect(within(sel('Run')).getByRole('option', { name: 'End to end' })).toBeEnabled();
    act(() => sel('Face').focus());
    expect(within(sel('Face')).getByRole('option', { name: 'Bottom — overlaps another profile on this edge' })).toBeDisabled();
    expect(within(sel('Face')).getByRole('option', { name: 'Top' })).toBeEnabled();
    act(() => sel('Side').focus());
    // The end sides run along the 10" width: a 27" stop runs off.
    expect(within(sel('Side')).getByRole('option', { name: 'Length min end — a stop runs off the part' })).toBeDisabled();
    expect(within(sel('Side')).getByRole('option', { name: 'Width min side' })).toBeEnabled();
  });
});

// Final fix F3: a crossed station is refused in the row's own words (as Depth and Reach are), never silently swapped.
describe('crossed stations (final fix F3)', () => {
  const START = 'Start (from the length min end)';
  const STOP = 'Stop (from the length min end)';
  const shelf = () => createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
  const stopped3to27 = () => {
    const b = shelf();
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    return { ...b, profiles: [{ id: 'p1', ...base, run: canonicalRun(b, 'max', { start: at(3), end: at(27) }) }] };
  };
  it('a Start past the Stop is refused, nothing stored', async () => {
    const user = userEvent.setup();
    const b = stopped3to27();
    open(b);
    const el = await typeInto(user, START, '28');
    expect(profiles()[0]).toEqual(b.profiles[0]);
    expect(screen.getByText('Start must be before the Stop')).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(STOP)).toHaveValue('27"');
  });
  it('a Stop before the Start is refused, nothing stored; a Start AT the Stop too', async () => {
    const user = userEvent.setup();
    const b = stopped3to27();
    open(b);
    await typeInto(user, STOP, '2');
    expect(profiles()[0]).toEqual(b.profiles[0]);
    expect(screen.getByText('Stop must be after the Start')).toBeInTheDocument();
    await typeInto(user, START, '27');
    expect(profiles()[0]).toEqual(b.profiles[0]);
    expect(screen.getByText('Start must be before the Stop')).toBeInTheDocument();
  });
});

// Final fix F4 (spec I2, Amended (implementation, a2)): a station typed AT an end of the part makes that end a through end.
describe('a station at an end of the part runs out through it (final fix F4)', () => {
  const START = 'Start (from the length min end)';
  const STOP = 'Stop (from the length min end)';
  const dims = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
  const stopped3to27 = () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    return { ...dims, profiles: [{ id: 'p1', ...base, run: canonicalRun(dims, 'max', { start: at(3), end: at(27) }) }] };
  };
  type End = { side: object; through?: 'min' | 'max'; from?: string; at?: number };
  const ends = () => { const r = profiles()[0]!.run as { start: End; end: End }; return [r.start, r.end]; };
  it('Start 0 makes the min end a through end; the fields read 0 and 27; Start 5 makes it a station again', async () => {
    const user = userEvent.setup();
    open(stopped3to27());
    await typeInto(user, START, '0');
    expect(ends().filter((e) => e.through !== undefined).map((e) => e.through)).toEqual(['min']);
    expect(profiles()[0]!.run).toEqual(canonicalRun(dims, 'max', profiles()[0]!.run as never));
    expect(screen.getByText(/from the length min end to 27" \(stopped\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(START)).toHaveValue('0"');
    expect(screen.getByLabelText(STOP)).toHaveValue('27"');
    expect(screen.queryByRole('status')).toBeNull();                                         // no stop-off
    await typeInto(user, START, '5');
    expect(ends().every((e) => e.through === undefined)).toBe(true);
    expect(screen.getByText(/from 5" to 27" \(stopped\)/)).toBeInTheDocument();
  });
  it('Stop at the full length makes the max end a through end; the field reads 30"', async () => {
    const user = userEvent.setup();
    open(stopped3to27());
    await typeInto(user, STOP, '30');
    expect(ends().filter((e) => e.through !== undefined).map((e) => e.through)).toEqual(['max']);
    expect(screen.getByText(/from 3" to the length max end \(stopped\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(STOP)).toHaveValue('30"');
    await typeInto(user, STOP, '20');
    expect(ends().every((e) => e.through === undefined)).toBe(true);
    expect(screen.getByText(/from 3" to 20" \(stopped\)/)).toBeInTheDocument();
  });
  it('both ends at the part\'s ends is End to end (the Run select says so)', async () => {
    const user = userEvent.setup();
    open(stopped3to27());
    await typeInto(user, START, '0');
    await typeInto(user, STOP, '30');
    expect(profiles()[0]!.run).toMatchObject({ start: { through: 'min' }, end: { through: 'max' } });
    expect(selected('Run')).toBe('End to end');
    expect(screen.queryByLabelText(START)).toBeNull();
  });
  // F4 fix 1: a metric field shows whole mm, so "the full length" is what the field SHOWS for it (the reads-the-same rule,
  // fu 354): a 36" part's Stop shows 914 mm, and 914 mm (35.984") is its max end, not a station 0.4 mm short of it.
  it('a 36" part in a metric project: typing the 914 mm the field shows is the max end', async () => {
    const user = userEvent.setup();
    const b = stopped3to27();
    open({ ...b, length: 36 });
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await typeInto(user, STOP, '914');
    expect(ends().filter((e) => e.through !== undefined).map((e) => e.through)).toEqual(['max']);
    expect(screen.getByLabelText(STOP)).toHaveValue('914 mm');
    // With the Stop at the end, the same 914 typed into Start is AT the Stop: refused (F3), never two through-max ends.
    const stored = profiles()[0];
    await typeInto(user, START, '914');
    expect(profiles()[0]).toEqual(stored);
    expect(screen.getByText('Start must be before the Stop')).toBeInTheDocument();
  });
  it('a metric part\'s full length typed in mm is the end too', async () => {
    const user = userEvent.setup();
    const b = stopped3to27();
    open({ ...b, length: 763 / 25.4 });                                                       // a 763 mm part, as typed
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await typeInto(user, STOP, '763');
    expect(ends().filter((e) => e.through !== undefined).map((e) => e.through)).toEqual(['max']);
  });
});

// Final fix F5: " at this size." only for a fault a resize can cause (a stop off the part, a curve fault), never an overlap.
describe('the row note (final fix F5)', () => {
  it('stacked identical profiles (an a1 file; P12 faults them on load) read "Overlaps another profile on this edge."', () => {
    const b = top();
    const p = profileOf(defaultProfile(b, 'roundover'))!;
    open({ ...b, profiles: [{ id: 'p1', ...p }, { id: 'p2', ...p }] });
    const notes = screen.getAllByRole('status');
    expect(notes).toHaveLength(2);
    for (const n of notes) expect(n).toHaveTextContent(/^Overlaps another profile on this edge\.$/);
  });
  it('a curve fault and a stop off the part keep " at this size."', () => {
    const b = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    open({ ...b, length: 20, profiles: [{ id: 'p1', ...base, run: canonicalRun(b, 'max', { start: at(3), end: at(27) }) }] });
    expect(screen.getByRole('status')).toHaveTextContent(/^A stop runs off the part at this size\.$/);
    document.body.innerHTML = '';
    open(top({ thickness: 0.125, profiles: [{ id: 'c1', ...profileOf(defaultProfile(top(), 'roundover'))! }] }));
    expect(screen.getByRole('status')).toHaveTextContent(/^Runs past .* at this size\.$/);
  });
});

describe('refusalFor reads the post-edit stored part (profile runs a2)', () => {
  const dims = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
  it('a stopped edit is judged on `after`: a plain next curve alone would be a full-length cut over the hole', () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    const mk = (a: number, b: number) => ({ id: 'p1', ...base, run: canonicalRun(dims, 'max', { start: at(a), end: at(b) }) });
    // Station 28, in the roundover's waste: clear of a run stopped at 27 (its run-out is shorter than 1"), inside a full cut.
    const stored = { ...dims, holes: [{ ...bore(0.1), station: 28 }], profiles: [mk(3, 27)] };
    expect(holeFaults(stored, stored.holes[0]!)).toEqual([]);
    const view = geometryBoard(stored);
    const curve = view.curves.find((c) => c.id === 'p1')!;
    const after = { ...stored, profiles: [mk(5, 27)] };
    const plain = profileCurve(profileToFields(mk(5, 27)));
    expect(refusalFor(view, curve, plain, null)).toBe('Puts hole 1 into the roundover — move it first.');   // the default post-edit board cannot say
    expect(refusalFor(view, curve, plain, null, after)).toBeNull();
  });

  it('the row accepts that edit (Start 5), and refuses Stop 28.5 (the run-out reaches the hole)', async () => {
    const user = userEvent.setup();
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const at = (x: number) => ({ side: { ...side }, from: 'min' as const, at: x });
    const p = { id: 'p1', ...base, run: canonicalRun(dims, 'max', { start: at(3), end: at(27) }) };
    open({ ...dims, holes: [{ ...bore(0.1), station: 28 }], profiles: [p] });
    await typeInto(user, 'Start (from the length min end)', '5');
    expect(profiles()[0]).not.toEqual(p);
    const stored = profiles()[0]!;
    await typeInto(user, 'Stop (from the length min end)', '28.5');
    expect(profiles()[0]).toEqual(stored);
    expect(screen.getByText('Puts hole 1 into the roundover — move it first.')).toBeInTheDocument();
  });
});

describe('Task 8 fix round 1', () => {
  // Final fix F2 (spec I1) reverses this fix's withhold: a preset that would overlap the profile on the top width-max edge
  // takes the next edge (the top width-min side) instead of leaving no preset at all.
  it('a preset that would overlap an existing profile on the top width-max edge takes the next edge', async () => {
    const user = userEvent.setup();
    const b = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
    open({ ...b, profiles: [{ id: 'p1', ...profileOf(defaultProfile(b, 'roundover'))! }] });
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    for (const item of ITEMS) expect(screen.getByRole('button', { name: item })).toHaveTextContent(/, Top · Width min side$/);
    expect(screen.queryByText('No profile preset fits this part.')).toBeNull();
  });

  it('editing the Stop of a mixed run (through min -> station) keeps the through end', async () => {
    const user = userEvent.setup();
    const b = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'v', size: 0.25, fillet: 0 });
    const side = (base.run as { start: { side: { across: 'width' | 'length'; from: 'min' | 'max' } } }).start.side;
    const run = canonicalRun(b, 'max', { start: { side: { ...side }, through: 'min' }, end: { side: { ...side }, from: 'min', at: 20 } });
    const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [{ ...b, profiles: [{ id: 'p1', ...base, run }] }] }));
    useStore.getState().replaceDocument(migrateDocument(raw));
    useStore.getState().selectBoard('top');
    render(<Properties />);
    await typeInto(user, 'Stop (from the length min end)', '18');
    const r = profiles()[0]!.run as { start: object; end: object };
    expect([r.start, r.end].filter((e) => 'through' in e)).toHaveLength(1);
    expect(screen.getByText(/from the length min end to 18" \(stopped\)/)).toBeInTheDocument();
  });
});

// Final fix F2 (spec I1, Amended (implementation, a2)): a preset takes the FIRST edge where its default fits — the top long
// edge first, as before; then the other top sides; then the bottom — and its menu detail names that edge.
describe('presets take the first edge that fits (final fix F2)', () => {
  const edgeOf = (i: number) => { const f = profileToFields(profiles()[i]!)!; return `${f.vFrom}:${f.through}:${f.uFrom}`; };
  /** The order: the top (vFrom max) first; within a face the default's through, then its uFrom, first. */
  const ORDER = [
    'max:length:max', 'max:length:min', 'max:width:max', 'max:width:min',
    'min:length:max', 'min:length:min', 'min:width:max', 'min:width:min',
  ];
  const roundoverOn = (b: Board, e: string, id: string) => {
    const [vFrom, through, uFrom] = e.split(':') as ['min' | 'max', 'length' | 'width', 'min' | 'max'];
    return { id, ...profileOf(defaultProfile(b, 'roundover', { through, uFrom, vFrom }))! };
  };

  it('eight Roundover clicks land on the eight edges in order, top first; then nothing fits', async () => {
    const user = userEvent.setup();
    open(top());
    const details: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      await user.click(screen.getByRole('button', { name: '+ Add profile' }));
      details.push(within(screen.getByRole('button', { name: 'Roundover' })).getByText(/radius/).textContent!);
      await user.click(screen.getByRole('button', { name: 'Roundover' }));
    }
    expect(profiles().map((_, i) => edgeOf(i))).toEqual(ORDER);
    // Four different edges from four clicks, each named in the row's own Face and Side words.
    expect(details.slice(0, 4)).toEqual([
      '1/4" radius, Top · Width max side', '1/4" radius, Top · Width min side',
      '1/4" radius, Top · Length max end', '1/4" radius, Top · Length min end',
    ]);
    expect(details[4]).toBe('1/4" radius, Bottom · Width max side');
    expect(screen.queryByRole('button', { name: '+ Add profile' })).toBeNull();
    expect(screen.getByText('No profile preset fits this part.')).toBeInTheDocument();
  });

  it('all eight edges taken: no preset fits', () => {
    const b = top();
    open({ ...b, profiles: ORDER.map((e, i) => roundoverOn(b, e, `p${i}`)) });
    expect(screen.queryByRole('button', { name: '+ Add profile' })).toBeNull();
    expect(screen.getByText('No profile preset fits this part.')).toBeInTheDocument();
  });

  it('a hole in the next edge\'s waste skips to the edge after', async () => {
    const user = userEvent.setup();
    const b = top();
    // A bore 0.1" in from the width MIN side: inside the roundover's waste there, clear of the width max side's.
    const hole: HoleRow = { ...bore(0.1), acrossFrom: 'min' };
    const stored = { ...b, holes: [hole], profiles: [roundoverOn(b, ORDER[0]!, 'p0')] };
    expect(holeFaults(stored, hole)).toEqual([]);
    open(stored);
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('1/4" radius, Top · Length max end')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Roundover' }));
    expect(edgeOf(1)).toBe('max:width:max');
  });

  it('a part with no profiles gets a1\'s menu and stored profile, byte for byte', async () => {
    const user = userEvent.setup();
    for (const [n, kind] of PROFILE_KINDS.entries()) {
      const b = top();
      open(b);
      await user.click(screen.getByRole('button', { name: '+ Add profile' }));
      const menu = screen.getAllByRole('button').filter((x) => ITEMS.some((label) => x.textContent!.startsWith(label)));
      expect(menu.map((x) => ITEMS.find((label) => x.textContent!.startsWith(label)))).toEqual(ITEMS);
      await user.click(screen.getByRole('button', { name: ITEMS[n]! }));
      const p = profiles()[0]!;
      expect(p).toEqual({ id: p.id, ...profileOf(defaultProfile(b, kind))! });
      document.body.innerHTML = '';
    }
  });

  it('the detail names the edge on a part wider than long (a1\'s "top long edge" read the short edge there)', async () => {
    const user = userEvent.setup();
    open(top({ length: 10, width: 30 }));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('1/4" radius, Top · Width max side')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Roundover' }));
    // The default edge runs along the LENGTH — here the 10" dimension, the short edge.
    expect(edgeOf(0)).toBe('max:length:max');
  });
});

// Profile runs b1, Task 9: swept profiles (a loop, or End to end round a curve) in the row, the presets and the refusals.
describe('swept profiles in the row (profile runs b1)', () => {
  const W_MIN = { across: 'width', from: 'min' } as const;
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  /** The Profiles row: the `.cut` holding the Remove profile button. */
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;
  const expectedLine = (b: Board) => { const v = geometryBoard(b); return sweptLine(v, v.profiles[0]!, useStore.getState().doc.units); };

  it('the Run select offers End to end, Stopped and All round; on an uncut side Stopped is offered as today', () => {
    open(top({ profiles: [endToEndP('s1', { across: 'width', from: 'max' })] }));
    const run = inRow('Run');
    expect([...run.options].map((o) => o.textContent)).toEqual(['End to end', 'Stopped', 'All round']);
    act(() => run.focus());
    expect(within(run).getByRole('option', { name: 'Stopped' })).toBeEnabled();
    expect(within(run).getByRole('option', { name: 'All round' })).toBeEnabled();
  });

  it('All round on the 2" corner top stores { loop: true }, hides Side, in one undo entry', async () => {
    const user = userEvent.setup();
    open(named(frontOnly));
    expect(inRow('Side')).toBeInTheDocument();
    const before = useStore.getState().past.length;
    await user.selectOptions(inRow('Run'), 'All round');
    expect(profiles()[0]!.run).toEqual({ loop: true });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(within(profileRow()).queryByLabelText('Side')).toBeNull();
    expect(inRow('Run').value).toBe('loop');
    expect(within(profileRow()).getByText('Roundover 1/4" all round the thickness face (max side)')).toBeInTheDocument();
  });

  it('All round is greyed on focus when it would ADD too-tight: a stopped 3/8" roundover on the 1/4" corner top', () => {
    // Every side of topCorners(0.25) meets two 1/4" corners, so an End to end 3/8" roundover there is ALREADY too tight (and
    // All round would add nothing): the row is a stopped run — a2's construction on any side, unfaulted.
    open(named(topCorners(0.25, { ...stoppedRun('p1', W_MIN, 5, 30), size: 0.375 })));
    expect(profiles()[0]!.size).toBe(0.375);
    expect(screen.queryByRole('status')).toBeNull();
    const run = inRow('Run');
    expect(within(run).getByRole('option', { name: 'All round' })).toBeEnabled();     // not judged yet
    act(() => run.focus());
    expect(within(run).getByRole('option', { name: 'All round — too tight for the curve' })).toBeDisabled();
  });

  it('Stopped is offered on a turned path (B7 lifted, profile runs b2): Run -> Stopped stores a stop round the corners', async () => {
    const user = userEvent.setup();
    open(named(frontOnly));
    const run = inRow('Run');
    act(() => run.focus());
    expect(within(run).getByRole('option', { name: 'Stopped' })).toBeEnabled();
    act(() => run.blur());
    await user.selectOptions(run, 'Stopped');
    expect(profiles()[0]!.run).toEqual({ start: { side: W_MIN, from: 'min', at: 3 }, end: { side: W_MIN, from: 'min', at: 33 } });
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
  });

  it('a stopped a2 run on a side later cornered keeps its stations editable; a Side change moves it (B7 lifted)', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2, stoppedRun('p1', W_MIN, 5, 30))));
    const start = within(profileRow()).getByLabelText('Start (from the length min end)');
    await user.clear(start); await user.type(start, '6{Enter}');
    const r = profiles()[0]!.run as { start: Parameters<typeof endPos>[1]; end: Parameters<typeof endPos>[1] };
    expect([endPos(frontOnly, r.start), endPos(frontOnly, r.end)].sort((a, b) => a - b)).toEqual([6, 30]);
    // ... and (B7 lifted, profile runs b2) a Side change onto another turned side moves the stop there.
    const before = useStore.getState().past.length;
    await user.selectOptions(inRow('Side'), 'Width max side');
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
    const at = (x: number) => ({ side: { across: 'width', from: 'max' } as const, from: 'min' as const, at: x });
    expect(profiles()[0]!.run).toEqual(canonicalRun(frontOnly, 'max', { start: at(6), end: at(30) }));
    expect(profiles()[0]!.run).toEqual({ start: at(30), end: at(6) });               // travel −1 on the back: 30 first
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('swept rows render without throwing, each with sweptLine\'s line: End to end round the corners, along the arch, a loop', () => {
    for (const b of [frontOnly, apronArch, topCorners(2)]) {
      open(named(b));
      expect(within(profileRow()).getByText(expectedLine(b))).toBeInTheDocument();
      document.body.innerHTML = '';
    }
    expect(expectedLine(frontOnly)).toMatch(/, round the corners$/);
    expect(expectedLine(topCorners(2))).toBe('Roundover 1/4" all round the thickness face (max side)');
  });

  it('a saved End to end on the arched side (B10) edits as a swept row: Radius 3/8 stored, still End to end', async () => {
    const user = userEvent.setup();
    open(named(apronArch));
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '3/8{Enter}');
    expect(profiles()[0]).toEqual({ ...apronArch.profiles[0], size: 0.375 });
  });

  it('a loop keeps its run through Profile, Face and Fillet edits; Facing reads the edge', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2)));
    await user.selectOptions(inRow('Profile'), 'cove');
    expect(profiles()[0]).toMatchObject({ kind: 'cove', run: { loop: true }, face: 'max' });
    await user.selectOptions(inRow('Face'), 'Bottom');
    expect(profiles()[0]).toMatchObject({ kind: 'cove', run: { loop: true }, face: 'min' });
    const fillet = within(profileRow()).getByLabelText('Fillet');
    await user.clear(fillet); await user.type(fillet, '1/16{Enter}');
    expect(profiles()[0]).toMatchObject({ fillet: 0.0625, run: { loop: true }, facing: 'face' });
    await user.selectOptions(inRow('Facing'), 'Top: the edge');
    expect(profiles()[0]).toMatchObject({ facing: 'edge', run: { loop: true } });
  });

  it('All round -> End to end takes the default edge\'s side (the top long edge, width max)', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2)));
    await user.selectOptions(inRow('Run'), 'End to end');
    expect(profiles()[0]!.run).toEqual({ start: { side: { across: 'width', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } });
  });

  it('a swept row\'s size field refuses a value that ADDS too-tight, as its own error', async () => {
    const user = userEvent.setup();
    open(named(topCorners(0.5)));
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '5/8{Enter}');
    expect(profiles()[0]!.size).toBe(0.25);
    expect(radius).toHaveAttribute('aria-invalid', 'true');
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('Too tight for the curve — reduce the size first.');
    expect(radius).toHaveFocus();
  });

  it('a stored too-tight (a corner edit caused it) is noted, and an edit that adds nothing new is accepted', async () => {
    const user = userEvent.setup();
    open(named(topCorners(0.2)));
    expect(within(profileRow()).getByRole('status')).toHaveTextContent(/^Too tight for the curve at this size\.$/);
    expect(within(profileRow()).getByText(/— check: it is too tight for the curve$/)).toBeInTheDocument();
    // 7/32" is still over the 0.2" corners: too tight as stored, nothing ADDED — stored.
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '7/32{Enter}');
    expect(profiles()[0]!.size).toBe(7 / 32);
  });

  it('a swept row refuses a size whose band would meet a bore, in the hole refusal\'s words; clear of it is stored', async () => {
    const user = userEvent.setup();
    // A loop on a plain 30 × 10 top; the 1/16" bore 0.3" in from the width max side sits clear of the 1/4" band.
    open(named(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loopP('w1')], holes: [bore(0.3)] })));
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '3/8{Enter}');
    expect(profiles()[0]!.size).toBe(0.25);
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('Puts hole 1 into the roundover — move it first.');
    await user.clear(radius); await user.type(radius, '3/16{Enter}');
    expect(profiles()[0]!.size).toBe(0.1875);
  });

  it('presets on the 2" corner top take the first edge whose default fits: the top long edge, swept round the corners', async () => {
    const user = userEvent.setup();
    const b = { ...named(topCorners(2)), profiles: [] };
    open(b);
    await add(user, 'Roundover');
    const p = profiles()[0]!;
    expect(p.run).toEqual({ start: { side: { across: 'width', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } });
    expect(isSwept(b, p)).toBe(true);
    expect(within(profileRow()).getByText(/^Roundover 1\/4" .*, round the corners$/)).toBeInTheDocument();
  });

  it('a swept preset is judged by its swept faults: on the 1/4" corner top a 3/8" Cove is too tight on every edge, withheld', async () => {
    const user = userEvent.setup();
    open({ ...named(topCorners(0.25)), profiles: [] });
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByRole('button', { name: 'Roundover' })).toBeInTheDocument();    // 1/4" reach on a 1/4" corner: touching
    expect(screen.queryByRole('button', { name: 'Cove' })).toBeNull();
  });

  // ── Final review I1 (the user's ruling, "Fall back to straight") ──
  /** A saved 36 × 20 top with four 1/4" corners and a 3/8" roundover End to end on the front, loaded (v18). */
  const tightTop = () => {
    const corners = (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) => ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: 0.25 }) })));
    const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [named(topCorners(0.25, { ...endToEndP('p1', W_MIN), size: 0.375 }))] }));
    raw.boards[0].curves = corners;
    return migrateDocument(raw).boards[0] as Board;
  };
  it('a saved End to end too tight for its corners runs straight: the row says so; the bench line has no note', () => {
    open(tightTop());
    expect(within(profileRow()).getByRole('status')).toHaveTextContent(/^Runs straight: too tight to follow the curve\.$/);
    expect(within(profileRow()).getByText('Roundover 3/8" on the edge between the width face (min side) and the thickness face (max side), along the length')).toBeInTheDocument();
  });
  it('a fitting End to end follows its corners: no note', () => {
    open(named(topCorners(2, { ...endToEndP('p1', W_MIN), size: 0.375 })));
    expect(within(profileRow()).queryByRole('status')).toBeNull();
  });
  it('authoring still judges it swept: an edit keeping too-tight is stored (it still runs straight), one adding a swept fault is refused', async () => {
    const user = userEvent.setup();
    open(tightTop());
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '5/16{Enter}');
    expect(profiles()[0]!.size).toBe(5 / 16);
    expect(within(profileRow()).getByRole('status')).toHaveTextContent('Runs straight: too tight to follow the curve.');
    document.body.innerHTML = '';
    // a fitting End to end on 1/2" corners: 5/8" would ADD too-tight as swept — refused, though its straight form is clean
    open(named(topCorners(0.5, endToEndP('p1', W_MIN))));
    const r2 = within(profileRow()).getByLabelText('Radius');
    await user.clear(r2); await user.type(r2, '5/8{Enter}');
    expect(profiles()[0]!.size).toBe(0.25);
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('Too tight for the curve — reduce the size first.');
  });
  it('Curves\' refusal keeps comparing swept faults: an unrelated corner edit on a fallen-back part is not refused; one that ADDS too-tight to a fitting End to end is', () => {
    const b = tightTop();
    const uv = (id: string) => [id.slice(1, 4), id.slice(4)] as ['min' | 'max', 'min' | 'max'];
    const smaller = { ...b, curves: b.curves.map((c) => ({ id: c.id, ...cornerCurve({ through: 'thickness', uFrom: uv(c.id)[0], vFrom: uv(c.id)[1], radius: 0.2 }) })) };
    expect(profileRefusal(b, smaller)).toBeNull();
    const fit = named(topCorners(2, { ...endToEndP('p1', W_MIN), size: 0.375 }));
    const tight = { ...fit, curves: fit.curves.map((c) => (c.id === 'cminmin' ? { ...c, ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 0.25 }), id: c.id } : c)) };
    expect(profileRefusal(fit, tight)).toBe('Too tight for the roundover — reduce the roundover first.');
  });
});

// ── profile runs b2, Task 9: Stopped on any side, the Stop side select, side changes (Q26, Review Focus 5) ──
describe('the b2 row: stops on a turned path and two-side runs (profile runs b2)', () => {
  const W_MIN = { across: 'width', from: 'min' } as const;
  const W_MAX = { across: 'width', from: 'max' } as const;
  const L_MIN = { across: 'length', from: 'min' } as const;
  const L_MAX = { across: 'length', from: 'max' } as const;
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;
  const past = () => useStore.getState().past.length;
  const lineOf = (b: Board) => { const v = geometryBoard(b); return sweptLine(v, v.profiles[0]!, useStore.getState().doc.units); };
  const loadedPart = (b: Board) => migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [named(b)] }))).boards[0] as Board;

  it('a stop on the cornered front shows Side, Stop side, Start and Stop, and sweptLine\'s line', () => {
    const b = named(stopOnCorner());
    open(b);
    expect(isSwept(b, b.profiles[0]!)).toBe(true);
    expect(selected('Side')).toBe('Width min side');
    expect(selected('Stop side')).toBe('Width min side');
    expect(within(profileRow()).getByLabelText('Start (from the length min end)')).toHaveValue(formatLength(1.1, useStore.getState().doc.units));
    expect(within(profileRow()).getByLabelText('Stop (from the length min end)')).toHaveValue('30"');
    expect(within(profileRow()).getByText(lineOf(b))).toBeInTheDocument();
  });

  it('an End to end row has no Stop side select', () => {
    open(named(frontOnly));
    expect(within(profileRow()).queryByLabelText('Stop side')).toBeNull();
  });

  it('Review Focus 5: Stop side, then Side, then Side onto the Stop side; each one undo entry', async () => {
    const user = userEvent.setup();
    open(named(stopOnCorner()));
    const start0 = (profiles()[0]!.run as { start: object }).start;
    // Stop side -> Length max end: 30 does not fit a 20" side, so the Stop is seeded min(3, 20/4) = 3 past the corner the
    // travel enters (travelSign('max', L_MAX) = +1: it enters at the width min end).
    let before = past();
    await user.selectOptions(inRow('Stop side'), 'Length max end');
    expect(profiles()[0]!.run).toEqual({ start: start0, end: { side: L_MAX, from: 'min', at: 3 } });
    expect(past()).toBe(before + 1);
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
    // Side -> Length min end: only Start moves, keeping 1.1 (it fits there).
    before = past();
    await user.selectOptions(inRow('Side'), 'Length min end');
    expect(profiles()[0]!.run).toEqual({ start: { side: L_MIN, from: 'min', at: 1.1 }, end: { side: L_MAX, from: 'min', at: 3 } });
    expect(past()).toBe(before + 1);
    expect(within(profileRow()).getByLabelText('Start (from the width min end)')).toBeInTheDocument();
    expect(within(profileRow()).getByLabelText('Stop (from the width min end)')).toBeInTheDocument();
    // Side -> the Stop side's own side: a one-side run, in canonical order.
    before = past();
    await user.selectOptions(inRow('Side'), 'Length max end');
    const run = profiles()[0]!.run as { start: Parameters<typeof endPos>[1]; end: Parameters<typeof endPos>[1] };
    expect(run.start.side).toEqual(L_MAX);
    expect(run.end.side).toEqual(L_MAX);
    expect(run).toEqual(canonicalRun(stopOnCorner(), 'max', run));
    expect([endPos(stopOnCorner(), run.start), endPos(stopOnCorner(), run.end)]).toEqual([1.1, 3]);
    expect(past()).toBe(before + 1);
    expect(selected('Stop side')).toBe('Length max end');
  });

  it('a moved Start that would add a fault is seeded min(3, L/4) in from the corner its travel leaves', async () => {
    const user = userEvent.setup();
    // The front at 20 round the length max end to 5 (twoSideSharp); Start -> Length min end keeping 20 is off its 10" side:
    // travelSign('max', L_MIN) = -1, so travel leaves the length min end at its width min end: Start = 0 + min(3, 10/4) = 2.5.
    open(named(twoSideSharp));
    await user.selectOptions(inRow('Side'), 'Length min end');
    expect(profiles()[0]!.run).toEqual({ start: { side: L_MIN, from: 'min', at: 2.5 }, end: { side: L_MAX, from: 'min', at: 5 } });
  });

  it('Face -> Bottom on a two-side run swaps Start and Stop (the same sides profiled), one undo entry', async () => {
    const user = userEvent.setup();
    const b = named(frontAndEnds());
    open(b);
    const r0 = b.profiles[0]!.run as { start: object; end: object };
    const before = past();
    await user.selectOptions(inRow('Face'), 'Bottom');
    expect(profiles()[0]).toMatchObject({ face: 'min', run: { start: r0.end, end: r0.start } });
    expect(past()).toBe(before + 1);
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
    // A size edit keeps the stored run (no swap).
    const radius = within(profileRow()).getByLabelText('Radius');
    await user.clear(radius); await user.type(radius, '3/16{Enter}');
    expect(profiles()[0]).toMatchObject({ face: 'min', size: 0.1875, run: { start: r0.end, end: r0.start } });
  });

  it('typing Start at its side\'s leaving end is refused as the stop-off it adds: the field\'s own error, typed text kept', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2, twoSide('p1', L_MIN, 1.1, L_MAX, 3))));
    const stored = profiles()[0];
    const start = within(profileRow()).getByLabelText('Start (from the width min end)');
    await user.clear(start); await user.type(start, '0{Enter}');
    expect(profiles()[0]).toEqual(stored);
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(start).toHaveValue('0');
    expect(start).toHaveFocus();
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('A stop runs off the part — move it first.');
  });

  it('Q17: a typed 0 where travel LEAVES Start\'s side is never a through end, even where stop-off is already stored', async () => {
    const user = userEvent.setup();
    // The Stop at 30 on the 20" length max end is already off its side (stored stop-off), so a second stop-off is no ADDED
    // kind and the edit is stored: as a station at 0, not an inconsistent through end.
    open(named(topCorners(2, twoSide('p1', L_MIN, 1.1, L_MAX, 30))));
    await typeInto(user, 'Start (from the width min end)', '0');
    expect(profiles()[0]!.run).toEqual({ start: { side: L_MIN, from: 'min', at: 0 }, end: { side: L_MAX, from: 'min', at: 30 } });
  });

  it('two sides: each field edits its own end, no crossing check; a typed end where travel enters Start\'s side is a through end (Q17)', async () => {
    const user = userEvent.setup();
    open(named(twoSideSharp));
    expect(within(profileRow()).getByLabelText('Start (from the length min end)')).toHaveValue('20"');
    expect(within(profileRow()).getByLabelText('Stop (from the width min end)')).toHaveValue('5"');
    await typeInto(user, 'Stop (from the width min end)', '8');
    expect(profiles()[0]!.run).toEqual({ start: { side: W_MIN, from: 'min', at: 20 }, end: { side: L_MAX, from: 'min', at: 8 } });
    // Start 0 on the front: travel enters the front at its length min end, so 0 is a through end there.
    await typeInto(user, 'Start (from the length min end)', '0');
    expect(profiles()[0]!.run).toEqual({ start: { side: W_MIN, through: 'min' }, end: { side: L_MAX, from: 'min', at: 8 } });
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
  });

  it('a two-side run loaded through migrateDocument renders its row (Task 3 ledger 1)', () => {
    const b = loadedPart(frontAndEnds());
    expect(b.profiles[0]!.run).toEqual(frontAndEnds().profiles[0]!.run);
    open(b);
    expect(within(profileRow()).getByText(lineOf(b))).toBeInTheDocument();
    expect(selected('Side')).toBe('Length min end');
    expect(selected('Stop side')).toBe('Length max end');
    expect(selected('Run')).toBe('Stopped');
  });

  it('a two-side asymmetric row\'s Facing offers Top: the edge', async () => {
    const user = userEvent.setup();
    open(named(frontAndEnds('ogee', 0.375)));
    const facing = inRow('Facing');
    expect([...facing.options].map((o) => o.textContent)).toContain('Top: the edge');
    await user.selectOptions(facing, 'Top: the edge');
    expect(profiles()[0]).toMatchObject({ facing: 'edge', run: frontAndEnds().profiles[0]!.run });
  });

  it('the fallback note says why (Q10): too tight for the saved tight stop, an overlap for I2\'s stop', () => {
    const corners = (r: number) => topCorners(r).curves;
    const stop = (id: string, s: typeof W_MIN, lo: number, hi: number, size = 0.25) => ({ ...stoppedRun(id, s, lo, hi), size });
    open(loadedPart(createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners(0.25), profiles: [stop('s', W_MIN, 0.1, 30, 0.375)] })));
    expect(within(profileRow()).getByRole('status')).toHaveTextContent(/^Runs straight: too tight to follow the curve\.$/);
    document.body.innerHTML = '';
    open(loadedPart(createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners(2),
      profiles: [stop('a', W_MIN, 1, 30), endToEndP('b', L_MIN)] })));
    expect(within(profileRow(0)).getByRole('status')).toHaveTextContent(/^Runs straight: it would overlap another profile if it followed the curve\.$/);
  });

  it('an edit that ADDS a fault to ANOTHER profile is refused naming it: a two-side Stop typed onto the back\'s corner arc', async () => {
    const user = userEvent.setup();
    // t already overlaps x (the front End to end): stored, so another overlap adds no KIND to t. Its Stop at 19.9 on the
    // length max end lies on the back-right arc, which y (the back End to end) carries round: y gains an overlap.
    open(named(createBoard({ length: 36, width: 20, thickness: 0.75, curves: topCorners(2).curves,
      profiles: [twoSide('t', L_MIN, 4, L_MAX, 4), endToEndP('x', W_MIN), endToEndP('y', W_MAX)] })));
    const stored = profiles();
    const stop = within(profileRow(0)).getByLabelText('Stop (from the width min end)');
    await user.clear(stop); await user.type(stop, '19.9{Enter}');
    expect(profiles()).toEqual(stored);
    expect(stop).toHaveAttribute('aria-invalid', 'true');
    expect(within(profileRow(0)).getByRole('alert')).toHaveTextContent('The roundover overlaps another profile on this edge — move the roundover first.');
    // 17 stays clear of y's arc: stored.
    await user.clear(stop); await user.type(stop, '17{Enter}');
    expect(profiles()[0]!.run).toMatchObject({ end: { side: L_MAX, from: 'min', at: 17 } });
  });
});

// ── profile runs b2, Task 9 fix round 1 ──
describe('fix round 1: Stop side on a one-side stop onto an adjacent side moves the NEARER station (R5)', () => {
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;
  const label = (s: { across: 'width' | 'length'; from: 'min' | 'max' }) => `${s.across === 'width' ? 'Width' : 'Length'} ${s.from} ${s.across === 'width' ? 'side' : 'end'}`;
  type S = { across: 'width' | 'length'; from: 'min' | 'max' };
  const cases: [S, 'min' | 'max'][] = [
    [{ across: 'width', from: 'min' }, 'max'], [{ across: 'width', from: 'max' }, 'max'],
    [{ across: 'length', from: 'min' }, 'max'], [{ across: 'length', from: 'max' }, 'max'],
    [{ across: 'width', from: 'min' }, 'min'], [{ across: 'length', from: 'max' }, 'min'],
  ];
  for (const [s, face] of cases) {
    it(`${label(s)}, face ${face}: stop 5 to L - 5, Stop side -> the adjacent side at its max end; 5 stays, the route goes round the one corner`, async () => {
      const user = userEvent.setup();
      const dims = topCorners(2);
      const dim = s.across === 'width' ? 'length' : 'width';
      const L = dims[dim];
      const p0 = stoppedRun('p1', s, 5, L - 5);
      const p = { ...p0, face, run: canonicalRun(dims, face, p0.run as never) };
      open(named(topCorners(2, p)));
      expect(within(profileRow()).getByLabelText(`Start (from the ${dim} min end)`)).toHaveValue('5"');
      const adj: S = { across: dim, from: 'max' };
      const before = useStore.getState().past.length;
      await user.selectOptions(inRow('Stop side'), label(adj));
      expect(within(profileRow()).queryByRole('alert')).toBeNull();
      expect(useStore.getState().past.length).toBe(before + 1);
      const run = profiles()[0]!.run as { start: Parameters<typeof endPos>[1]; end: Parameters<typeof endPos>[1] };
      const kept = [run.start, run.end].find((e) => e.side.across === s.across && e.side.from === s.from)!;
      const moved = [run.start, run.end].find((e) => e !== kept)!;
      expect(endPos(dims, kept)).toBe(5);                                             // the station far from the corner stays
      expect(moved.side).toEqual(adj);
      // Fix round 2: the moved end's exact station. A width side's L - 5 = 31 is off the 20" end, so it is seeded
      // min(3, 20/4) = 3 past the shared corner (at the side's own end of the width); a length end's 15 fits the 36" side, kept.
      expect(endPos(dims, moved)).toBe(s.across === 'width' ? (s.from === 'min' ? 3 : 17) : 15);
      // The kept number shows in its own side's field; the route passes the shared corner only (Q21's between words).
      expect(within(profileRow()).getByLabelText(new RegExp(`^(Start|Stop) \\(from the ${dim} min end\\)$`))).toHaveValue('5"');
      expect(within(profileRow()).getByText(/ round the corner to /)).toBeInTheDocument();
    });
  }
});

describe('fix round 1: M1 and M4', () => {
  const W_MAX = { across: 'width', from: 'max' } as const;
  const L_MIN = { across: 'length', from: 'min' } as const;
  const L_MAX = { across: 'length', from: 'max' } as const;
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;
  const loadedPart = (b: Board) => migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [named(b)] }))).boards[0] as Board;

  it('M1: a loaded Stop stored from the max end keeps the number it SHOWS when Stop side moves it', async () => {
    const user = userEvent.setup();
    const p = { ...twoSide('p1', L_MIN, 4, L_MAX, 0), run: { start: { side: L_MIN, from: 'min', at: 4 }, end: { side: L_MAX, from: 'max', at: 16 } } } as ReturnType<typeof twoSide>;
    const b = loadedPart(topCorners(2, p));
    expect((b.profiles[0]!.run as { end: object }).end).toEqual({ side: L_MAX, from: 'max', at: 16 });
    open(b);
    expect(within(profileRow()).getByLabelText('Stop (from the width min end)')).toHaveValue('4"');
    await user.selectOptions(inRow('Stop side'), 'Width max side');
    expect(profiles()[0]!.run).toEqual({ start: { side: L_MIN, from: 'min', at: 4 }, end: { side: W_MAX, from: 'min', at: 4 } });
    expect(within(profileRow()).getByLabelText('Stop (from the length min end)')).toHaveValue('4"');
  });

  it('M4: a Stop typed at its side\'s ENTERING end is refused as the stop-off it adds, the field\'s own error', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2, twoSide('p1', L_MIN, 4, L_MAX, 4))));
    const stored = profiles()[0];
    const stop = within(profileRow()).getByLabelText('Stop (from the width min end)');
    await user.clear(stop); await user.type(stop, '0{Enter}');
    expect(profiles()[0]).toEqual(stored);
    expect(stop).toHaveAttribute('aria-invalid', 'true');
    expect(stop).toHaveValue('0');
    expect(stop).toHaveFocus();
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('A stop runs off the part — move it first.');
  });

  it('M4: one row switched two-side -> All round -> Stopped -> End to end renders throughout (hooks above every branch)', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2, twoSide('p1', L_MIN, 4, L_MAX, 4))));
    await user.selectOptions(inRow('Run'), 'All round');
    expect(profiles()[0]!.run).toEqual({ loop: true });
    expect(within(profileRow()).queryByLabelText('Stop side')).toBeNull();
    await user.selectOptions(inRow('Run'), 'Stopped');
    expect(within(profileRow()).getByLabelText('Stop side')).toBeInTheDocument();
    await user.selectOptions(inRow('Stop side'), 'Length max end');
    await user.selectOptions(inRow('Run'), 'End to end');
    expect(within(profileRow()).queryByLabelText('Stop side')).toBeNull();
    expect(selected('Run')).toBe('End to end');
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
  });
});

describe('fix round 2: R6 (opposite Stop side keeps the shown Start) and N2 (a moved through end is seeded)', () => {
  type S = { across: 'width' | 'length'; from: 'min' | 'max' };
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;
  const label = (s: S) => `${s.across === 'width' ? 'Width' : 'Length'} ${s.from} ${s.across === 'width' ? 'side' : 'end'}`;
  const words = (s: S) => `the ${s.across} ${s.from} ${s.across === 'width' ? 'side' : 'end'}`;
  const flip = (f: 'min' | 'max') => (f === 'min' ? 'max' : 'min');
  const dims = topCorners(2);
  type End = Parameters<typeof endPos>[1];
  const ends = () => profiles()[0]!.run as { start: End; end: End };
  const stopOn = (s: S, face: 'min' | 'max', lo: End | number, hi: End | number) => {
    const p0 = stoppedRun('p1', s, 5, 6);
    const e = (x: End | number): End => (typeof x === 'number' ? { side: { ...s }, from: 'min', at: x } : x);
    return { ...p0, face, run: canonicalRun(dims, face, { start: e(lo), end: e(hi) }) };
  };
  const R6: [S, 'min' | 'max'][] = [
    [{ across: 'width', from: 'max' }, 'max'], [{ across: 'length', from: 'min' }, 'max'],
    [{ across: 'width', from: 'min' }, 'min'], [{ across: 'length', from: 'max' }, 'min'],      // the four min-travel sides
    [{ across: 'width', from: 'min' }, 'max'], [{ across: 'length', from: 'max' }, 'max'],      // two max-travel sides
  ];
  for (const [s, face] of R6) {
    it(`R6: ${label(s)}, face ${face}: Stop side -> the opposite side keeps the shown Start and moves the shown Stop`, async () => {
      const user = userEvent.setup();
      const dim = s.across === 'width' ? 'length' : 'width';
      const L = dims[dim];
      open(named(topCorners(2, stopOn(s, face, 5, L - 5))));
      expect(within(profileRow()).getByLabelText(`Start (from the ${dim} min end)`)).toHaveValue('5"');
      const before = useStore.getState().past.length;
      const opp: S = { across: s.across, from: flip(s.from) };
      await user.selectOptions(inRow('Stop side'), label(opp));
      expect(within(profileRow()).queryByRole('alert')).toBeNull();
      expect(useStore.getState().past.length).toBe(before + 1);
      expect(ends().start.side).toEqual(s);
      expect(endPos(dims, ends().start)).toBe(5);
      expect(ends().end.side).toEqual(opp);
      expect(within(profileRow()).getByLabelText(`Start (from the ${dim} min end)`)).toHaveValue('5"');
      // Q16's route from the kept Start: along its side toward the end its travel heads for, past that one side.
      const passed: S = { across: dim, from: (travelSign(face, s) > 0) ? 'max' : 'min' };
      expect(within(profileRow()).getByText(new RegExp(` round ${words(passed)} to ${words(opp)} at `))).toBeInTheDocument();
    });
  }
  // Fix round 3 (NF1, the controller's ruling R7): a shown Start that is a THROUGH end where the run LEAVES its side cannot be
  // the stored Start (Q17). The shown extent on the kept side is kept instead: the stored start stays the shown Stop's
  // station, the run still leaves through, and the moved end is seeded per Q26 on the opposite side.
  for (const [s, face] of R6.slice(0, 4)) {
    it(`R7: ${label(s)}, face ${face}: the shown Start runs out through; Stop side -> the opposite side keeps 0 to L - 5 there`, async () => {
      const user = userEvent.setup();
      const dim = s.across === 'width' ? 'length' : 'width';
      const L = dims[dim];
      open(named(topCorners(2, stopOn(s, face, { side: { ...s }, through: 'min' }, L - 5))));
      expect(within(profileRow()).getByLabelText(`Start (from the ${dim} min end)`)).toHaveValue('0"');
      const kept = ends().start;
      expect(kept).toEqual({ side: s, from: 'min', at: L - 5 });                         // canonical: travel −1, so L − 5 first
      const before = useStore.getState().past.length;
      const opp: S = { across: s.across, from: flip(s.from) };
      await user.selectOptions(inRow('Stop side'), label(opp));
      expect(within(profileRow()).queryByRole('alert')).toBeNull();
      expect(useStore.getState().past.length).toBe(before + 1);
      const seed = Math.min(3, L / 4);
      expect(ends()).toEqual({ start: kept, end: { side: opp, from: 'min', at: travelSign(face, opp) > 0 ? seed : L - seed } });
      const passed: S = { across: dim, from: 'min' };                                    // travel −1 leaves through the min end
      expect(within(profileRow()).getByText(new RegExp(`from ${words(s)} at ${L - 5}" round ${words(passed)} to ${words(opp)} at `))).toBeInTheDocument();
    });
  }
  const sides: S[] = [{ across: 'width', from: 'min' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' }];
  for (const face of ['max', 'min'] as const) {
    for (const s of sides) {
      it(`N2: ${label(s)}, face ${face}: the near end runs out through max; Stop side -> the adjacent side at max seeds it 3" (or L/4) past the shared corner`, async () => {
        const user = userEvent.setup();
        const dim = s.across === 'width' ? 'length' : 'width';
        open(named(topCorners(2, stopOn(s, face, 5, { side: { ...s }, through: 'max' }))));
        const adj: S = { across: dim, from: 'max' };
        await user.selectOptions(inRow('Stop side'), label(adj));
        expect(within(profileRow()).queryByRole('alert')).toBeNull();
        const r = ends();
        const kept = [r.start, r.end].find((e) => e.side.across === s.across && e.side.from === s.from)!;
        const moved = [r.start, r.end].find((e) => e !== kept)!;
        expect(endPos(dims, kept)).toBe(5);
        expect(moved).toEqual({ side: adj, from: 'min', at: s.from === 'min' ? Math.min(3, dims[s.across] / 4) : dims[s.across] - Math.min(3, dims[s.across] / 4) });
      });
    }
  }
});

// ── profile runs b2, the final review's I1 (the controller's ruling): Scenario A in the row ──
describe('the row refuses crossed stations on the corner arc two sides share (b2 final review I1)', () => {
  const L_MAX = { across: 'length', from: 'max' } as const, W_MIN = { across: 'width', from: 'min' } as const, W_MAX = { across: 'width', from: 'max' } as const;
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const profileRow = (i = 0) => screen.getAllByRole('button', { name: /^Remove profile \(/ })[i]!.closest('.cut') as HTMLElement;
  const inRow = (label: string, i = 0) => within(profileRow(i)).getByLabelText(label) as HTMLSelectElement;

  // Scenario A cannot be TYPED from a clean run: with one station on the front-right arc and the other off it the run
  // re-enters a side (review M1, already stop-off), so a single typed station never lands there from a clean state. It is
  // reached by Stop side: the length max end at 1/2" round the corner to the back at 35-1/2" (both on arcs, clean), then
  // Stop side -> Width min side keeps the Stop's shown 35-1/2" (R5's moveEnd) — Scenario A.
  const start = () => named(topCorners(2, twoSide('p1', L_MAX, 0.5, W_MAX, 35.5)));

  it('Stop side -> Width min side is disabled and says why while the select has focus', async () => {
    const user = userEvent.setup();
    open(start());
    await user.click(inRow('Stop side'));
    expect(within(inRow('Stop side')).getByRole('option', { name: 'Width min side — a stop runs off the part' })).toBeDisabled();
  });

  it('Stop side -> Width min side changed anyway is refused on the row: nothing stored, the select on the stored side', () => {
    open(start());
    const stored = profiles()[0];
    expect(profileFaults(start(), stored!)).toEqual([]);
    fireEvent.change(inRow('Stop side'), { target: { value: '0' } });   // SIDES[0]: the width min side
    expect(profiles()[0]).toEqual(stored);
    expect(selected('Stop side')).toBe('Width max side');
    expect(within(profileRow()).getByRole('alert')).toHaveTextContent('A stop runs off the part — move it first.');
  });

  it('the uncrossed short run on that arc is still reached by Stop side: the front at 35 round the corner to the length max end at 1', () => {
    open(named(topCorners(2, twoSide('p1', W_MIN, 35, W_MAX, 1))));     // the front at 35 round the right end to the back at 1
    fireEvent.change(inRow('Stop side'), { target: { value: '3' } });   // SIDES[3]: the length max end
    expect(profiles()[0]!.run).toEqual({ start: { side: W_MIN, from: 'min', at: 35 }, end: { side: L_MAX, from: 'min', at: 1 } });
    expect(within(profileRow()).queryByRole('alert')).toBeNull();
  });
});
