import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import {
  cornerCurve, createBoard, createDocument, curveFaults, holeFaults, defaultProfile, profileCurve, profileFields, PROFILE_EDGES, PROFILE_KINDS,
} from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
import { Properties } from './Properties';
import { pastHalfCircle, refusalFor } from './curveRefusal';

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
const curves = () => (useStore.getState().doc.boards[0] as Board).curves;
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
const ITEMS = ['Roundover', 'Cove', 'Roman ogee', 'Bead', 'Thumbnail'];

describe('the Profiles section (edge profiles spec §3)', () => {
  it('adds a Roundover on the top long edge in one undo entry, with its bench line', async () => {
    const user = userEvent.setup();
    open(top());
    const before = useStore.getState().past.length;
    await add(user, 'Roundover');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'roundover', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.25 });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getByText(/^Roundover 1\/4" on the edge between the width face \(max side\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Profiles/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove profile \(Roundover 1\/4" on the edge/ })).toBeInTheDocument();
  });

  it('a stored through-length corner appears here as a Roundover (Review Focus 1)', () => {
    const c: CurveCut = { id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 }) };
    open(top({ curves: [c] }));
    expect((screen.getByLabelText('Profile') as HTMLSelectElement).value).toBe('roundover');
    expect(curves()[0]).toEqual(c);
  });

  it('Remove removes the profile', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.click(screen.getByRole('button', { name: /^Remove profile \(/ }));
    expect(curves()).toEqual([]);
  });

  it('Radius edits the size; Fillet shows Facing; Facing flips the top', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    await typeInto(user, 'Radius', '3/8');
    expect(profileFields(curves()[0]!)!.size).toBe(0.375);
    expect(screen.queryByLabelText('Facing')).toBeNull();
    await typeInto(user, 'Fillet', '1/16');
    expect(profileFields(curves()[0]!)!.fillet).toBe(0.0625);
    await user.selectOptions(screen.getByLabelText('Facing'), 'u');
    expect(profileFields(curves()[0]!)!.facing).toBe('u');
  });

  it('a filleted roundover facing u, set back to no fillet, is stored at facing v: byte-equal to the corner', async () => {
    const user = userEvent.setup();
    const p = { through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', facing: 'u', size: 0.25, fillet: 0.0625 } as const;
    open(top({ curves: [{ id: 'c1', ...profileCurve(p) }] }));
    await typeInto(user, 'Fillet', '0');
    expect(curves()[0]).toEqual({ id: 'c1', ...cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }) });
    expect(screen.queryByLabelText('Facing')).toBeNull();
  });

  it('Edge moves the profile, keeping its size', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Cove');
    await user.selectOptions(screen.getByLabelText('Edge'), 'Length min end · thickness max side');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'cove', through: 'width', uFrom: 'min', vFrom: 'max', size: 0.375 });
  });

  it('an Edge change that would run off is refused in the sizer\'s words, nothing stored', async () => {
    const user = userEvent.setup();
    // A 3/4" radius fits the top long edge's 20" × 4" section, but not the end edge's 1/2" × 4" one.
    open(top({ length: 0.5, width: 20, thickness: 4 }));
    await add(user, 'Roundover');
    await typeInto(user, 'Radius', '3/4');
    const stored = curves()[0]!;
    await user.selectOptions(screen.getByLabelText('Edge'), 'Length min end · thickness max side');
    expect(curves()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent("A radius can't run past");
    expect((screen.getByLabelText('Edge') as HTMLSelectElement).value).toBe(String(PROFILE_EDGES.findIndex((e) => e.through === 'length' && e.uFrom === 'max' && e.vFrom === 'max')));
  });

  it('Profile change keeps the edge and takes the new kind\'s defaults', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roundover');
    const id = curves()[0]!.id;
    await user.selectOptions(screen.getByLabelText('Profile'), 'thumbnail');
    expect(profileFields(curves()[0]!)).toMatchObject({ kind: 'thumbnail', through: 'length', uFrom: 'max', vFrom: 'max', size: 0.75, depth: 0.25 });
    expect(curves()[0]!.id).toBe(id);
  });

  it('a Profile change from an ogee facing u to a Roundover is stored at facing v: byte-equal to the corner', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Roman ogee');
    await user.selectOptions(screen.getByLabelText('Facing'), 'u');
    expect(profileFields(curves()[0]!)!.facing).toBe('u');
    const id = curves()[0]!.id;
    await user.selectOptions(screen.getByLabelText('Profile'), 'roundover');
    expect(curves()[0]).toEqual({ id, ...cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }) });
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
    const stored = curves()[0]!;
    await user.selectOptions(screen.getByLabelText('Profile'), 'cove');
    expect(curves()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Puts hole 1 into/);
    expect((screen.getByLabelText('Profile') as HTMLSelectElement).value).toBe('roundover');
  });

  it('Thumbnail Depth must be less than its Reach', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Thumbnail');
    await typeInto(user, 'Depth', '1');
    expect(profileFields(curves()[0]!)!.depth).toBe(0.25);
    expect(screen.getByRole('alert')).toHaveTextContent('Depth must be less than the reach');
  });

  it('Thumbnail Reach must be more than its Depth', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Thumbnail');
    await typeInto(user, 'Reach', '1/4');
    expect(profileFields(curves()[0]!)!.size).toBe(0.75);
    expect(screen.getByRole('alert')).toHaveTextContent('Reach must be more than the depth');
  });

  it('Bead Quirk must be more than 0 (the field\'s own guard); a Radius that runs off is refused', async () => {
    const user = userEvent.setup();
    open(top());
    await add(user, 'Bead');
    await typeInto(user, 'Quirk', '0');
    expect(profileFields(curves()[0]!)!.fillet).toBe(0.0625);
    expect(screen.getByRole('alert')).toHaveTextContent('Must be greater than zero');
    await typeInto(user, 'Radius', '1');
    expect(profileFields(curves()[0]!)!.size).toBe(0.25);
  });

  it('a fault a resize caused is kept and noted', () => {
    const c: CurveCut = { id: 'c1', ...defaultProfile(top(), 'roundover') };
    open(top({ thickness: 0.125, curves: [c] }));
    expect(curves()[0]).toEqual(c);
    expect(screen.getByRole('status')).toHaveTextContent(/at this size\.$/);
  });

  it('every preset is offered on a plain top', async () => {
    const user = userEvent.setup();
    open(top({ curves: [], holes: [] }));
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
    const curve: CurveCut = { id: 'c1', ...defaultProfile(b, 'roundover') };
    const at = { through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v' } as const;
    const ogee = profileCurve({ ...at, kind: 'ogee', size: 2, fillet: 0 });
    const thumb = profileCurve({ ...at, facing: 'u', kind: 'thumbnail', size: 2, depth: 0.25 });
    expect(refusalFor({ ...b, curves: [curve] }, curve, ogee, null)).toMatch(/^Runs past .* — reduce the Size first\.$/);
    expect(refusalFor({ ...b, curves: [curve] }, curve, thumb, null)).toMatch(/^Runs past .* — reduce the Reach first\.$/);
  });
});
