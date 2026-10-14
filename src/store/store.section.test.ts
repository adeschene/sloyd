import { useStore } from './store';
import { createDocument } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('section', () => {
  it('starts off and is set by setSection', () => {
    expect(s().section).toBeNull();
    s().setSection({ axis: 'front', at: 3, flip: false });
    expect(s().section).toEqual({ axis: 'front', at: 3, flip: false });
    s().setSection(null);
    expect(s().section).toBeNull();
  });
  it('refuses a non-finite position, keeping the stored section', () => {
    s().setSection({ axis: 'top', at: 1, flip: true });
    s().setSection({ axis: 'top', at: Number.NaN, flip: true });
    s().setSection({ axis: 'top', at: Infinity, flip: true });
    expect(s().section).toEqual({ axis: 'top', at: 1, flip: true });
  });
  it('is view state: no undo entry, no document change', () => {
    const doc = s().doc;
    const past = s().past.length;
    s().setSection({ axis: 'side', at: 2, flip: false });
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
  });
  it('an edit never moves `at`, and undo/redo/setTool/explode leave it alone', () => {
    s().addBoard();
    s().setSection({ axis: 'front', at: 99, flip: false });
    s().addBoard();
    s().undo();
    s().redo();
    s().setTool('tape');
    s().setTool('select');
    s().setExplode(0.5);
    s().setExplode(0);
    expect(s().section).toEqual({ axis: 'front', at: 99, flip: false });
  });
  it('is cleared by replaceDocument (a project switch)', () => {
    s().setSection({ axis: 'front', at: 3, flip: false });
    s().replaceDocument(createDocument('Other'));
    expect(s().section).toBeNull();
  });
});
