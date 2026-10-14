import { describe, expect, it } from 'vitest';
import { initialRows, labelTyped, newRow, planSave, rebaseRows, rowNotes, rowRefusal, setRowKind, useLibraryVersion, type Row } from './materialsDraft';
import { pickerLibrary } from '../document/materials';
import type { CustomMaterial } from '../document/types';

const ash: CustomMaterial = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
const libAsh: CustomMaterial = { id: 'm-s-ash2', label: 'ash', color: '#ccbb99', kind: 'solid' };
const birch: CustomMaterial = { id: 'm-v-bb55', label: 'Baltic birch', color: '#e8d8b8', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } };
const edit = (r: Row, d: Partial<Row['draft']>): Row => ({ ...r, draft: { ...r.draft, ...d } });
const plan = (rows: Row[], library: CustomMaterial[], over: Partial<Parameters<typeof planSave>[0]> = {}) =>
  planSave({ rows, library, libraryWritable: true, assignIds: null, locked: false, ...over });

describe('pickerLibrary (spec §4.1: one label per picker)', () => {
  it('leaves out library entries already in the project or named like a project or built-in material', () => {
    const pine = { ...birch, id: 'm-v-pine', label: 'PINE ' };
    expect(pickerLibrary([ash], [ash, libAsh, birch, pine])).toEqual([birch]);
  });
});

describe('refusals', () => {
  it('refuses an empty label and a label taken by a built-in', () => {
    const [r] = initialRows([ash], []);
    expect(rowRefusal(edit(r!, { label: '  ' }), [r!])).toBe('Give the material a name.');
    expect(rowRefusal(edit(r!, { label: 'oak' }), [r!])).toBe('Another material is already called "Oak".');
  });
  it('tolerates an imported clash, even with a colour edit, but refuses a TYPED label clash', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(rowRefusal(rows[0]!, rows)).toBeNull();
    expect(rowRefusal(rows[1]!, rows)).toBeNull();
    const coloured = [edit(rows[0]!, { color: '#000000' }), rows[1]!];
    expect(rowRefusal(coloured[0]!, coloured)).toBeNull();
    const recased = [edit(rows[0]!, { label: ' ASH' }), rows[1]!];
    expect(labelTyped(recased[0]!)).toBe(false);
    const typed = initialRows([ash], [birch]);
    const clash = [typed[0]!, edit(typed[1]!, { label: 'ash' })];
    expect(labelTyped(clash[1]!)).toBe(true);
    expect(rowRefusal(clash[1]!, clash)).toBe('Another material is already called "Ash".');
  });
  it('tolerates an imported custom material named like a built-in until its label is typed', () => {
    const [r] = initialRows([{ ...ash, label: 'Pine' }], []);
    expect(rowRefusal(r!, [r!])).toBeNull();
    const coloured = edit(r!, { color: '#000000' });
    expect(rowRefusal(coloured, [coloured])).toBeNull();
    const typed = edit(r!, { label: 'oak' });
    expect(rowRefusal(typed, [typed])).toBe('Another material is already called "Oak".');
  });
  it('a new row can change kind: a fresh id of that kind and the sheet defaults', () => {
    const r = setRowKind(newRow('solid', [], () => 0.5), 'sheet-veneered', [], () => 0.25);
    expect(r.id).toMatch(/^m-v-/);
    expect(r.kind).toBe('sheet-veneered');
    expect([r.draft.sheetLength, r.draft.sheetWidth]).toEqual(['96', '48']);
    const [stored] = initialRows([ash], []);
    expect(setRowKind(stored!, 'sheet-plain', [])).toBe(stored);
  });
  it('refuses a sheet size that is not a positive length', () => {
    const [r] = initialRows([birch], []);
    for (const v of ['0', '-3', 'abc', '']) expect(rowRefusal(edit(r!, { sheetWidth: v }), [r!])).toBe('Sheet sizes must be positive lengths.');
  });
});

describe('rowNotes', () => {
  it('flags a project copy that differs from the library, and one not in it', () => {
    const rows = initialRows([{ ...ash, color: '#111111' }, birch], [ash]);
    expect(rowNotes(rows[0]!, rows, [ash]).differs).toBe(true);
    expect(rowNotes(rows[1]!, rows, [ash]).notInLibrary).toBe(true);
  });
  it('flags a library-only row named like a project material, and the project row whose library twin has another id', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(rowNotes(rows[1]!, rows, [libAsh]).sameNameAsProject).toBe(true);
    expect(rowNotes(rows[0]!, rows, [libAsh]).libraryLabelClash).toBe(true);
  });
});

