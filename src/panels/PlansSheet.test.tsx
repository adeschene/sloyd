import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { buildCutList, createBoard, createDocument, defaultHole, flatDocument } from '../document/document';
import { ARCH } from '../document/curveFixtures';
import { cabinetsDoc } from '../document/treeFixtures';
import { PlansSheet } from './PlansSheet';
import { PlanTrio, trioScale } from './PlanFigure';
import { labelWidth } from './diagramLabels';
import { EXT_GAP } from './planDims';
import { DIM_BAND, DIM_ROW, MAX_PLAN_SCALE, PLACED_ROWS_MAX, PLAN_WIDTH, TRIO_MAX_HEIGHT, VIEW_GAP } from './planLayout';
import { IMPERIAL } from '../units/length';
import type { PlacedDimension } from '../document/types';
import { boardsBounds } from '../document/geometry';
import { worldParts } from '../document/tree';

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

describe('PlansSheet section views (fu 256)', () => {
  const one = () => ({ ...createDocument('One'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 0.75 })] });

  it('with Section off the sheet has no marker and no section block', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelector('.plans-cut-mark')).toBeNull();
    expect(screen.queryByText(/Section A–A/)).toBeNull();
  });

  it('with Section on: one marker on the piece trio, the section right after it, none on the assemblies', () => {
    const doc = cabinetsDoc();
    act(() => useStore.getState().replaceDocument(doc));
    // Through the middle of the piece, so the cut meets wood whatever the fixture's layout.
    const bounds = boardsBounds(worldParts(doc))!;
    act(() => useStore.getState().setSection({ axis: 'front', at: (bounds.min[2] + bounds.max[2]) / 2, flip: false }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelectorAll('.plans-cut-mark')).toHaveLength(1);
    expect(container.querySelectorAll('path.plans-cap').length).toBeGreaterThan(0);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Exploded view');
    expect(headings[1]).toBe('Cabinets');
    expect(headings[2]).toMatch(/^Section A–A — Front cut /);
    expect(headings.slice(3)).toEqual(['Cabinet × 3', 'Cabinet › Drawer × 4', 'Solo']);
  });

  it('a cut meeting no wood says so in one line', () => {
    act(() => useStore.getState().replaceDocument(one()));
    act(() => useStore.getState().setSection({ axis: 'front', at: 50, flip: false }));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Section A–A: the cut meets no part of the assembled piece.')).toBeInTheDocument();
  });

  it('cuts the assembled piece while the viewport is exploded, with the note', () => {
    act(() => useStore.getState().replaceDocument(one()));
    act(() => useStore.getState().setSection({ axis: 'front', at: 5, flip: false }));
    act(() => useStore.setState({ explode: 0.5 }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelectorAll('path.plans-cap')).toHaveLength(1);
    expect(screen.getByText("Cut through the assembled piece at the viewport's position.")).toBeInTheDocument();
    act(() => useStore.setState({ explode: 0 }));
  });
});

describe('PlansSheet construction lines (lines2 §6)', () => {
  const withLines = () => ({
    ...cabinetsDoc(),
    guides: [
      { id: 'g1', at: [0, 10, 0] as [number, number, number], axis: 'x' as const },
      { id: 'g2', at: [0, 0, 0] as [number, number, number], to: [1, 1, 0] as [number, number, number] },
    ],
  });
  const figures = (c: HTMLElement) => [...c.querySelectorAll('figure.plans-figure-wrap')];

  it('with the box unticked, the piece figure is byte for byte the same as without lines', () => {
    act(() => useStore.getState().replaceDocument({ ...withLines(), guides: [] }));
    const a = render(<PlansSheet onClose={() => {}} />);
    const without = figures(a.container)[1]!.outerHTML;
    a.unmount();
    act(() => useStore.getState().replaceDocument(withLines()));
    const b = render(<PlansSheet onClose={() => {}} />);
    expect(figures(b.container)[1]!.outerHTML).toBe(without);
    expect(b.container.querySelector('.plan-construction')).toBeNull();
  });

  it('ticked, only the piece figure draws them, one path per view', () => {
    act(() => useStore.getState().replaceDocument(withLines()));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Construction lines' }));
    const figs = figures(container);
    // One path per view, each holding every line that view shows (the X line is end-on in Side; the oblique is not).
    expect(figs[1]!.querySelectorAll('path.plan-construction')).toHaveLength(3);
    expect(figs.filter((f, i) => i !== 1 && f.querySelector('.plan-construction'))).toHaveLength(0);
  });

  it('the checkbox is disabled when the document has points only', () => {
    act(() => useStore.getState().replaceDocument({ ...cabinetsDoc(), guides: [{ id: 'p', at: [0, 0, 0] }] }));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Construction lines' })).toBeDisabled();
  });
});

