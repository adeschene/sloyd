import { useStore } from './store';
import { createDocument } from '../document/document';
import { assemblyDoc } from '../document/treeFixtures';
import { clearOnMiss, isToggleModifier, selectByClick } from './selectionGesture';

const none = { shiftKey: false, ctrlKey: false, metaKey: false };

beforeEach(() => {
  useStore.getState().replaceDocument(createDocument('Test'));
  useStore.getState().setTool('select');
});

const twoBoards = () => {
  useStore.getState().addBoard();
  useStore.getState().addBoard();
  const [a, b] = useStore.getState().doc.boards;
  useStore.getState().selectBoard(a!.id);
  return { a: a!.id, b: b!.id };
};

describe('isToggleModifier', () => {
  it('is true for Shift, Ctrl or Cmd, and false with none', () => {
    expect(isToggleModifier(none)).toBe(false);
    expect(isToggleModifier({ ...none, shiftKey: true })).toBe(true);
    expect(isToggleModifier({ ...none, ctrlKey: true })).toBe(true);
    expect(isToggleModifier({ ...none, metaKey: true })).toBe(true);
  });
});

describe('selectByClick', () => {
  it('a plain click selects just that part', () => {
    const { b } = twoBoards();
    selectByClick(b, none);
    expect(useStore.getState().selectedIds).toEqual([b]);
  });

  it('a modified click toggles that part, in and out', () => {
    const { a, b } = twoBoards();
    selectByClick(b, { ...none, shiftKey: true });
    expect(useStore.getState().selectedIds).toEqual([a, b]);
    selectByClick(a, { ...none, metaKey: true });
    expect(useStore.getState().selectedIds).toEqual([b]);
  });
});

describe('clearOnMiss', () => {
  it('a plain miss in the Select tool clears the selection', () => {
    twoBoards();
    clearOnMiss(none, 'select');
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('a MODIFIED miss keeps the selection: a slightly missed Shift-click must not wipe it', () => {
    const { a, b } = twoBoards();
    useStore.getState().toggleSelected(b);
    clearOnMiss({ ...none, shiftKey: true }, 'select');
    clearOnMiss({ ...none, ctrlKey: true }, 'select');
    clearOnMiss({ ...none, metaKey: true }, 'select');
    expect(useStore.getState().selectedIds).toEqual([a, b]);
  });

  it('a miss in any other tool keeps the selection', () => {
    const { a } = twoBoards();
    clearOnMiss(none, 'move');
    clearOnMiss(none, 'tape');
    expect(useStore.getState().selectedIds).toEqual([a]);
  });
});

describe('clearOnMiss inside an assembly', () => {
  // i1 "Drawer" holds b1, b2 and i2 "Peg", which holds b3.
  const openPeg = () => {
    useStore.getState().replaceDocument(assemblyDoc());
    useStore.getState().setTool('select');
    useStore.getState().openAssembly('i1');
    useStore.getState().openAssembly('i1/i2');
    useStore.getState().selectItem('i1/i2/b3', false);
  };

  it('a plain miss moves up one level, like Escape, selecting the assembly it left', () => {
    openPeg();
    clearOnMiss(none, 'select');
    expect(useStore.getState().openPath).toBe('i1');
    expect(useStore.getState().selectedIds).toEqual(['i1/i2']);
    clearOnMiss(none, 'select');
    expect(useStore.getState().openPath).toBeNull();
    expect(useStore.getState().selectedIds).toEqual(['i1']);
  });

  it('a modified miss, or a miss in another tool, stays in the assembly', () => {
    openPeg();
    clearOnMiss({ ...none, shiftKey: true }, 'select');
    clearOnMiss(none, 'move');
    clearOnMiss(none, 'tape');
    expect(useStore.getState().openPath).toBe('i1/i2');
    expect(useStore.getState().selectedIds).toEqual(['i1/i2/b3']);
  });
});
