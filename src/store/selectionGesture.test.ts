import { useStore } from './store';
import { createDocument } from '../document/document';
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
