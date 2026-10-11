import { useStore } from './store';
import { boardSnapPoints, createDocument, worldParts } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('explode', () => {
  it('starts at 0, clamps, and refuses a non-finite amount', () => {
    expect(s().explode).toBe(0);
    s().setExplode(2);
    expect(s().explode).toBe(1);
    s().setExplode(Number.NaN);
    expect(s().explode).toBe(1);
    s().setExplode(-1);
    expect(s().explode).toBe(0);
  });

  it('refuses every edit while exploded, pushing no undo entry', () => {
    s().addBoard();
    const doc = s().doc;
    const past = s().past.length;
    s().setExplode(0.5);
    s().addBoard();
    s().setDocumentName('Renamed');
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
    s().setExplode(0);
    s().addBoard();
    expect(s().past.length).toBe(past + 1);
  });

  it('refuses undo and redo while exploded', () => {
    s().addBoard();
    s().addBoard();
    s().undo();
    const doc = s().doc;
    const [past, future] = [s().past.length, s().future.length];
    s().setExplode(0.5);
    s().undo();
    s().redo();
    expect(s().doc).toBe(doc);
    expect([s().past.length, s().future.length]).toEqual([past, future]);
  });

  it('is refused inside a gesture', () => {
    s().beginGesture();
    s().setExplode(0.5);
    s().endGesture();
    expect(s().explode).toBe(0);
  });

  it('leaving 0 returns to Select and drops held points; no other tool while exploded', () => {
    s().addBoard();
    const board = worldParts(s().doc)[0]!;
    s().setTool('tape');
    s().setTapeAnchor(boardSnapPoints(board)[0]!);
    s().setExplode(0.3);
    expect(s().tool).toBe('select');
    expect(s().tapeAnchor).toBeNull();
    s().setTool('move');
    expect(s().tool).toBe('select');
  });

  it('rename returns the STORED name while exploded (invariant 9)', () => {
    s().addBoard();
    const board = worldParts(s().doc)[0]!;
    s().setExplode(0.3);
    expect(s().renameItem(board.id, 'Something else')).toBe(board.name);
    expect(worldParts(s().doc)[0]!.name).toBe(board.name);
  });

  it('still selects and hides while exploded', () => {
    s().addBoard();
    const id = worldParts(s().doc)[0]!.id;
    s().selectBoard(null);
    s().setExplode(0.3);
    s().selectBoard(id);
    expect(s().selectedIds).toEqual([id]);
    s().hideSelected();
    expect(s().hiddenIds).toEqual([id]);
  });

  it('is reset by replaceDocument', () => {
    s().setExplode(0.7);
    s().replaceDocument(createDocument('Other'));
    expect(s().explode).toBe(0);
  });
});
