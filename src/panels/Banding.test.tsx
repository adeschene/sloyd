import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { BandType, Board } from '../document/document';
import { archCurve } from '../document/curves';
import * as banding from '../document/banding';
import { BAND_SIDES, BUILT_IN_BAND } from '../document/banding';
import { Properties } from './Properties';
import * as refusal from './bandingRefusal';

const maple: BandType = { id: 'm', name: 'Maple', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const plain = (over: Partial<Board> = {}) => createBoard({ id: 'a', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood', ...over });
const arched = (over: Partial<Board> = {}) => plain({
  id: 'b', name: 'Apron',
  curves: [{ id: 'c', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) }], ...over,
});
const open = (boards: Board[], select: string[] = [boards[0]!.id], onNewBandType?: () => void) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), bandTypes: [BUILT_IN_BAND, maple], boards });
  useStore.getState().selectBoard(select[0]!);
  for (const id of select.slice(1)) useStore.getState().toggleSelected(id);
  render(<Properties onNewBandType={onNewBandType} />);
};
const part = (id: string) => useStore.getState().doc.boards.find((b) => b.id === id) as Board;
const undoDepth = () => useStore.getState().past.length;
const LABELS = ['Width min side', 'Width max side', 'Length min end', 'Length max end'];
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const W0 = BAND_SIDES[0]!, L0 = BAND_SIDES[2]!;

afterEach(() => { vi.restoreAllMocks(); act(() => useStore.getState().setExplode(0)); });