// Placed-dimensions spec §6 (Task 6).
const pinDoc = () => {
  const doc = createDocument('Pin');
  doc.boards.push(
    createBoard({ id: 'top', name: 'Top', length: 30, width: 18, thickness: 0.75, position: [0, 28, 0] }),
    createBoard({ id: 'la', name: 'Leg A', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0] }),
    createBoard({ id: 'lb', name: 'Leg B', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [28.5, 0, 0] }),
  );
  return doc;
};

/** The piece figure of PIN_DOC, captured from the build BEFORE placed dimensions reached the sheet (placed-dimensions
 *  spec §6.2: a sheet with no placed dimensions is byte for byte as before). Never regenerate it from the current build. */
const PIECE_PIN = "<figure class=\"plans-figure-wrap\"><svg class=\"plans-figure\" viewBox=\"0 0 1000 980.4166666666666\" style=\"width: 100%;\" font-size=\"20\" role=\"img\" aria-label=\"Pin: front, side and plan\"><g><path class=\"plan-hidden\" d=\"M56.00 56.00L526.00 56.00M56.00 338.00L526.00 338.00M56.00 56.00L56.00 338.00M526.00 56.00L526.00 338.00M56.00 56.00L79.50 56.00M56.00 79.50L79.50 79.50M56.00 56.00L79.50 56.00M56.00 79.50L79.50 79.50M56.00 56.00L56.00 79.50M79.50 56.00L79.50 79.50M56.00 56.00L56.00 79.50M79.50 56.00L79.50 79.50M502.50 56.00L526.00 56.00M502.50 79.50L526.00 79.50M502.50 56.00L526.00 56.00M502.50 79.50L526.00 79.50M502.50 56.00L502.50 79.50M526.00 56.00L526.00 79.50M502.50 56.00L502.50 79.50M526.00 56.00L526.00 79.50\"></path><path class=\"plan-visible\" d=\"M56.00 56.00L526.00 56.00M56.00 338.00L526.00 338.00M56.00 56.00L56.00 338.00M526.00 56.00L526.00 338.00\"></path><g><line class=\"plan-ext\" x1=\"56\" y1=\"338\" x2=\"56\" y2=\"372\"></line><line class=\"plan-ext\" x1=\"526\" y1=\"338\" x2=\"526\" y2=\"372\"></line><g class=\"plan-dim\"><line x1=\"56\" y1=\"366\" x2=\"526\" y2=\"366\"></line><line x1=\"53\" y1=\"369\" x2=\"59\" y2=\"363\"></line><line x1=\"523\" y1=\"369\" x2=\"529\" y2=\"363\"></line><text class=\"plan-dim-label\" x=\"291\" y=\"362\" text-anchor=\"middle\">30\"</text></g></g><g><line class=\"plan-ext\" x1=\"79.5\" y1=\"56\" x2=\"79.5\" y2=\"22\"></line><line class=\"plan-ext\" x1=\"502.5\" y1=\"56\" x2=\"502.5\" y2=\"22\"></line><g class=\"plan-dim\"><line x1=\"79.5\" y1=\"28\" x2=\"502.5\" y2=\"28\"></line><line x1=\"76.5\" y1=\"31\" x2=\"82.5\" y2=\"25\"></line><line x1=\"499.5\" y1=\"31\" x2=\"505.5\" y2=\"25\"></line><text class=\"plan-dim-label\" x=\"291\" y=\"24\" text-anchor=\"middle\">27\"</text></g></g><g><line class=\"plan-ext\" x1=\"526\" y1=\"338\" x2=\"560\" y2=\"338\"></line><line class=\"plan-ext\" x1=\"526\" y1=\"56\" x2=\"560\" y2=\"56\"></line><g class=\"plan-dim\"><line x1=\"554\" y1=\"338\" x2=\"554\" y2=\"56\"></line><line x1=\"551\" y1=\"341\" x2=\"557\" y2=\"335\"></line><line x1=\"551\" y1=\"59\" x2=\"557\" y2=\"53\"></line><text class=\"plan-dim-label\" x=\"550\" y=\"197\" text-anchor=\"middle\" transform=\"rotate(-90 550 197)\">18\"</text></g></g><g><line class=\"plan-ext\" x1=\"56\" y1=\"338\" x2=\"22\" y2=\"338\"></line><line class=\"plan-ext\" x1=\"56\" y1=\"79.5\" x2=\"22\" y2=\"79.5\"></line><g class=\"plan-dim\"><line x1=\"28\" y1=\"338\" x2=\"28\" y2=\"79.5\"></line><line x1=\"25\" y1=\"341\" x2=\"31\" y2=\"335\"></line><line x1=\"25\" y1=\"82.5\" x2=\"31\" y2=\"76.5\"></line><text class=\"plan-dim-label\" x=\"24\" y=\"208.75\" text-anchor=\"middle\" transform=\"rotate(-90 24 208.75)\">16-1/2\"</text></g></g></g><g><path class=\"plan-hidden\" d=\"M56.00 485.75L526.00 485.75M56.00 474.00L526.00 474.00M56.00 485.75L56.00 474.00M526.00 485.75L526.00 474.00M56.00 924.42L56.00 485.75M79.50 924.42L79.50 485.75M56.00 924.42L79.50 924.42M56.00 485.75L79.50 485.75M56.00 485.75L79.50 485.75M502.50 924.42L502.50 485.75M526.00 924.42L526.00 485.75M502.50 924.42L526.00 924.42M502.50 485.75L526.00 485.75M502.50 485.75L526.00 485.75\"></path><path class=\"plan-visible\" d=\"M56.00 485.75L526.00 485.75M56.00 474.00L526.00 474.00M56.00 485.75L56.00 474.00M526.00 485.75L526.00 474.00M56.00 924.42L56.00 485.75M79.50 924.42L79.50 485.75M56.00 924.42L79.50 924.42M502.50 924.42L502.50 485.75M526.00 924.42L526.00 485.75M502.50 924.42L526.00 924.42\"></path><g><line class=\"plan-ext\" x1=\"56\" y1=\"924.4166666666666\" x2=\"56\" y2=\"958.4166666666666\"></line><line class=\"plan-ext\" x1=\"526\" y1=\"924.4166666666666\" x2=\"526\" y2=\"958.4166666666666\"></line><g class=\"plan-dim\"><line x1=\"56\" y1=\"952.4166666666666\" x2=\"526\" y2=\"952.4166666666666\"></line><line x1=\"53\" y1=\"955.4166666666666\" x2=\"59\" y2=\"949.4166666666666\"></line><line x1=\"523\" y1=\"955.4166666666666\" x2=\"529\" y2=\"949.4166666666666\"></line><text class=\"plan-dim-label\" x=\"291\" y=\"948.4166666666666\" text-anchor=\"middle\">30\"</text></g></g><g><line class=\"plan-ext\" x1=\"79.5\" y1=\"474\" x2=\"79.5\" y2=\"440\"></line><line class=\"plan-ext\" x1=\"502.5\" y1=\"474\" x2=\"502.5\" y2=\"440\"></line><g class=\"plan-dim\"><line x1=\"79.5\" y1=\"446\" x2=\"502.5\" y2=\"446\"></line><line x1=\"76.5\" y1=\"449\" x2=\"82.5\" y2=\"443\"></line><line x1=\"499.5\" y1=\"449\" x2=\"505.5\" y2=\"443\"></line><text class=\"plan-dim-label\" x=\"291\" y=\"442\" text-anchor=\"middle\">27\"</text></g></g><g><line class=\"plan-ext\" x1=\"526\" y1=\"924.4166666666666\" x2=\"560\" y2=\"924.4166666666666\"></line><line class=\"plan-ext\" x1=\"526\" y1=\"474\" x2=\"560\" y2=\"474\"></line><g class=\"plan-dim\"><line x1=\"554\" y1=\"924.4166666666666\" x2=\"554\" y2=\"474\"></line><line x1=\"551\" y1=\"927.4166666666666\" x2=\"557\" y2=\"921.4166666666666\"></line><line x1=\"551\" y1=\"477\" x2=\"557\" y2=\"471\"></line><text class=\"plan-dim-label\" x=\"550\" y=\"699.2083333333333\" text-anchor=\"middle\" transform=\"rotate(-90 550 699.2083333333333)\">28-3/4\"</text></g></g><g><line class=\"plan-ext\" x1=\"56\" y1=\"924.4166666666666\" x2=\"22\" y2=\"924.4166666666666\"></line><line class=\"plan-ext\" x1=\"56\" y1=\"485.75\" x2=\"22\" y2=\"485.75\"></line><g class=\"plan-dim\"><line x1=\"28\" y1=\"924.4166666666666\" x2=\"28\" y2=\"485.75\"></line><line x1=\"25\" y1=\"927.4166666666666\" x2=\"31\" y2=\"921.4166666666666\"></line><line x1=\"25\" y1=\"488.75\" x2=\"31\" y2=\"482.75\"></line><text class=\"plan-dim-label\" x=\"24\" y=\"705.0833333333333\" text-anchor=\"middle\" transform=\"rotate(-90 24 705.0833333333333)\">28\"</text></g></g></g><g><path class=\"plan-hidden\" d=\"M944.00 485.75L662.00 485.75M944.00 474.00L662.00 474.00M944.00 485.75L944.00 474.00M662.00 485.75L662.00 474.00M944.00 924.42L944.00 485.75M920.50 924.42L920.50 485.75M944.00 924.42L944.00 485.75M920.50 924.42L920.50 485.75M944.00 924.42L920.50 924.42M944.00 924.42L920.50 924.42M944.00 485.75L920.50 485.75M944.00 485.75L920.50 485.75M944.00 924.42L944.00 485.75M920.50 924.42L920.50 485.75M944.00 924.42L920.50 924.42M944.00 485.75L920.50 485.75\"></path><path class=\"plan-visible\" d=\"M944.00 485.75L662.00 485.75M944.00 474.00L662.00 474.00M944.00 485.75L944.00 474.00M662.00 485.75L662.00 474.00M944.00 924.42L944.00 485.75M920.50 924.42L920.50 485.75M944.00 924.42L920.50 924.42M944.00 485.75L920.50 485.75\"></path><g><line class=\"plan-ext\" x1=\"662\" y1=\"924.4166666666666\" x2=\"662\" y2=\"958.4166666666666\"></line><line class=\"plan-ext\" x1=\"944\" y1=\"924.4166666666666\" x2=\"944\" y2=\"958.4166666666666\"></line><g class=\"plan-dim\"><line x1=\"662\" y1=\"952.4166666666666\" x2=\"944\" y2=\"952.4166666666666\"></line><line x1=\"659\" y1=\"955.4166666666666\" x2=\"665\" y2=\"949.4166666666666\"></line><line x1=\"941\" y1=\"955.4166666666666\" x2=\"947\" y2=\"949.4166666666666\"></line><text class=\"plan-dim-label\" x=\"803\" y=\"948.4166666666666\" text-anchor=\"middle\">18\"</text></g></g><g><line class=\"plan-ext\" x1=\"662\" y1=\"474\" x2=\"662\" y2=\"440\"></line><line class=\"plan-ext\" x1=\"920.5\" y1=\"474\" x2=\"920.5\" y2=\"440\"></line><g class=\"plan-dim\"><line x1=\"662\" y1=\"446\" x2=\"920.5\" y2=\"446\"></line><line x1=\"659\" y1=\"449\" x2=\"665\" y2=\"443\"></line><line x1=\"917.5\" y1=\"449\" x2=\"923.5\" y2=\"443\"></line><text class=\"plan-dim-label\" x=\"791.25\" y=\"442\" text-anchor=\"middle\">16-1/2\"</text></g></g><g><line class=\"plan-ext\" x1=\"944\" y1=\"924.4166666666666\" x2=\"978\" y2=\"924.4166666666666\"></line><line class=\"plan-ext\" x1=\"944\" y1=\"474\" x2=\"978\" y2=\"474\"></line><g class=\"plan-dim\"><line x1=\"972\" y1=\"924.4166666666666\" x2=\"972\" y2=\"474\"></line><line x1=\"969\" y1=\"927.4166666666666\" x2=\"975\" y2=\"921.4166666666666\"></line><line x1=\"969\" y1=\"477\" x2=\"975\" y2=\"471\"></line><text class=\"plan-dim-label\" x=\"968\" y=\"699.2083333333333\" text-anchor=\"middle\" transform=\"rotate(-90 968 699.2083333333333)\">28-3/4\"</text></g></g><g><line class=\"plan-ext\" x1=\"662\" y1=\"924.4166666666666\" x2=\"628\" y2=\"924.4166666666666\"></line><line class=\"plan-ext\" x1=\"662\" y1=\"485.75\" x2=\"628\" y2=\"485.75\"></line><g class=\"plan-dim\"><line x1=\"634\" y1=\"924.4166666666666\" x2=\"634\" y2=\"485.75\"></line><line x1=\"631\" y1=\"927.4166666666666\" x2=\"637\" y2=\"921.4166666666666\"></line><line x1=\"631\" y1=\"488.75\" x2=\"637\" y2=\"482.75\"></line><text class=\"plan-dim-label\" x=\"630\" y=\"705.0833333333333\" text-anchor=\"middle\" transform=\"rotate(-90 630 705.0833333333333)\">28\"</text></g></g></g></svg><ul class=\"plans-notes\"><li>Plan: 2 small width spacings not labelled</li><li>Plan: 1 small depth spacing not labelled</li><li>Front: 2 small width spacings not labelled</li><li>Front: 1 small height spacing not labelled</li><li>Side: 1 small depth spacing not labelled</li><li>Side: 1 small height spacing not labelled</li></ul></figure>";

