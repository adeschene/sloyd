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

  // Refusal is at ENTRY: an action must not touch view state around a refused edit().
  describe('refuses at entry, leaving view state alone', () => {
    it('Ungroup keeps a hidden child hidden and the doc unchanged', () => {
      s().addBoard();
      s().addBoard();
      s().selectAll();
      s().groupSelected();
      const group = s().selectedIds[0]!;
      const child = worldParts(s().doc)[0]!.id;
      s().setHidden(child, true);
      s().selectBoard(group);
      expect(s().selectedIds).toEqual([group]);
      const [doc, hidden, past] = [s().doc, s().hiddenIds, s().past.length];
      s().setExplode(0.5);
      s().ungroupSelected();
      expect(s().doc).toBe(doc);
      expect(s().hiddenIds).toEqual(hidden);
      expect(hidden).toEqual([child]);
      expect(s().past.length).toBe(past);
    });

    it('Group changes nothing', () => {
      s().addBoard();
      s().addBoard();
      s().selectAll();
      const [doc, sel, past] = [s().doc, s().selectedIds, s().past.length];
      s().setExplode(0.5);
      s().groupSelected();
      expect(s().doc).toBe(doc);
      expect(s().selectedIds).toEqual(sel);
      expect(s().past.length).toBe(past);
    });

    it('Delete keeps the selection, the doc and the held point', () => {
      s().addBoard();
      const board = worldParts(s().doc)[0]!;
      s().selectBoard(board.id);
      s().setTool('tape');
      s().setTapeAnchor(boardSnapPoints(board)[0]!);
      s().setExplode(0.5);
      // Leaving 0 cleared the anchor (setTool); set it again as a held point survivor test.
      s().setTapeAnchor(boardSnapPoints(board)[0]!);
      const [doc, past, anchor] = [s().doc, s().past.length, s().tapeAnchor];
      s().deleteBoards([board.id]);
      expect(s().doc).toBe(doc);
      expect(s().selectedIds).toEqual([board.id]);
      expect(s().tapeAnchor).toBe(anchor);
      expect(anchor).not.toBeNull();
      expect(s().past.length).toBe(past);
    });

    it('addBoard requests no length focus', () => {
      s().consumeLengthFocus();
      s().setExplode(0.5);
      s().addBoard();
      expect(s().pendingLengthFocus).toBe(false);
      expect(s().doc.boards).toHaveLength(0);
    });

    it('removeGuide and clearGuides keep the anchor on a guide', () => {
      s().addGuide([1, 2, 3]);
      const guide = s().doc.guides[0]!;
      s().setTapeAnchor({ kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id: guide.id } });
      const [doc, past, anchor] = [s().doc, s().past.length, s().tapeAnchor];
      s().setExplode(0.5);
      s().setTapeAnchor(anchor!);
      s().removeGuide(guide.id);
      s().clearGuides();
      expect(s().doc).toBe(doc);
      expect(s().tapeAnchor).toBe(anchor);
      expect(s().past.length).toBe(past);
    });
  });
});