describe('the Banding section (edge banding spec §5.1)', () => {
  it('an unbanded part shows only + Add banding ▾: each type\'s items, then New solid edging…', async () => {
    const user = userEvent.setup();
    open([plain()], ['a'], () => {});
    expect(screen.getByRole('heading', { name: 'Banding' })).toBeInTheDocument();
    for (const label of LABELS) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Band' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ Add banding' }));
    expect(screen.getAllByRole('button').map((b) => b.textContent).filter((t) => t!.includes(':') || t!.includes('…'))).toEqual([
      'Iron-on veneer: all edges', 'Iron-on veneer: long edges', 'Iron-on veneer: ends',
      'Maple: all edges', 'Maple: long edges', 'Maple: ends', 'New solid edging…',
    ]);
    expect(screen.queryByRole('button', { name: 'Remove all bands' })).toBeNull();
  });

  it('a banded part shows four side selects, each offering None, Iron-on veneer and the other band types', () => {
    open([plain({ bands: [{ side: L0, type: BUILT_IN_BAND.id }] })]);
    expect(screen.getByRole('heading', { name: /^Banding\s*·\s*1$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add banding' })).toBeNull();
    for (const label of LABELS) {
      const options = [...select(label).options].map((o) => o.textContent);
      expect(options).toEqual(['None', 'Iron-on veneer', 'Maple']);
      expect(select(label).value).toBe(label === 'Length min end' ? BUILT_IN_BAND.id : '');
    }
  });

  it('setting the last band to None returns the section to + Add banding ▾', async () => {
    const user = userEvent.setup();
    open([plain({ bands: [{ side: L0, type: BUILT_IN_BAND.id }] })]);
    await user.selectOptions(select('Length min end'), '');
    expect(part('a').bands).toEqual([]);
    for (const label of LABELS) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.getByRole('button', { name: '+ Add banding' })).toBeInTheDocument();
  });

  it('choosing Iron-on veneer on Width min side stores the band in one undo entry', async () => {
    const user = userEvent.setup();
    const end = { side: L0, type: 'm' };
    open([plain({ bands: [end] })]);
    const before = undoDepth();
    await user.selectOptions(select('Width min side'), BUILT_IN_BAND.id);
    expect(part('a').bands).toEqual([{ side: W0, type: BUILT_IN_BAND.id }, end]);
    expect(undoDepth()).toBe(before + 1);
    expect(select('Width min side').value).toBe(BUILT_IN_BAND.id);
    await user.selectOptions(select('Width min side'), '');
    expect(part('a').bands).toEqual([end]);
  });

  it('two parts that disagree read Mixed; a choice writes both; an untouched mixed select writes nothing', async () => {
    const user = userEvent.setup();
    open([plain({ bands: [{ side: W0, type: 'm' }] }), plain({ id: 'z', name: 'Other' })], ['a', 'z']);
    const s = select('Width min side');
    expect(s.value).toBe('__mixed');
    expect(s.selectedOptions[0]!.textContent).toBe('Mixed');
    expect(select('Width max side').value).toBe('');
    expect([...select('Width max side').options].map((o) => o.textContent)).not.toContain('Mixed');
    const before = undoDepth();
    act(() => s.focus());
    act(() => s.blur());
    fireEvent.blur(s);
    expect(undoDepth()).toBe(before);
    expect(part('a').bands).toEqual([{ side: W0, type: 'm' }]);
    expect(part('z').bands).toEqual([]);
    await user.selectOptions(s, BUILT_IN_BAND.id);
    expect(part('a').bands).toEqual([{ side: W0, type: BUILT_IN_BAND.id }]);
    expect(part('z').bands).toEqual([{ side: W0, type: BUILT_IN_BAND.id }]);
    expect(undoDepth()).toBe(before + 1);
  });

  it('+ Add banding ▾: all edges sets four sides in ONE undo entry; Band ▾ then edits in bulk and Remove all bands clears them', async () => {
    const user = userEvent.setup();
    open([plain()], ['a'], () => {});
    const before = undoDepth();
    await user.click(screen.getByRole('button', { name: '+ Add banding' }));
    await user.click(screen.getByRole('button', { name: 'Iron-on veneer: all edges' }));
    expect(part('a').bands.map((b) => b.type)).toEqual(Array(4).fill(BUILT_IN_BAND.id));
    expect(undoDepth()).toBe(before + 1);
    await user.click(screen.getByRole('button', { name: 'Band' }));
    expect(screen.getByRole('button', { name: 'Maple: long edges' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maple: ends' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New solid edging…' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove all bands' }));
    expect(part('a').bands).toEqual([]);
    expect(undoDepth()).toBe(before + 2);
    expect(screen.getByRole('button', { name: '+ Add banding' })).toBeInTheDocument();
  });

  it('New solid edging… calls onNewBandType and writes nothing', async () => {
    const user = userEvent.setup();
    const onNewBandType = vi.fn();
    useStore.getState().replaceDocument({ ...createDocument('T'), bandTypes: [BUILT_IN_BAND, maple], boards: [plain()] });
    useStore.getState().selectBoard('a');
    render(<Properties onNewBandType={onNewBandType} />);
    const before = undoDepth();
    await user.click(screen.getByRole('button', { name: '+ Add banding' }));
    await user.click(screen.getByRole('button', { name: 'New solid edging…' }));
    expect(onNewBandType).toHaveBeenCalledTimes(1);
    expect(undoDepth()).toBe(before);
  });

  it('without onNewBandType the menu offers no New solid edging…', async () => {
    const user = userEvent.setup();
    useStore.getState().replaceDocument({ ...createDocument('T'), bandTypes: [BUILT_IN_BAND, maple], boards: [plain()] });
    useStore.getState().selectBoard('a');
    render(<Properties />);
    await user.click(screen.getByRole('button', { name: '+ Add banding' }));
    expect(screen.queryByRole('button', { name: 'New solid edging…' })).toBeNull();
  });

  it('+ Add banding ▾ greys an item that would add a fault, its reason as its title', async () => {
    const user = userEvent.setup();
    open([arched()]);
    await user.click(screen.getByRole('button', { name: '+ Add banding' }));
    const item = screen.getByRole('button', { name: 'Maple: long edges' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Needs a straight edge');
    expect(screen.getByRole('button', { name: 'Maple: ends' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Iron-on veneer: all edges' })).toBeEnabled();
  });

  it('options are judged only on focus (fu 388): Maple on an arched side is greyed with its reason', () => {
    const spy = vi.spyOn(banding, 'bandFaults');
    const judged = vi.spyOn(refusal, 'bandEditRefusal');
    open([arched({ bands: [{ side: L0, type: BUILT_IN_BAND.id }] })]);
    expect(judged).not.toHaveBeenCalled();
    const s = select('Width min side');
    const maple_ = () => [...s.options].find((o) => o.value === 'm')!;
    expect(maple_()).toBeDefined();
    expect(maple_().disabled).toBe(false);
    expect(maple_().textContent).toBe('Maple');
    const calls = spy.mock.calls.length;
    act(() => s.focus());
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
    expect(judged).toHaveBeenCalled();
    expect(maple_().disabled).toBe(true);
    expect(maple_().textContent).toMatch(/— Needs a straight edge$/);
    expect([...s.options].find((o) => o.value === BUILT_IN_BAND.id)!.disabled).toBe(false);
    act(() => s.blur());
    expect(maple_().disabled).toBe(false);
  });

  it('the Corners select appears once two adjacent maple bands exist, and writes cornerRule', async () => {
    const user = userEvent.setup();
    open([plain({ bands: [{ side: BAND_SIDES[1]!, type: BUILT_IN_BAND.id }] })]);
    expect(screen.queryByLabelText('Corners')).toBeNull();
    await user.selectOptions(select('Width min side'), 'm');
    expect(screen.queryByLabelText('Corners')).toBeNull();
    await user.selectOptions(select('Length min end'), 'm');
    const corners = screen.getByLabelText('Corners') as HTMLSelectElement;
    expect([...corners.options].map((o) => o.textContent)).toEqual(['Long edges run through', 'Ends run through', 'Mitred']);
    expect(corners.value).toBe('long');
    const before = undoDepth();
    await user.selectOptions(corners, 'mitre');
    expect(part('a').cornerRule).toBe('mitre');
    expect(undoDepth()).toBe(before + 1);
  });

  it('Corners reads Mixed where qualifying parts disagree; untouched it writes nothing; a choice writes both (inv 5)', async () => {
    const user = userEvent.setup();
    const bands = [{ side: W0, type: 'm' }, { side: L0, type: 'm' }];
    open([plain({ bands, cornerRule: 'long' }), plain({ id: 'z', name: 'Other', bands, cornerRule: 'mitre' })], ['a', 'z']);
    const corners = screen.getByLabelText('Corners') as HTMLSelectElement;
    expect(corners.value).toBe('__mixed');
    expect(corners.selectedOptions[0]!.textContent).toBe('Mixed');
    const before = undoDepth();
    act(() => corners.focus());
    act(() => corners.blur());
    fireEvent.blur(corners);
    expect(undoDepth()).toBe(before);
    expect([part('a').cornerRule, part('z').cornerRule]).toEqual(['long', 'mitre']);
    await user.selectOptions(corners, 'ends');
    expect([part('a').cornerRule, part('z').cornerRule]).toEqual(['ends', 'ends']);
    expect(undoDepth()).toBe(before + 1);
    expect((screen.getByLabelText('Corners') as HTMLSelectElement).value).toBe('ends');
  });

  it('Corners reads and writes only the parts it reaches: a selected part with no corner is neither Mixed nor written (final review 1)', async () => {
    const user = userEvent.setup();
    open([plain({ bands: [{ side: W0, type: 'm' }, { side: L0, type: 'm' }], cornerRule: 'mitre' }),
      plain({ id: 'z', name: 'Other', bands: [{ side: W0, type: 'm' }], cornerRule: 'ends' })], ['a', 'z']);
    const corners = screen.getByLabelText('Corners') as HTMLSelectElement;
    expect(corners.value).toBe('mitre');
    expect([...corners.options].map((o) => o.value)).not.toContain('__mixed');
    const before = undoDepth();
    await user.selectOptions(corners, 'long');
    expect(part('a').cornerRule).toBe('long');
    expect(part('z').cornerRule).toBe('ends');
    expect(undoDepth()).toBe(before + 1);
  });

  it('a faulted band is noted under the selects', () => {
    open([arched({ bands: [{ side: W0, type: 'm' }] })]);
    expect(screen.getByText('Width min side: needs a straight edge')).toBeInTheDocument();
  });

  it('every control is disabled while exploded', async () => {
    open([plain({ bands: [{ side: W0, type: 'm' }, { side: L0, type: 'm' }] })]);
    act(() => useStore.getState().setExplode(0.4));
    for (const label of [...LABELS, 'Corners']) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Band' })).toBeDisabled();
  });

  it('a multi-selection shows the section too, inside its edit lock: + Add banding ▾ when no part is banded', () => {
    open([plain(), plain({ id: 'z', name: 'Other' })], ['a', 'z']);
    const heading = screen.getByRole('heading', { name: 'Banding' });
    expect(heading.closest('fieldset.edit-lock')).not.toBeNull();
    expect(within(heading.closest('fieldset')!).getByRole('button', { name: '+ Add banding' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Width min side')).toBeNull();
  });

  it('a multi-selection with ANY banded part shows the selects (no count in the heading)', () => {
    open([plain({ bands: [{ side: W0, type: 'm' }] }), plain({ id: 'z', name: 'Other' })], ['a', 'z']);
    expect(screen.getByRole('heading', { name: 'Banding' })).toBeInTheDocument();
    expect(screen.getByLabelText('Width min side')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add banding' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Band' })).toBeInTheDocument();
  });
});
