import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import {
  cornerCurve, createBoard, createDocument, curveFaults, holeFaults, defaultProfile, profileCurve, profileFields, profileOf, profileFromFields, profileToFields, profileAsCurve, geometryBoard,
  migrateDocument, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
import { Properties } from './Properties';
import { canonicalRun, endPos } from '../document/profiles';
import { holeRefusal, pastHalfCircle, refusalFor } from './curveRefusal';

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

  it('a preset whose default puts a hole into its waste is withheld', async () => {
    const user = userEvent.setup();
    // The bore sits clear of the roundover's waste and inside every other default's (the bore is clean on the stored part).
    const b = top({ holes: [bore(0.3)] });
    expect(holeFaults(b, b.holes[0]!)).toEqual([]);
    open(b);
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByRole('button', { name: 'Roundover' })).toBeInTheDocument();
    for (const item of ['Cove', 'Roman ogee', 'Bead', 'Thumbnail']) expect(screen.queryByRole('button', { name: item })).toBeNull();
  });

  it('menu details read the project units (Review Focus 5)', async () => {
    const user = userEvent.setup();
    open(top());
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('1/4" radius, on the top long edge')).toBeInTheDocument();
    expect(screen.getByText('1/4" radius, 1/16" quirk, on the top long edge')).toBeInTheDocument();
    expect(screen.getByText('3/8", on the top long edge')).toBeInTheDocument();
    expect(screen.getByText('3/4" × 1/4", on the top long edge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await user.click(screen.getByRole('button', { name: '+ Add profile' }));
    expect(screen.getByText('6 mm radius, on the top long edge')).toBeInTheDocument();
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
  it('a preset that would overlap an existing profile on the top width-max edge is withheld', async () => {
    const user = userEvent.setup();
    const b = createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75 });
    open({ ...b, profiles: [{ id: 'p1', ...profileOf(defaultProfile(b, 'roundover'))! }] });
    expect(screen.queryByRole('button', { name: '+ Add profile' })).toBeNull();
    expect(screen.getByText('No profile preset fits this part.')).toBeInTheDocument();
    void user;
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
