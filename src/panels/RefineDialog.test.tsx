import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHANGES_SHOWN, RefineDialog } from './RefineDialog';
import type { RefineRun } from '../useRefine';
import type { CostRange } from '../generate/estimate';

const base = {
  hasKey: true, libraryAvailable: true, projectName: 'Box', refusal: null as string | null, initialDetail: 'moderate' as const,
  model: 'claude-opus-5-5', estimate: (): CostRange | null => ({ low: 0.05, high: 0.4 }), joined: false, run: null as RefineRun | null, live: false,
  onRun: vi.fn(), onCancel: vi.fn(), onOpenProject: vi.fn(), onOpenSettings: vi.fn(), onClose: vi.fn(),
};
const refineButton = () => screen.getByRole('button', { name: 'Refine' });

describe('RefineDialog', () => {
  it('shows a refusal and disables Refine', () => {
    render(<RefineDialog {...base} refusal="There is nothing to refine yet." />);
    expect(screen.getByRole('status').textContent).toBe('There is nothing to refine yet.');
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('a repair notice replaces the refusal text and Refine stays disabled', () => {
    render(<RefineDialog {...base} refusal="gate message" repairNotice={<p>NOTICE</p>} />);
    screen.getByText('NOTICE');
    expect(screen.queryByText('gate message')).toBeNull();
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('says storage is unavailable and disables Refine however well the form is filled (fu 239)', () => {
    render(<RefineDialog {...base} libraryAvailable={false} />);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    expect(screen.getByRole('status').textContent).toBe('Refine is unavailable — storage is unavailable, so the result would have nowhere to go.');
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('keeps every message in ONE status region when several hold (fu 239)', () => {
    const { rerender } = render(<RefineDialog {...base} refusal="There is nothing to refine yet." libraryAvailable={false} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('There is nothing to refine yet.Refine is unavailable — storage is unavailable, so the result would have nowhere to go.');
    rerender(<RefineDialog {...base} libraryAvailable={false} />);
    fireEvent.change(screen.getByLabelText('Max width'), { target: { value: 'wide' } });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe("A max size is not a length — try 36, 3', or 914mm.Refine is unavailable — storage is unavailable, so the result would have nowhere to go.");
    // A repair notice replaces the refusal text, but storage is still said.
    rerender(<RefineDialog {...base} refusal="gate" repairNotice={<p>NOTICE</p>} libraryAvailable={false} />);
    screen.getByText('NOTICE');
    expect(screen.getByRole('status').textContent).toMatch(/^Refine is unavailable/);
  });

  it('renders no status region when nothing needs saying (fu 239)', () => {
    render(<RefineDialog {...base} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disables Refine for a blank instruction or a bad limit (review focus 5)', () => {
    render(<RefineDialog {...base} />);
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: '   ' } });
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    expect(refineButton()).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('Max width'), { target: { value: 'wide' } });
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('preselects the detail it is given and sends the settings', () => {
    const onRun = vi.fn();
    render(<RefineDialog {...base} onRun={onRun} />);
    expect((screen.getByLabelText('Detail') as HTMLSelectElement).value).toBe('moderate');
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    fireEvent.change(screen.getByLabelText('Max height'), { target: { value: '36' } });
    fireEvent.click(refineButton());
    expect(onRun).toHaveBeenCalledWith({ instruction: 'taller', width: null, depth: null, height: 36, detail: 'moderate' });
  });

  it('shows the result: counts, new issues, at most CHANGES_SHOWN changes and "and N more"', () => {
    const changes = Array.from({ length: CHANGES_SHOWN + 3 }, (_, i) => ({ kind: 'added' as const, subject: 'part' as const, name: `P${i}`, copies: 1, text: `Added P${i}` }));
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, carried: { notKept: [], check: [] }, changes, joints: null,
      violations: [{ kind: 'hangs', message: 'Shelf is not held.', parts: ['Shelf'] }],
      present: [{ kind: 'overlap', message: 'A passes 0.5in into B along X.', parts: ['A', 'B'] }, { kind: 'tips', message: 't', parts: [] }],
    } };
    render(<RefineDialog {...base} run={run} />);
    expect(screen.getByText("Saved as 'Box — refined'")).toBeTruthy();
    expect(screen.getByText('1 new issue · 2 already present')).toBeTruthy();
    expect(screen.getByText('Shelf is not held.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent?.startsWith('Added P'))).toHaveLength(CHANGES_SHOWN);
    expect(screen.getByText('and 3 more')).toBeTruthy();
  });

  it('lists Not kept and Check at the new size in full, 14 items each, and nothing for an empty list', () => {
    const notKept = Array.from({ length: 14 }, (_, i) => `N${i}'s holes — no part named N${i} in the result.`);
    const check = Array.from({ length: 14 }, (_, i) => `C${i} was resized — its holes stay measured from where they were placed; check them.`);
    const run = (carried: { notKept: string[]; check: string[] }): RefineRun => ({ status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes: [], joints: null, violations: [], present: [], carried } });
    const { unmount } = render(<RefineDialog {...base} run={run({ notKept, check })} />);
    screen.getByText('Not kept:'); screen.getByText('Check at the new size:');
    for (const t of [...notKept, ...check]) screen.getByText(t);
    expect(screen.queryByText(/and \d+ more/)).toBeNull();
    unmount();
    render(<RefineDialog {...base} run={run({ notKept: [], check: [] })} />);
    expect(screen.queryByText('Not kept:')).toBeNull();
    expect(screen.queryByText('Check at the new size:')).toBeNull();
  });

  it('lists the parts kept as is because they lean or have angled holes, and the model\'s parts they replaced (splayed legs spec §8)', () => {
    const run = (leaning?: { kept: string[]; replaced: string[] }): RefineRun => ({ status: 'ready', projectId: 'p1', projectName: 'Stool — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes: [], joints: null, violations: [], present: [], carried: { notKept: [], check: [] }, ...(leaning ? { leaning } : {}) } });
    const { unmount } = render(<RefineDialog {...base} run={run({ kept: ['Front right', 'Back left'], replaced: ['Front right'] })} />);
    screen.getByText('Kept as is (leans, angled holes or round tenons): Front right, Back left');
    screen.getByText('Replaced by the kept part of the same name: Front right');
    unmount();
    const { unmount: u2 } = render(<RefineDialog {...base} run={run({ kept: ['Leg'], replaced: [] })} />);
    screen.getByText('Kept as is (leans, angled holes or round tenons): Leg');
    expect(screen.queryByText(/^Replaced by the kept part/)).toBeNull();
    u2();
    render(<RefineDialog {...base} run={run()} />);
    expect(screen.queryByText(/^Kept as is/)).toBeNull();
  });

  it('names box joints in the kept line only when a box-jointed part is kept (box-joints spec §7)', () => {
    const run = (leaning: { kept: string[]; replaced: string[]; boxJoints?: true }): RefineRun => ({ status: 'ready', projectId: 'p1', projectName: 'Drawer — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes: [], joints: null, violations: [], present: [], carried: { notKept: [], check: [] }, leaning } });
    render(<RefineDialog {...base} run={run({ kept: ['Front', 'Side left'], replaced: [], boxJoints: true })} />);
    screen.getByText('Kept as is (leans, angled holes, round tenons or box joints): Front, Side left');
  });

  it('names dovetails in the kept line only when a dovetailed part is kept, and both kinds when both (dovetails spec §7)', () => {
    const run = (leaning: { kept: string[]; replaced: string[]; boxJoints?: true; dovetails?: true }): RefineRun => ({ status: 'ready', projectId: 'p1', projectName: 'Drawer — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes: [], joints: null, violations: [], present: [], carried: { notKept: [], check: [] }, leaning } });
    const { unmount } = render(<RefineDialog {...base} run={run({ kept: ['Front', 'Side left'], replaced: [], dovetails: true })} />);
    screen.getByText('Kept as is (leans, angled holes, round tenons or dovetails): Front, Side left');
    unmount();
    render(<RefineDialog {...base} run={run({ kept: ['Drawer 1'], replaced: [], boxJoints: true, dovetails: true })} />);
    screen.getByText('Kept as is (leans, angled holes, round tenons, box joints or dovetails): Drawer 1');
  });

  it('shows a new issue\'s displayed copy (a metric project), not the model\'s inches (fu 355)', () => {
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, carried: { notKept: [], check: [] }, changes: [], joints: null, present: [],
      violations: [{ kind: 'overlap', message: 'A passes 0.5in into B along X.', shown: 'A passes 12.7 mm into B along X.', parts: ['A', 'B'] }],
    } };
    render(<RefineDialog {...base} run={run} />);
    expect(screen.getByText('A passes 12.7 mm into B along X.')).toBeTruthy();
    expect(screen.queryByText('A passes 0.5in into B along X.')).toBeNull();
  });

  it('shows the estimate as a range (fu 236)', () => {
    render(<RefineDialog {...base} />);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    expect(screen.getByText('≈ $0.05–$0.40')).toBeTruthy();
  });

  it('shows the joinery-call note in the estimate for a joined design', () => {
    render(<RefineDialog {...base} joined />);
    expect(screen.getByText('plus a joinery call if new meetings appear')).toBeTruthy();
  });

  it('shows the joints line on a joined result', () => {
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.1, outcome: {
      doc: {} as never, usage: {} as never, carried: { notKept: [], check: [] }, changes: [], violations: [], present: [],
      joints: { kept: 26, chosen: 3, dropped: 2, skipped: ['Shelf 3 no longer meets Left after an earlier joint'],
        notes: ['Rail meets Leg: no mortise, a bore sits in the zone.'] } } };
    render(<RefineDialog {...base} joined run={run} />);
    expect(screen.getByText('26 joints kept · 3 chosen · 2 dropped')).toBeTruthy();
    expect(screen.getByText('Shelf 3 no longer meets Left after an earlier joint')).toBeTruthy();
    expect(screen.getByText('Rail meets Leg: no mortise, a bore sits in the zone.')).toBeTruthy();
  });

  it('says the joints were not re-applied when joinery refused the refined design (AI-tapers spec §5.4)', () => {
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.1, outcome: {
      doc: {} as never, usage: {} as never, carried: { notKept: [], check: [] }, changes: [], violations: [], present: [],
      joints: { kept: 0, chosen: 0, dropped: 0, skipped: [], notes: [], notJoined: 'MSG' } } };
    render(<RefineDialog {...base} joined run={run} />);
    expect(screen.getByText('Joints were not re-applied. MSG')).toBeTruthy();
    expect(screen.queryByText(/joints kept/)).toBeNull();
  });

  it('shows an unjoined result\'s taper fault once, in the person\'s words (fu 311)', () => {
    const taper = { kind: 'angle-joint' as const, message: 'MODEL WORDS', parts: ['Leg', 'Rail'] };
    const other = { kind: 'overlap' as const, message: 'A passes 0.5in into B along X.', parts: ['A', 'B'] };
    const outcome = (notJoined?: string) => ({ status: 'ready' as const, projectId: 'p1', projectName: 'Box — refined', costUsd: 0.1, outcome: {
      doc: {} as never, usage: {} as never, carried: { notKept: [], check: [] }, changes: [], violations: [taper, other], present: [],
      joints: { kept: 0, chosen: 0, dropped: 0, skipped: [], notes: [], ...(notJoined ? { notJoined } : {}) } } });
    const { unmount } = render(<RefineDialog {...base} joined run={outcome('PERSON WORDS')} />);
    expect(screen.getByText('Joints were not re-applied. PERSON WORDS')).toBeTruthy();
    expect(screen.queryByText('MODEL WORDS')).toBeNull();
    expect(screen.getByText(other.message)).toBeTruthy();
    expect(screen.getByText('2 new issues · 0 already present')).toBeTruthy();
    unmount();
    // Joined normally (no note), the fault's own line is the only place it appears, so it stays.
    render(<RefineDialog {...base} joined run={outcome()} />);
    expect(screen.getByText('MODEL WORDS')).toBeTruthy();
  });

  it('labels joinery\'s repair and retry rounds; the design\'s stay unlabelled (fu 242)', () => {
    const cases: [RefineRun, string][] = [
      [{ status: 'repairing', round: 1, issues: 2, join: false, costUsd: null }, 'Fixing 2 issues (round 1/3)…'],
      [{ status: 'retrying', round: 2, join: false, costUsd: null }, 'Retrying (round 2/3)…'],
      [{ status: 'repairing', round: 1, issues: 1, join: true, costUsd: null }, 'Choosing joints — fixing 1 issue (round 1/3)…'],
      [{ status: 'retrying', round: 3, join: true, costUsd: null }, 'Choosing joints — retrying (round 3/3)…'],
    ];
    for (const [run, text] of cases) {
      const { unmount } = render(<RefineDialog {...base} joined run={run} live />);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });

  it('says "Choosing joints…" while joining', () => {
    render(<RefineDialog {...base} joined run={{ status: 'joining', costUsd: null }} live />);
    expect(screen.getByText('Choosing joints…')).toBeTruthy();
  });
});