describe('planSave', () => {
  it('an edited project row goes to the project AND the library', () => {
    const rows = initialRows([ash], [ash]);
    const p = plan([edit(rows[0]!, { color: '#000000' })], [ash]);
    expect(p).toEqual({ project: [{ ...ash, color: '#000000' }], library: [{ ...ash, color: '#000000' }], assign: null });
  });
  it('nothing edited writes nothing', () => {
    expect(plan(initialRows([ash], [ash]), [ash])).toEqual({ project: [], library: null, assign: null });
  });
  it('a library-only edit goes to the library only', () => {
    const rows = initialRows([], [birch]);
    const p = plan([edit(rows[0]!, { label: 'Birch ply' })], [birch]);
    expect(p).toEqual({ project: [], library: [{ ...birch, label: 'Birch ply' }], assign: null });
  });
  it('"Use library version" makes the project copy equal the library', () => {
    const rows = initialRows([{ ...ash, color: '#111111' }], [ash]);
    expect(plan([useLibraryVersion(rows[0]!, [ash])], [ash])).toEqual({ project: [ash], library: null, assign: null });
  });
  it('"Add to library" is refused while the library holds another id with that label', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(plan([{ ...rows[0]!, addToLibrary: true }, rows[1]!], [libAsh])).toEqual({ refused: 'Your library already has a material called "Ash" — rename one first.' });
  });
  it('an edited project row whose library twin has another id is NOT added to the library', () => {
    const rows = initialRows([ash], [libAsh]);
    const p = plan([edit(rows[0]!, { color: '#000000' }), rows[1]!], [libAsh]);
    expect(p).toEqual({ project: [{ ...ash, color: '#000000' }], library: null, assign: null });
  });
  it('delete removes a library-only row from the library', () => {
    const rows = initialRows([], [birch]);
    expect(plan([{ ...rows[0]!, deleted: true }], [birch])).toEqual({ project: [], library: [], assign: null });
  });
  it('New material… assigns the new row to the selection and saves it to both', () => {
    const r = edit(newRow('solid', [], () => 0.5), { label: 'Sapele', color: '#8a3b22' });
    const p = plan([r], [], { assignIds: ['a', 'b'] });
    if ('refused' in p) throw new Error(p.refused);
    expect(p.project).toEqual([{ id: r.id, label: 'Sapele', color: '#8a3b22', kind: 'solid' }]);
    expect(p.library).toEqual(p.project);
    expect(p.assign).toEqual({ ids: ['a', 'b'], material: r.id });
  });
  it('an unwritable library still applies the project edit and writes no library', () => {
    const r = edit(newRow('solid', [], () => 0.5), { label: 'Sapele', color: '#8a3b22' });
    const p = plan([r], [], { assignIds: ['a'], libraryWritable: false });
    expect(p).toMatchObject({ library: null, assign: { ids: ['a'], material: r.id } });
  });
  it('locked (exploded) plans prices only', () => {
    const rows = initialRows([ash], [ash]);
    expect(plan([edit(rows[0]!, { color: '#000000' })], [ash], { locked: true })).toEqual({ project: [], library: null, assign: null });
  });
  it('a refused row refuses the whole plan', () => {
    const rows = initialRows([ash], []);
    expect(plan([edit(rows[0]!, { label: '' })], [])).toEqual({ refused: 'Give the material a name.' });
  });
  it('an untouched sheet row writes nothing, however odd its stored size (invariant 5)', () => {
    const odd: CustomMaterial = { ...birch, sheet: { length: 48.03, width: 1220 / 25.4 } };
    const rows = initialRows([odd], [odd]);
    expect(plan(rows, [odd])).toEqual({ project: [], library: null, assign: null });
    const p = plan([edit(rows[0]!, { sheetWidth: '40' })], [odd]);
    if ('refused' in p) throw new Error(p.refused);
    expect(p.project[0]!.sheet).toEqual({ length: 48.03, width: 40 });
  });
  it('refuses a library that would hold one label twice (hidden label of a project copy)', () => {
    const hidden: CustomMaterial = { ...ash, label: 'White ash' };
    const rows = [...initialRows([ash], [hidden]), edit(newRow('solid', [], () => 0.5), { label: 'White ash' })];
    expect(plan(rows, [hidden])).toEqual({ refused: 'Your library would have two materials called "White ash" — rename one first.' });
  });
  it('refuses renaming a library-only row to the hidden label', () => {
    const hidden: CustomMaterial = { ...ash, label: 'White ash' };
    const rows = initialRows([ash], [hidden, birch]);
    expect(plan([rows[0]!, edit(rows[1]!, { label: 'white ash' })], [hidden, birch])).toEqual({ refused: 'Your library would have two materials called "white ash" — rename one first.' });
  });
  it('a duplicate pair already in the stored library does not block an unrelated Save', () => {
    const twin: CustomMaterial = { ...libAsh, label: 'Ash' };
    const rows = initialRows([], [twin, ash, birch]);
    expect(plan([rows[0]!, rows[1]!, edit(rows[2]!, { color: '#000000' })], [twin, ash, birch])).toEqual({ project: [], library: [twin, ash, { ...birch, color: '#000000' }], assign: null });
  });
});

describe('rebaseRows (after a Save whose library write failed)', () => {
  it('keeps the library intent for a project row the Save wrote, when the library still lacks it', () => {
    const r = edit(initialRows([ash], [])[0]!, { color: '#112233' });
    const written = { ...ash, color: '#112233' };
    const [out] = rebaseRows([r], [written], []);
    expect(out).toMatchObject({ source: 'project', original: written, addToLibrary: true });
    expect(plan([out!], [])).toHaveProperty('library', [written]);
  });
  it('keeps the intent when the library holds the SAME id at its old value (its own label is no clash)', () => {
    const r = edit(initialRows([ash], [ash])[0]!, { color: '#112233' });
    const written = { ...ash, color: '#112233' };
    const [out] = rebaseRows([r], [written], [ash]);
    expect(out).toMatchObject({ addToLibrary: true });
    expect(plan([out!], [ash])).toHaveProperty('library', [written]);
  });
  it('sets no library intent when ANOTHER library entry holds the same label (planSave would refuse the retry)', () => {
    const r = edit(initialRows([ash], [libAsh])[0]!, { color: '#112233' });
    const written = { ...ash, color: '#112233' };
    const [out] = rebaseRows([r], [written], [libAsh]);
    expect(out).toMatchObject({ source: 'project', original: written, addToLibrary: false });
    expect(plan([out!, ...initialRows([], [libAsh])], [libAsh])).not.toHaveProperty('refused');
  });
});
