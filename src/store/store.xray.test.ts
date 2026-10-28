import { useStore } from './store';
import { createDocument } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('xray', () => {
  it('starts off and is set by setXray', () => {
    expect(s().xray).toBe(false);
    s().setXray(true);
    expect(s().xray).toBe(true);
    s().setXray(false);
    expect(s().xray).toBe(false);
  });
  it('is view state: no undo entry, no document change', () => {
    s().addBoard();
    const doc = s().doc;
    const past = s().past.length;
    s().setXray(true);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
  });
  it('undo, redo, selection, explode and section leave it', () => {
    s().setXray(true);
    s().addBoard();
    s().undo();
    s().redo();
    s().setExplode(0.5);
    s().setExplode(0);
    s().setSection({ axis: 'front', at: 1, flip: false });
    s().setSection(null);
    const id = s().doc.boards[0]!.id;
    s().toggleSelected(id);
    s().toggleSelected(id);
    expect(s().xray).toBe(true);
  });
  it('works while exploded and mid-gesture', () => {
    s().setExplode(0.5);
    s().setXray(true);
    expect(s().xray).toBe(true);
    s().setExplode(0);
    s().beginGesture();
    s().setXray(false);
    expect(s().xray).toBe(false);
    s().endGesture();
  });
  it('is cleared by replaceDocument (a project switch)', () => {
    s().setXray(true);
    s().replaceDocument(createDocument('Other'));
    expect(s().xray).toBe(false);
  });
});