describe('PlansSheet placed dimensions (placed-dimensions spec §6)', () => {
  const pieceFigure = (c: HTMLElement) => c.querySelectorAll('figure.plans-figure-wrap')[1]!;

  it('a sheet with no placed dimensions is byte for byte the build before them', () => {
    act(() => useStore.getState().replaceDocument(pinDoc()));
    expect(useStore.getState().doc.dimensions).toEqual([]);
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(pieceFigure(container).outerHTML).toBe(PIECE_PIN);
  });

  it('PlanTrio with placed=[] is byte for byte PlanTrio without it', () => {
    const parts = worldParts(pinDoc());
    const a = render(<PlanTrio parts={parts} units={IMPERIAL} label="Pin" />);
    const without = a.container.innerHTML;
    a.unmount();
    const b = render(<PlanTrio parts={parts} units={IMPERIAL} label="Pin" placed={[]} />);
    expect(b.container.innerHTML).toBe(without);
  });

  const xDim = (from: number, to: number, id = 'd1'): PlacedDimension => ({ id, axis: 'x', a: { at: [from, 0, 0] }, b: { at: [to, 0, 0] } });
  // The trio draws top, front, side in that order, each one <g> (feature tags and the cutting mark come after).
  const views = (fig: Element) => [...fig.querySelectorAll('svg.plans-figure > g')].slice(0, 3);

  it('one X dimension: the piece\'s front view gains one placed group; the top, side and assembly trios none', () => {
    act(() => useStore.getState().replaceDocument({ ...cabinetsDoc(), dimensions: [xDim(0, 10)] }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const figs = [...container.querySelectorAll('figure.plans-figure-wrap')];
    const [top, front, side] = views(figs[1]!);
    expect(front!.querySelectorAll('.plan-dim-placed')).toHaveLength(1);
    expect(top!.querySelector('.plan-dim-placed')).toBeNull();
    expect(side!.querySelector('.plan-dim-placed')).toBeNull();
    expect(figs.filter((f, i) => i !== 1 && f.querySelector('.plan-dim-placed'))).toHaveLength(0);
    expect(front!.querySelector('.plan-dim-placed text')!.textContent).toBe('10"');
  });

  it('a label wider than its span is drawn past it, left-anchored, never dropped', () => {
    act(() => useStore.getState().replaceDocument({ ...pinDoc(), dimensions: [xDim(10, 10.25)] }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const g = views(pieceFigure(container))[1]!.querySelector('.plan-dim-placed')!;
    const text = g.querySelector('text')!;
    expect(text.textContent).toBe('1/4"');
    expect(text.getAttribute('text-anchor')).toBe('start');
    const dimLine = g.querySelector('.plan-dim > line')!;
    expect(Number(text.getAttribute('x'))).toBe(Number(dimLine.getAttribute('x2')) + EXT_GAP);
  });

  /** Each placed label's drawn extent along its text, from its anchor and `labelWidth` (never from the layout code). */
  const labelExtents = (svg: Element) => [...svg.querySelectorAll('.plan-dim-placed text')].map((t) => {
    const w = labelWidth(t.textContent!);
    const rotated = t.hasAttribute('transform');
    const at = Number(t.getAttribute(rotated ? 'y' : 'x'));
    const anchor = t.getAttribute('text-anchor');
    // Rotated −90, the text runs UP the paper: `start` extends to smaller y.
    const [lo, hi] = anchor === 'middle' ? [at - w / 2, at + w / 2]
      : (anchor === 'start') !== rotated ? [at, at + w] : [at - w, at];
    return { text: t, rotated, lo, hi };
  });
  /** Every line of every placed dimension (extension, dimension line, ticks) lies inside the viewBox. */
  const lines = (svg: Element, what = '') => {
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    for (const l of svg.querySelectorAll('.plan-dim-placed line')) {
      for (const [x, y] of [['x1', 'y1'], ['x2', 'y2']] as const) {
        const px = Number(l.getAttribute(x));
        const py = Number(l.getAttribute(y));
        expect(px >= 0 && px <= width! && py >= 0 && py <= height!, `${what} line end (${px}, ${py}) of ${width}×${height}`).toBe(true);
      }
    }
  };
  const inside = (svg: Element, what = '') => {
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    for (const e of labelExtents(svg)) {
      expect(e.lo, `${what} ${e.text.textContent} starts at ${e.lo}`).toBeGreaterThanOrEqual(0);
      expect(e.hi, `${what} ${e.text.textContent} ends at ${e.hi}`).toBeLessThanOrEqual(e.rotated ? height! : width!);
    }
  };

  it('a past label with no room past the side\'s right edge is drawn before from, inside the figure (Amended ruling 3)', () => {
    const parts = [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 0.75 })];
    // Z 1-1/4" at the side's right edge (z = 0): the label does not fit the viewBox's right margin.
    const placed: PlacedDimension[] = [{ id: 'z', axis: 'z', a: { at: [0, 0, 0] }, b: { at: [0, 0, 1.25] } }];
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="x" placed={placed} />);
    const svg = container.querySelector('svg')!;
    const z = labelExtents(svg)[0]!.text;
    expect(z.textContent).toBe('1-1/4"');
    expect(z.getAttribute('text-anchor')).toBe('end');
    expect(Number(z.getAttribute('x'))).toBe(Number(z.closest('.plan-dim')!.querySelector('line')!.getAttribute('x1')) - EXT_GAP);
    inside(svg);
  });

  it('a Y label at the front\'s top goes up into the plan–front gap, never off the bottom (fix round 2 repro)', () => {
    // Round 1 flipped this label below from = the floor, off the viewBox's bottom (to y = 490.5 of 468.07).
    act(() => useStore.getState().replaceDocument({
      ...createDocument('R'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 1.5 })],
      dimensions: [{ id: 'y', axis: 'y', a: { at: [0, 0, 0] }, b: { at: [0, 1.5, 0] } }],
    }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const svg = pieceFigure(container).querySelector('svg')!;
    const [y] = labelExtents(svg);
    expect(y!.text.textContent).toBe('1-1/2"');
    expect(y!.text.getAttribute('text-anchor')).toBe('start');
    inside(svg);
  });

  it('the sweep: every placed label lies inside its figure, any board, axis, face and short span', () => {
    const boards = [
      createBoard({ id: 'flat', length: 30, width: 11.25, thickness: 1.5 }),
      createBoard({ id: 'tall', length: 84, width: 18, thickness: 12, posture: 'upright' }),
      createBoard({ id: 'small', length: 3, width: 3, thickness: 0.75 }),
      // A tall side panel seen edge-on in Side: too little room either side of a Z label, so the layout must reserve it.
      createBoard({ id: 'thin', length: 84, width: 18, thickness: 0.75, posture: 'upright' }),
    ];
    let cases = 0;
    for (const board of boards) {
      const bb = boardsBounds([board])!;
      for (const i of [0, 1, 2] as const) {
        for (const at of ['min', 'mid', 'max', 'ends at max'] as const) {
          for (const span of [0.25, 0.75, 1.5]) {
            const from = at === 'min' ? bb.min[i] : at === 'mid' ? (bb.min[i] + bb.max[i]) / 2 : at === 'max' ? bb.max[i] : bb.max[i] - span;
            const p = (v: number) => { const q: [number, number, number] = [bb.min[0], bb.min[1], bb.min[2]]; q[i] = v; return q; };
            const axis = (['x', 'y', 'z'] as const)[i];
            act(() => useStore.getState().replaceDocument({
              ...createDocument('S'), boards: [board], dimensions: [{ id: 'd', axis, a: { at: p(from) }, b: { at: p(from + span) } }],
            }));
            const { container, unmount } = render(<PlansSheet onClose={() => {}} />);
            const svg = pieceFigure(container).querySelector('svg')!;
            // Drawn only when both ends lie on the piece's drawing (Amended ruling 4), judged on the board's own bounds here.
            const onPiece = from >= bb.min[i] - 1e-9 && from + span <= bb.max[i] + 1e-9;
            expect(svg.querySelectorAll('.plan-dim-placed text')).toHaveLength(onPiece ? 1 : 0);
            expect(pieceFigure(container).textContent!.includes('reaches past the drawing')).toBe(!onPiece);
            inside(svg, `${board.id} ${axis} from ${from} span ${span}`);
            lines(svg, `${board.id} ${axis} from ${from} span ${span}`);
            unmount();
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(144);
  });

  it('every placed label of a crowded figure lies inside the viewBox', () => {
    const doc = cabinetsDoc();
    const b = boardsBounds(worldParts(doc))!;
    const dims: PlacedDimension[] = [];
    for (const [axis, i] of [['x', 0], ['y', 1], ['z', 2]] as const) {
      for (const [lo, hi] of [[b.min[i], b.min[i] + 0.25], [b.max[i] - 0.25, b.max[i]], [b.min[i], b.max[i]], [b.max[i] - 1.25, b.max[i]]]) {
        const p = (v: number) => { const q: [number, number, number] = [b.min[0], b.min[1], b.min[2]]; q[i] = v; return q; };
        dims.push({ id: `${axis}${dims.length}`, axis, a: { at: p(lo!) }, b: { at: p(hi!) } });
      }
    }
    const { container } = render(<PlanTrio parts={worldParts(doc)} units={IMPERIAL} label="c" placed={dims} />);
    const svg = container.querySelector('svg')!;
    const onPiece = dims.filter((d) => {
      const i = ({ x: 0, y: 1, z: 2 } as const)[d.axis];
      const [a, c] = [(d.a as { at: number[] }).at[i]!, (d.b as { at: number[] }).at[i]!];
      return Math.min(a, c) >= b.min[i] - 1e-9 && Math.max(a, c) <= b.max[i] + 1e-9;
    });
    expect(onPiece.length).toBeGreaterThan(8);
    expect(svg.querySelectorAll('.plan-dim-placed')).toHaveLength(onPiece.length);
    inside(svg);
    lines(svg);
  });

  it('a dimension reaching past the drawing is not drawn, and the note says so (Amended ruling 4)', () => {
    // The re-review's probe: Z −60..−59.75 beside a 30 × 11.25 × 1.5 board drew at x ≈ 1089 of 1000.
    act(() => useStore.getState().replaceDocument({
      ...createDocument('P'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 1.5 })],
      dimensions: [{ id: 'z', axis: 'z', a: { at: [0, 0, -60] }, b: { at: [0, 0, -59.75] } }],
    }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelector('.plan-dim-placed')).toBeNull();
    expect(screen.getByText('Side: 1 placed dimension not drawn — it reaches past the drawing (Z 1/4")')).toBeInTheDocument();
  });

  it('two off the drawing read plural; one across the drawing (perpendicular) is off it too', () => {
    act(() => useStore.getState().replaceDocument({
      ...createDocument('P'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 1.5 })],
      dimensions: [
        { id: 'x', axis: 'x', a: { at: [-5, 0, 0] }, b: { at: [3, 0, 0] } },
        // Along X within the board, but 4" above it: its anchors are off the Front drawing across the span.
        { id: 'x2', axis: 'x', a: { at: [0, 5.5, 0] }, b: { at: [2, 5.5, 0] } },
      ],
    }));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Front: 2 placed dimensions not drawn — they reach past the drawing (X 8", X 2")')).toBeInTheDocument();
  });

  it('far off the piece, along or across the span, nothing placed leaves the paper (Amended ruling 4)', () => {
    const board = createBoard({ id: 'b', length: 30, width: 11.25, thickness: 1.5 });
    const bb = boardsBounds([board])!;
    for (const i of [0, 1, 2] as const) {
      const axis = (['x', 'y', 'z'] as const)[i];
      for (const shift of [-60, 60]) {
        for (const across of [false, true]) {
          // Along: the span itself sits 60" off. Across: the span is on the piece, the anchors 60" off another axis.
          const j = (i + 1) % 3;
          const p = (v: number) => {
            const q: [number, number, number] = [bb.min[0], bb.min[1], bb.min[2]];
            q[i] = across ? v : v + shift;
            if (across) q[j] = q[j]! + shift;
            return q;
          };
          act(() => useStore.getState().replaceDocument({
            ...createDocument('F'), boards: [board], dimensions: [{ id: 'd', axis, a: { at: p(bb.min[i]) }, b: { at: p(bb.min[i] + 0.25) } }],
          }));
          const { container, unmount } = render(<PlansSheet onClose={() => {}} />);
          const svg = pieceFigure(container).querySelector('svg')!;
          inside(svg, `${axis} ${shift} ${across ? 'across' : 'along'}`);
          lines(svg, `${axis} ${shift} ${across ? 'across' : 'along'}`);
          unmount();
        }
      }
    }
  });

  it('a guide point exactly on the piece\'s face is drawn', () => {
    act(() => useStore.getState().replaceDocument({
      ...createDocument('P'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 1.5 })],
      dimensions: [{ id: 'x', axis: 'x', a: { at: [0, 1.5, 11.25] }, b: { at: [30, 1.5, 11.25] } }],
    }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelectorAll('.plan-dim-placed')).toHaveLength(1);
    expect(screen.queryByText(/reaches past the drawing/)).toBeNull();
  });

  it('rows are capped at PLACED_ROWS_MAX per band: the scale stays positive and the note names the rest (Amended ruling 2)', () => {
    const parts = [createBoard({ id: 'b', length: 20, width: 10, thickness: 1, posture: 'upright' })];
    // 19 heights all from the floor: every one overlaps every other, so each would open a row.
    const ys: PlacedDimension[] = Array.from({ length: 19 }, (_, k) => ({ id: `y${k + 1}`, axis: 'y', a: { at: [0, 0, 0] }, b: { at: [0, k + 1, 0] } }));
    const bb = boardsBounds(parts)!;
    const across = (bb.max[0] - bb.min[0]) + (bb.max[2] - bb.min[2]);
    const down = (bb.max[2] - bb.min[2]) + (bb.max[1] - bb.min[1]);
    // Every band full, from the constants alone: still room both ways.
    const bound = Math.min((PLAN_WIDTH - 4 * DIM_BAND - VIEW_GAP - PLACED_ROWS_MAX * DIM_ROW) / across,
      (TRIO_MAX_HEIGHT - 4 * DIM_BAND - VIEW_GAP - PLACED_ROWS_MAX * DIM_ROW) / down, MAX_PLAN_SCALE);
    expect(PLACED_ROWS_MAX).toBe(6);
    expect(bound).toBeGreaterThan(0);
    const scale = trioScale(parts, [], ys, IMPERIAL);
    expect(scale).toBeGreaterThanOrEqual(bound - 1e-12);
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="s" placed={ys} />);
    const drawn = [...container.querySelectorAll('.plan-dim-placed text')].map((t) => t.textContent!);
    expect(drawn).toHaveLength(6);
    const note = [...container.querySelectorAll('.plans-notes li')].map((li) => li.textContent!).find((n) => n.includes('no room'))!;
    const m = /^Front: 13 placed dimensions not drawn — no room \((.*)\)$/.exec(note)!;
    expect(m).not.toBeNull();
    const named = m[1]!.split(', ');
    expect(named.every((n) => n.startsWith('Y '))).toBe(true);
    expect([...drawn, ...named.map((n) => n.slice(2))].sort()).toEqual(Array.from({ length: 19 }, (_, k) => `${k + 1}"`).sort());
    inside(container.querySelector('svg')!);
  });

  it('a detached dimension is not drawn, and the note says so', () => {
    const gone: PlacedDimension = { id: 'g', axis: 'x', a: { part: 'nope', frac: { length: 0, width: 0, thickness: 0 } }, b: { at: [3, 0, 0] } };
    act(() => useStore.getState().replaceDocument({ ...pinDoc(), dimensions: [gone] }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelector('.plan-dim-placed')).toBeNull();
    expect(screen.getByText('1 placed dimension not drawn — its part was deleted')).toBeInTheDocument();
    act(() => useStore.getState().replaceDocument({ ...pinDoc(), dimensions: [gone, { ...gone, id: 'g2' }] }));
    expect(screen.getByText('2 placed dimensions not drawn — their parts were deleted')).toBeInTheDocument();
  });

  it('the section block keeps the piece trio\'s scale when placed rows change it', () => {
    // Width-bound (30 + 11.25 across): two overlapping Y dimensions add two rows right of the front, so the scale falls.
    const ys: PlacedDimension[] = [
      { id: 'y1', axis: 'y', a: { at: [0, 0, 0] }, b: { at: [0, 0.75, 0] } },
      { id: 'y2', axis: 'y', a: { at: [0, 0.2, 0] }, b: { at: [0, 0.6, 0] } },
    ];
    const doc = { ...createDocument('One'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 0.75 })], dimensions: ys };
    const parts = worldParts(doc);
    expect(trioScale(parts, doc.bandTypes, ys, doc.units)).toBeLessThan(trioScale(parts, doc.bandTypes));
    act(() => useStore.getState().replaceDocument(doc));
    act(() => useStore.getState().setSection({ axis: 'front', at: 5, flip: false }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    // The piece's scale, read off the paper: its front overall dimension spans the 30" length.
    const overall = views(pieceFigure(container))[1]!.querySelector('.plan-dim > line')!;
    const pieceScale = (Number(overall.getAttribute('x2')) - Number(overall.getAttribute('x1'))) / 30;
    const svg = container.querySelector('[aria-label^="Section A–A"]')!;
    const sectionWidth = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    // The section of a 30"-long board cut across Z shows the 30" length, plus ISO_MARGIN (16) each side.
    expect((sectionWidth - 32) / 30).toBeCloseTo(pieceScale, 9);
    expect(pieceScale).toBeCloseTo(trioScale(parts, doc.bandTypes, ys, doc.units), 9);
    act(() => useStore.getState().setSection(null));
  });
});
