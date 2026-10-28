import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MaterialsDialog } from './MaterialsDialog';
import { defaultShop, type ShopSettings } from '../document/purchase';
import { initialRows, newRow, planSave, rowNotes, rowRefusal, useLibraryVersion, type Row, type SavePlan } from './materialsDraft';
import { fromDraft } from './materialsDraft';
import type { CustomMaterial } from '../document/types';
import { IMPERIAL, type Units } from '../units/length';

/** Weight spec §5.3: the Density field (lb/ft³, or kg/m³ in a metric project). */
const METRIC: Units = { display: 'metric-mm', precision: 16 };
const ash: CustomMaterial = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid', density: 44 };
const edit = (r: Row, d: Partial<Row['draft']>): Row => ({ ...r, draft: { ...r.draft, ...d } });
const plan = (rows: Row[]) => planSave({ rows, library: [], libraryWritable: true, assignIds: null, locked: false });

describe('the density draft', () => {
  it('drafts a stored density in the project unit', () => {
    expect(initialRows([ash], [], IMPERIAL)[0]!.draft.density).toBe('44');
    expect(initialRows([ash], [], METRIC)[0]!.draft.density).toBe('705');
    expect(initialRows([{ ...ash, density: undefined }], [], IMPERIAL)[0]!.draft.density).toBe('');
    expect(newRow('solid', []).draft.density).toBe('');
  });
  it('an untouched field keeps the stored value EXACTLY (inv 5), in either unit', () => {
    const odd = { ...ash, density: 44.123 };
    expect(fromDraft(initialRows([odd], [], IMPERIAL)[0]!)!.density).toBe(44.123);
    expect(fromDraft(initialRows([odd], [], METRIC)[0]!)!.density).toBe(44.123);
  });
  it('a typed value is stored as lb/ft³; an emptied field stores no key', () => {
    const [r] = initialRows([ash], [], IMPERIAL);
    expect(fromDraft(edit(r!, { density: '40' }))!.density).toBe(40);
    const gone = fromDraft(edit(r!, { density: ' ' }))!;
    expect('density' in gone).toBe(false);
    const [m] = initialRows([ash], [], METRIC);
    expect(fromDraft(edit(m!, { density: '600' }))!.density).toBe(600 / 16.018463);
  });
  it('refuses 0, a non-number and past the limit, naming the limit in the project unit', () => {
    const [r] = initialRows([ash], [], IMPERIAL);
    for (const v of ['0', 'abc', '151']) {
      expect(rowRefusal(edit(r!, { density: v }), [r!]), v).toBe('Density must be a number more than 0 and at most 150 lb/ft³, or left empty.');
    }
    const [m] = initialRows([ash], [], METRIC);
    expect(rowRefusal(edit(m!, { density: '2403' }), [m!])).toBe('Density must be a number more than 0 and at most 2402 kg/m³, or left empty.');
    expect(rowRefusal(edit(m!, { density: '2402' }), [m!])).toBeNull();
  });
  it('a density-only edit is written to the project', () => {
    const [r] = initialRows([ash], [], IMPERIAL);
    const out = plan([edit(r!, { density: '41' })]);
    expect('project' in out && out.project[0]!.density).toBe(41);
  });
});

describe('Use library version keeps the library density EXACTLY (final review I2)', () => {
  const lib: CustomMaterial = { ...ash, color: '#112233', density: 44 };        // typed in an imperial project
  const project: CustomMaterial = { ...ash, density: 40 };
  for (const units of [METRIC, IMPERIAL]) {
    it(`${units.display}: the library's 44 is written back as 44, not as its rounded display, and the note clears`, () => {
      const rows = initialRows([project], [lib], units);
      const used = useLibraryVersion(rows[0]!, [lib]);
      expect(fromDraft(used)!.density).toBe(44);
      expect(rowNotes(used, [used], [lib]).differs).toBe(false);
      const out = planSave({ rows: [used], library: [lib], libraryWritable: true, assignIds: null, locked: false });
      expect('project' in out && out.project[0]!.density).toBe(44);
      expect('library' in out && out.library).toBeNull();
    });
  }
  it('a metric-typed library value (44.0118…) is kept exactly in an imperial project too', () => {
    const odd = { ...lib, density: 705 / 16.018463 };
    const used = useLibraryVersion(initialRows([project], [odd], IMPERIAL)[0]!, [odd]);
    expect(fromDraft(used)!.density).toBe(705 / 16.018463);
  });
});

describe('MaterialsDialog: the Density field', () => {
  const open = (over: Partial<Parameters<typeof MaterialsDialog>[0]> = {}) => {
    const onSave = vi.fn(async (_: { shop: ShopSettings; plan: SavePlan }) => null as string | null);
    render(<MaterialsDialog shop={defaultShop()} readFailed={false} project={[]} library={[]} libraryReadFailed={false}
      locked={false} newFor={null} onSave={onSave} onClose={() => {}} {...over} />);
    return { onSave };
  };
  it('a custom row shows Density in the unit; built-ins show theirs read-only', () => {
    open({ project: [ash] });
    expect(screen.getByRole('textbox', { name: 'Ash: density' })).toHaveValue('44');
    expect(screen.getByText('Density (lb/ft³)')).toBeInTheDocument();
    expect(screen.getByLabelText('Oak: density')).toHaveTextContent('Density 44 lb/ft³');
  });
  it('metric: kg/m³', () => {
    open({ project: [ash], units: METRIC });
    expect(screen.getByRole('textbox', { name: 'Ash: density' })).toHaveValue('705');
    expect(screen.getByLabelText('Oak: density')).toHaveTextContent('Density 705 kg/m³');
  });
  it('Save writes a typed density to the project and, with the library, there too', async () => {
    const { onSave } = open({ project: [ash], library: [ash] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ash: density' }), { target: { value: '41' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan: p } = onSave.mock.calls[0]![0];
    expect(p.project[0]!.density).toBe(41);
    expect(p.library![0]!.density).toBe(41);
  });
});
