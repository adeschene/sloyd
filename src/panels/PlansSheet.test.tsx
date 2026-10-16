import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { buildCutList, createBoard, createDocument, defaultHole, flatDocument } from '../document/document';
import { ARCH } from '../document/curveFixtures';
import { cabinetsDoc } from '../document/treeFixtures';
import { PlansSheet } from './PlansSheet';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('PlansSheet', () => {
  it('says so when there is nothing to draw', () => {
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Nothing to draw yet.')).toBeInTheDocument();
  });

  it('a metric Plans sheet carries the sheet note; an imperial one does not', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    const first = render(<PlansSheet onClose={() => {}} />);
    expect(screen.queryByText('Dimensions in mm')).toBeNull();
    expect(first.container.querySelector('.cutlist-sheet')).not.toHaveClass('sheet-metric');
    first.unmount();
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    const second = render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Dimensions in mm')).toBeInTheDocument();
    expect(second.container.querySelector('.cutlist-sheet')).toHaveClass('sheet-metric');
  });

  it('the stylesheet repeats the note in every printed page\'s margin, for the metric named page only (fu 357)', () => {
    const css = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('@page metric-sheet { @top-right { content: "Dimensions in mm";');
    expect(css).toMatch(/@media print \{[^@]*\.sheet-metric \{ page: metric-sheet; \}/);
    // No unnamed @page rule carries it: an imperial print gains nothing.
    expect(css).not.toMatch(/@page \{[^}]*Dimensions in mm/);
  });

  it('draws the exploded view, the piece, then each assembly with its count', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    render(<PlansSheet onClose={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Exploded view', 'Cabinets', 'Cabinet × 3', 'Cabinet › Drawer × 4', 'Solo']);
  });

  it('notes mirrored copies', () => {
    const doc = cabinetsDoc();
    doc.instances = doc.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Cabinet × 3 (one copy mirrored)' })).toBeInTheDocument();
  });

  it('re-draws the exploded figure at the sheet amount, apart from the viewport', () => {
    act(() => useStore.getState().replaceDocument({ ...createDocument('One'), boards: [createBoard()] }));
    render(<PlansSheet onClose={() => {}} />);
    const fig = screen.getByRole('img', { name: 'Exploded view' });
    expect(fig).toHaveAttribute('data-amount', '0.6');
    fireEvent.change(screen.getByRole('slider', { name: 'Explode' }), { target: { value: '0.2' } });
    expect(screen.getByRole('img', { name: 'Exploded view' })).toHaveAttribute('data-amount', '0.2');
    expect(useStore.getState().explode).toBe(0);
  });

  it('closes on Escape and takes focus on mount', () => {
    const onClose = vi.fn();
    render(<PlansSheet onClose={onClose} />);
    expect(document.activeElement).toHaveClass('plans-sheet');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PlansSheet in metric (chunk 2)', () => {
  it('a metric document draws bare mm dimensions', () => {
    const doc = { ...createDocument('Metric'), units: { display: 'metric-mm' as const, precision: 16 }, boards: [createBoard({ length: 30, width: 12, thickness: 2 })] };
    act(() => useStore.getState().replaceDocument(doc));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const labels = [...container.querySelectorAll('.plans-figure text')].map((t) => t.textContent!);
    expect(labels).toContain('762');
    expect(labels.some((t) => /^\d+$/.test(t))).toBe(true);
    expect(labels.join(' ')).not.toContain('"');
  });
});

// Plans balloons spec §4: one balloon per cut-list row on the exploded view, none on the elevations.
describe('part balloons (plans balloons §4)', () => {
  const balloons = (fig: HTMLElement) => [...fig.querySelectorAll('.plans-balloon')].map((g) => Number(g.getAttribute('data-number')));
  it('one balloon per row, numbered as the cut list numbers it, only in the exploded view', () => {
    const doc = createDocument('Table');
    doc.boards.push(
      createBoard({ name: 'Top', length: 30, width: 18, thickness: 0.75, position: [0, 28, 0] }),
      createBoard({ name: 'Leg A', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0] }),
      createBoard({ name: 'Leg B', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [28.5, 0, 0] }),
    );
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    const rows = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows);
    const fig = screen.getByRole('img', { name: 'Exploded view' });
    expect(balloons(fig).sort()).toEqual(rows.map((r) => r.number).sort());
    for (const el of screen.getAllByRole('img').filter((e) => e !== fig)) expect(el.querySelector('.plans-balloon')).toBeNull();
  });
  it('a row hidden inside another part at explode 0 is named in the note, not ballooned', () => {
    const doc = createDocument('Box');
    doc.boards.push(
      createBoard({ name: 'Block', length: 10, width: 10, thickness: 10, position: [0, 0, 0] }),
      createBoard({ name: 'Inner', length: 2, width: 2, thickness: 2, position: [4, 4, 4] }),
    );
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Explode' }), { target: { value: '0' } });
    const inner = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Inner')!;
    expect(balloons(screen.getByRole('img', { name: 'Exploded view' }))).not.toContain(inner.number);
    expect(screen.getByText(`Not visible in this view: ${inner.number}.`)).toBeInTheDocument();
  });
  it('a row spread over assembly copies, one mirrored, still gets ONE balloon (Review Focus 5)', () => {
    const d = cabinetsDoc();
    d.instances = d.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    act(() => useStore.getState().replaceDocument(d));
    render(<PlansSheet onClose={() => {}} />);
    const nums = balloons(screen.getByRole('img', { name: 'Exploded view' }));
    expect(new Set(nums).size).toBe(nums.length);
    const rows = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows);
    expect(nums.every((n) => rows.some((r) => r.number === n))).toBe(true);
  });
});

describe('PlansSheet: feature keys (feature callouts spec §2.1, §4.5)', () => {
  const sections = (c: HTMLElement) => [...c.querySelectorAll('section.plans-section')]
    .map((sec) => [sec.querySelector('h3')!.textContent, [...sec.querySelectorAll('.plans-key li')].map((li) => li.textContent)]);

  it('a loose arched apron is keyed in the piece trio; the exploded view carries no tags', () => {
    const apron = { ...createBoard({ id: 'a', name: 'Apron', length: 30, width: 5, thickness: 0.75 }), curves: [ARCH] };
    act(() => useStore.getState().replaceDocument({ ...createDocument('Table'), boards: [apron] }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(sections(container)).toEqual([
      ['Exploded view', []],
      ['Table', ['A Arch, 24" span, 1-1/2" rise (radius 48-3/4")']],
    ]);
    expect(container.querySelector('[aria-label="Exploded view"] .plans-key-mark')).toBeNull();
  });

  it('a hole on the drawer front is keyed on the Drawer trio only', () => {
    const doc = cabinetsDoc();
    doc.definitions = doc.definitions.map((d) => (d.id !== 'dd' ? d : {
      ...d, boards: d.boards.map((b) => ({ ...b, holes: [{ id: 'h', ...defaultHole(b as never) }] })),
    }));
    act(() => useStore.getState().replaceDocument(doc));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const keyed = sections(container).filter(([, lines]) => (lines as string[]).length > 0);
    expect(keyed.map(([h]) => h)).toEqual(['Cabinet › Drawer × 4']);
  });
});
