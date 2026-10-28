import { useStore } from './store';
import { createDocument } from '../document/document';
import type { SavedViewCamera } from '../document/document';

const s = () => useStore.getState();
const cam: SavedViewCamera = { ortho: false, position: [10, 8, 12], target: [0, 1, 0] };
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('saved views store actions', () => {
  it('saveView appends View 1 with the current view state', () => {
    s().addBoard();
    const boardId = s().doc.boards[0]!.id;
    s().setSection({ axis: 'front', at: 2, flip: false });
    s().setHidden(boardId, true);
    const past = s().past.length;
    const id = s().saveView(cam);
    expect(id).toBeTruthy();
    expect(s().doc.views).toEqual([
      { id, name: 'View 1', camera: cam, section: { axis: 'front', at: 2, flip: false }, explode: 0, hidden: [boardId] },
    ]);
    expect(s().past.length).toBe(past + 1);
  });

  it('names count up and stay unique', () => {
    s().saveView(cam);
    s().saveView(cam);
    expect(s().doc.views.map((v) => v.name)).toEqual(['View 1', 'View 2']);
    s().deleteView(s().doc.views[0]!.id);
    s().saveView(cam);
    const names = s().doc.views.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(2);
  });

  it('is allowed while exploded, parts untouched', () => {
    s().addBoard();
    s().setExplode(0.5);
    const boards = s().doc.boards;
    const id = s().saveView(cam)!;
    expect(s().doc.views).toHaveLength(1);
    expect(s().doc.boards).toBe(boards);
    expect(s().doc.views[0]!.explode).toBe(0.5);
    s().updateView(id, { ...cam, ortho: true, height: 4 });
    expect(s().doc.views[0]!.camera.ortho).toBe(true);
    expect(s().renameView(id, 'Front')).toBe('Front');
    expect(s().doc.views[0]!.name).toBe('Front');
    s().deleteView(id);
    expect(s().doc.views).toEqual([]);
    expect(s().doc.boards).toBe(boards);
  });

  it('undo is refused while exploded, then removes the view', () => {
    s().addBoard();
    s().setExplode(0.5);
    s().saveView(cam);
    s().undo();
    expect(s().doc.views).toHaveLength(1);
    s().setExplode(0);
    s().undo();
    expect(s().doc.views).toEqual([]);
  });

  it('refused mid-gesture', () => {
    s().beginGesture();
    expect(s().saveView(cam)).toBeNull();
    expect(s().doc.views).toEqual([]);
    s().endGesture();
  });

  it('updateView replaces camera, section, explode, hidden; keeps id, name, order', () => {
    s().addBoard();
    const boardId = s().doc.boards[0]!.id;
    s().saveView(cam);
    s().saveView(cam);
    s().saveView(cam);
    const before = s().doc.views;
    const mid = before[1]!;
    const cam2: SavedViewCamera = { ortho: true, position: [1, 2, 3], target: [4, 5, 6], height: 7 };
    s().setSection({ axis: 'top', at: 1, flip: true });
    s().setHidden(boardId, true);
    s().setExplode(0.25);
    const past = s().past.length;
    s().updateView(mid.id, cam2);
    const v = s().doc.views;
    expect(v).toHaveLength(3);
    expect(v[1]).toEqual({ id: mid.id, name: mid.name, camera: cam2, section: { axis: 'top', at: 1, flip: true }, explode: 0.25, hidden: [boardId] });
    expect(v[0]).toBe(before[0]);
    expect(v[2]).toBe(before[2]);
    expect(s().past.length).toBe(past + 1);
    s().updateView(mid.id, cam2);
    expect(s().past.length).toBe(past + 1);
  });

  it('renameView', () => {
    s().saveView(cam);
    s().saveView(cam);
    const [a, b] = s().doc.views;
    expect(s().renameView(a!.id, '  Shelf joint ')).toBe('Shelf joint');
    expect(s().renameView(a!.id, 'A › B')).toBe('A > B');
    expect(s().doc.views[0]!.name).toBe('A > B');
    const dup = s().renameView(b!.id, 'A > B');
    expect(dup).not.toBe('A > B');
    expect(s().doc.views[1]!.name).toBe(dup);
    const past = s().past.length;
    expect(s().renameView(b!.id, '   ')).toBe(dup);
    expect(s().renameView('nope', 'X')).toBe('');
    expect(s().past.length).toBe(past);
  });

  it('deleteView removes with one entry; unknown id is no entry', () => {
    s().saveView(cam);
    const id = s().doc.views[0]!.id;
    const past = s().past.length;
    s().deleteView('nope');
    expect(s().past.length).toBe(past);
    s().deleteView(id);
    expect(s().doc.views).toEqual([]);
    expect(s().past.length).toBe(past + 1);
  });

  it('edit() still refuses part edits while exploded', () => {
    s().setExplode(0.5);
    s().addGuide([0, 0, 0]); // calls edit() directly, with no readOnly() check of its own
    expect(s().doc.guides).toHaveLength(0);
  });
});
