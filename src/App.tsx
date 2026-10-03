import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './panels/Toolbar';
import { PartsList } from './panels/PartsList';
import { Properties } from './panels/Properties';
import { GuidesList } from './panels/GuidesList';
import { FileMenu, SaveIndicator, StorageBanner } from './panels/FileMenu';
import type { FileMenuHandle } from './panels/FileMenu';
import { CutList } from './panels/CutList';
import { TapeReadout } from './panels/TapeReadout';
import { GenerateDialog } from './panels/GenerateDialog';
import { SettingsDialog } from './panels/SettingsDialog';
import { useGenerations } from './useGenerations';
import { AnthropicClient } from './llm/anthropic';
import type { LlmSettings } from './storage/types';
import type { DuplicateFailure } from './panels/ProjectMenu';
import { canBeginLength } from './units/length';
import { tapeAxisFromKey, createDocument, DocumentError } from './document/document';
import type { SloydDocument } from './document/document';
import { storage } from './storage/browser';
import { useStore } from './store/store';

/**
 * True for anything the user might be typing into. Keyboard shortcuts must
 * never fire while focus is here — most of all Backspace, which is bound to
 * delete-the-selected-board because that is what the Mac "delete" key sends.
 */
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

export default function App() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const doc = useStore((s) => s.doc);
  const replaceDocument = useStore((s) => s.replaceDocument);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [orthographic, setOrthographic] = useState(false);
  // View state, deliberately not part of the document: whether the grid and
  // the origin axes are drawn is a property of how you're looking at a
  // project, not of the project, so neither saves nor lands on the undo stack.
  // They are two independent flags because they answer different questions —
  // "how big is this" and "where is the origin".
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  // Also view state, and also deliberately outside the document and the undo
  // stack: the cut list is a way of looking at a project, not part of one.
  const [cutListOpen, setCutListOpen] = useState(false);
  // Which dialog is open. View state like `cutListOpen`, and it joins that
  // flag as a reason the shell is inert and every window shortcut is
  // suspended (invariant 27). Not because of typing in the description —
  // isTextEntry already covers text fields — but because the dialog's sheet
  // and buttons hold focus too, and `inert` cannot reach a window listener:
  // `m`, Backspace or Ctrl+Z pressed there would arm Move, delete the
  // selected board, or undo, behind the dialog.
  const [dialog, setDialog] = useState<'generate' | 'settings' | null>(null);
  // THE ONE FLAG every "something covers the app" consumer reads — the inert
  // shell, the keydown effect, `shortcutsSuspended`, the focus restore. One
  // derived value rather than `cutListOpen || dialog !== null` spelled out at
  // each site, so a third modal joins in one place and no consumer can be
  // left reading only the old flag.
  const modalOpen = cutListOpen || dialog !== null;
  const [llmSettings, setLlmSettingsState] = useState<LlmSettings | null>(null);
  // Generated this session and not yet opened (spec §6.3). Session-only:
  // not persisted and not in the store — a badge is a property of this
  // sitting, and nothing about it belongs on the undo stack.
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  // How many runs the live batch started with, for the Toolbar's
  // "Generating done/total…". `useGenerations` knows how many are LIVE; the
  // total is the count the user picked, so it is held here beside the call.
  const [batchSize, setBatchSize] = useState(0);
  // The runs belong to App, not to the dialog, so closing the dialog does not
  // cancel them and reopening it shows the same rows (spec §3.4).
  //
  // NOT A FIFTH ADOPTING HANDLER (spec §3.3, invariant 32): a finished run
  // writes with `createProject(doc, { activate: false })` and nothing else —
  // no switchToken bump, no setActiveId, no replaceDocument. The only way a
  // generated project becomes the open one is the user clicking Open, which
  // goes through `openProject` like any other row. Do not "help" by adopting
  // the first finished design: three can land at unrelated moments, and each
  // would yank the user out of what they were editing.
  const generations = useGenerations({
    onCreated: (id) => setNewIds((s) => new Set(s).add(id)),
    // The same verdict-reporting rule the four switch handlers follow: a
    // failed write must reach the banner, not only the run's row.
    onStorageVerdict: () => setAvailable(storage.available),
  });
  useEffect(() => {
    void storage.getLlmSettings().then(setLlmSettingsState);
  }, []);
  // Where focus was when the sheet or a dialog opened, so closing it puts
  // focus back. Captured HERE, in each opener, rather than in CutList's or a
  // dialog's mount effect: `inert` on the shell
  // blurs whatever was focused behind the scrim, so by the time the modal
  // mounts the opener is already gone from `document.activeElement`.
  const opener = useRef<HTMLElement | null>(null);
  const restored = useRef(false);
  const [activeId, setActiveId] = useState('');
  // False when adoption failed (spec §2.2). The session runs the legacy
  // single-slot path and the caret is not rendered — a failed adoption must
  // degrade to TODAY'S APP, not to an empty one or to a menu that lies.
  const [libraryAvailable, setLibraryAvailable] = useState(false);

  // Restore once on mount, before any autosave can overwrite it.
  //
  // Two hazards this guards against:
  //  - A document edit landing while the restore is still in flight (real
  //    with a slower storage backend than today's synchronous
  //    localStorage): if the user's doc has moved on by the time the
  //    restore resolves, their edit wins and the RESTORED DOCUMENT is
  //    dropped — but activeId/libraryAvailable are adopted regardless (see
  //    the comment below), because which project is open is not in
  //    question just because the document lost the race.
  //  - StrictMode's double-invoke in dev running two overlapping restores:
  //    `cancelled` stops a stale continuation from firing after its effect
  //    was cleaned up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const before = useStore.getState().doc;
      try {
        const { activeId: id, doc: saved, libraryAvailable: libraryOk } = await storage.openLibrary();
        if (cancelled) return;
        // ADOPTED UNCONDITIONALLY, before the edit-wins check below.
        // Which DOCUMENT survives is about the user's edit racing the
        // restore; which PROJECT is open, and whether the library opened at
        // all, is not in question either way — openLibrary already
        // resolved, successfully, with a real answer for both. Making this
        // conditional on the branch below is exactly what silently disabled
        // autosave for the rest of the session: activeId stayed '' forever,
        // the !activeId guard on the autosave effect killed every later
        // save, and SaveIndicator kept claiming "Saved locally" with no
        // banner to say otherwise. (This is the same hazard the old
        // loadAutoSaved-based comment here used to name for a different
        // path — restored below rather than lost.)
        setActiveId(id);
        setLibraryAvailable(libraryOk);
        // The user edited while the restore was in flight — their work
        // wins. Only the DOCUMENT is skipped by this; activeId/
        // libraryAvailable are already adopted above.
        if (useStore.getState().doc !== before) {
          setAvailable(storage.available);
          return;
        }
        replaceDocument(saved);
        setAvailable(storage.available);
      } catch {
        // openLibrary itself carries a documented never-throws contract,
        // unlike the loadAutoSaved() this replaced, so THIS catch has no
        // data to adopt when it's openLibrary's own rejection that lands
        // here — activeId/libraryAvailable correctly stay at their initial
        // false/'' values (autosave off). Not a claim that nothing between
        // the two setActiveId/setLibraryAvailable calls above and here can
        // throw (replaceDocument is a plain store call, not a documented
        // never-throws one) — only that if it did, activeId would already
        // be adopted and restored.current would still correctly become
        // true, which is fine, not the half-adopted state this comment
        // used to warn about.
        if (!cancelled) setAvailable(storage.available);
      } finally {
        if (!cancelled) restored.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceDocument]);

  // Debounced autosave on every document change.
  //
  // TWO SEPARATE THINGS, and it matters which one guards which failure:
  //
  // The protection against the SWITCH RACE is `activeId` being passed as an
  // EXPLICIT ARGUMENT captured in the same closure as `doc` — not read back
  // off adapter state — PLUS `doc` changing on every switch (openProject and
  // onNewProject both call `replaceDocument` with a fresh object). That
  // combination is what makes this effect's cleanup clear the outgoing
  // project's pending timer before the incoming one's ever arms: `doc`
  // alone, already in the dep list, is enough to force the rerun-and-cleanup
  // on every switch. See the race test in App.test.tsx — and see its own
  // comment for why `activeId`'s presence or absence in THIS dep list does
  // not, on its own, change whether that specific race is reachable.
  //
  // `activeId`'s OWN reason to be a dependency is different and is not
  // redundant: it is what arms autosave AT ALL after a mid-restore adoption,
  // the one path where `activeId` changes without `doc` changing (the
  // restore effect's edit-wins branch above adopts `activeId` but skips
  // `replaceDocument`, since the user's in-flight edit is what should win).
  // Drop `activeId` from this dep list and that adoption never reruns this
  // effect, so autosave silently never arms for the rest of the session
  // until some unrelated later edit happens to change `doc` on its own. See
  // "arms autosave against the id adopted mid-restore" in App.test.tsx,
  // verified failing under that exact mutation.
  //
  // A THIRD thing, added later and not a restatement of either: the effect's
  // cleanup closes the race by CANCELLING the outgoing project's pending
  // write, and nobody asked whether that write ever happened at all. It did
  // not — the outgoing project's last <=600 ms of edits were discarded on
  // every switch. `flushAutoSave` below is what makes it happen, and it
  // carries the same id-paired-with-document shape for the same reason.
  //
  // THE PENDING WRITE, held as ONE record: the timer, and a THUNK that closes
  // over the id and the document it was armed for.
  //
  // PROHIBITION: do not split the pair into separate refs, and do not read
  // `activeId` back off state inside the flush. Holding them together is what
  // makes spec §3's crossing race structurally impossible rather than
  // timing-dependent — every flush path writes a MATCHED pair, whichever
  // record it happens to read. Two refs can be updated one render apart, and
  // the failure is A's document landing in B's slot, silently.
  //
  // The THUNK is what upgrades that prohibition from asked-for to enforced
  // (follow-up 158). The record used to carry `{ id, doc, timer }`, and the
  // forbidden line — `storage.autoSave(activeId, p.doc)`, the state id paired
  // with the captured document — compiled and passed all 51 tests in this
  // file. There is now no `p.doc` to pair anything with: the only scope where
  // both halves exist is the effect below, where they ARE each other's
  // counterpart by construction, and the flush has nothing to mismatch. That
  // is a `tsc` failure rather than a review comment.
  const pending = useRef<{ write: () => Promise<void>; timer: ReturnType<typeof setTimeout> } | null>(null);

  /**
   * Write the pending autosave NOW, if there is one. Called by the debounce
   * timer itself and — this is the point — by every handler that is about to
   * switch which project is open.
   *
   * Without it the switch handlers' `setActiveId` + `replaceDocument` re-run
   * the effect below, whose cleanup `clearTimeout`s the outgoing project's
   * pending write and re-arms for the INCOMING one: the outgoing project's
   * last <=600 ms of edits are simply discarded, and switching back shows a
   * stale document. Edit a dimension, open the caret, pick another project is
   * the central gesture of this feature; it must not lose the edit.
   */
  const flushAutoSave = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    await p.write();
    setAvailable(storage.available);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (!restored.current || !activeId) return;
    setSaving(true);
    const timer = setTimeout(() => {
      void flushAutoSave();
    }, 600);
    // THE CAPTURE POINT. This closure is the one scope in the app holding a
    // matched (id, document) pair, and it holds it because the effect reran
    // for exactly these two values — no argument to pass, so none to swap.
    const write = () => storage.autoSave(activeId, doc);
    // Recorded AFTER the timer exists so the record is never half-built. A
    // rerun overwrites it, which is correct: for an edit to the same project
    // the newer document supersedes, and for a SWITCH the handler has already
    // awaited `flushAutoSave` before calling `setActiveId`, so the outgoing
    // pair was written before this line can replace it.
    pending.current = { write, timer };
    return () => clearTimeout(timer);
  }, [doc, activeId, flushAutoSave]);

  // Switching IS a replaceDocument call (invariant 24, spec §3.1): a fresh
  // action would have to re-derive every held-point clearing rule, and a
  // wholesale rewrite of doc.boards is exactly what that invariant names.
  //
  // Every switch handler FLUSHES first: the pending write is for the project
  // being left, and the effect's cleanup would otherwise throw it away.
  //
  // ONE SHARED IN-FLIGHT TOKEN for every handler that adopts a new active
  // project, and the rule it enforces is one sentence: THE LAST HANDLER TO
  // START OWNS THE OUTCOME. Each bumps the token on entry and re-reads it
  // after its awaits; a handler that finds the token moved abandons its
  // adoption and persists nothing.
  //
  // All four are async-before-mutation, so two can be in flight at once —
  // click a row, then reopen the caret and pick another, or pick New while
  // the first load is still out. No wrong-slot WRITE is possible (every write
  // is a matched pair, invariant 29), so the casualty is narrower and quieter:
  // the persisted active id ends on the project the user did not finish on,
  // and the next boot opens it (follow-up 157).
  //
  // This REPLACES `openProject`'s earlier boolean re-entry guard, which
  // declined the second click. A decline cannot be right here: it ends the
  // session on the row the user did NOT click last. Four separate guards
  // would each have had to re-derive that, so there is one token.
  //
  // The bump sits BEFORE the `id === activeId` early return on purpose, so
  // "last click wins" holds uniformly: clicking the already-open row while a
  // switch to another project is out means "stay here", and cancels it.
  const switchToken = useRef(0);
  const openProject = useCallback(async (id: string) => {
    const token = ++switchToken.current;
    if (id === activeId) return;
    await flushAutoSave();
    const next = await storage.loadProject(id);
    if (!next || token !== switchToken.current) return;
    setActiveId(id);
    // Opening a project is what "not yet opened" ends, by whatever route —
    // the dialog's Open, or the project menu's row. Here rather than in the
    // dialog's handler so the menu route clears it too. Returns the SAME set
    // when there is nothing to clear, so an ordinary switch re-renders
    // nothing on its account.
    setNewIds((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    replaceDocument(next);
    await storage.setActiveProject(id);
    // BELOW the token check, unlike the other three handlers, and for the
    // reason 158's limit states rather than by drift: `loadProject` moves no
    // verdict — a missing or unreadable project returns null while the store
    // goes on working — so the only verdict this handler has to report is
    // `setActiveProject`'s, and that call only happens when it wins. Reporting
    // above the check would report nothing.
    setAvailable(storage.available);
  }, [activeId, replaceDocument, flushAutoSave]);

  // Creates a fresh project, makes it the active one, and swaps the document
  // in — the same replaceDocument-based shape as openProject and for the same
  // reason (invariant 24, spec §3.1): a wholesale swap of what "the document"
  // means belongs on that path, not on a bespoke action that would have to
  // re-derive every held-point clearing rule undo/redo/openProject already
  // gets for free.
  //
  // `createProject` returns `string | null` — null means the write failed and
  // nothing was persisted (storage/types.ts). Nothing here is adopted in that
  // case: no activeId change, no replaceDocument, so the session stays
  // exactly where it was rather than switching to a project that does not
  // exist on disk.
  //
  // ONE RULE FOR ALL FOUR HANDLERS, WITH ONE KNOWN LIMIT: every one of them
  // reports the storage layer's verdict by calling
  // `setAvailable(storage.available)` when it finishes, success or failure.
  // Without it a refused delete or a failed create is invisible until some
  // later autosave happens to move the flag — the user acts, nothing happens,
  // and nothing says why.
  //
  // THE LIMIT, stated because this comment claimed a rule it did not have
  // (follow-up 158): `onDuplicateProject` can report a stale `true`. A
  // missing or unreadable source returns null through `loadProject`, which
  // deliberately moves nothing — the store is working, one project is gone —
  // so `storage.available` is still whatever it last was. Flipping it false
  // there would make the banner say persistence is broken when it is not,
  // which browser.ts rules against for the same reason it does at its own
  // `_available` sites. That limit STILL HOLDS and is still right; what
  // changed (follow-up 159) is that the banner is no longer the only place
  // a duplicate could have reported itself, so the limit costs nothing.
  // `onDuplicateProject` now returns WHY it failed and ProjectMenu prints it
  // on the failing row — the same reasoning that gives `importIntoLibrary`
  // its throw, applied to the one handler that had nowhere to put a verdict.
  //
  // `importIntoLibrary` ADDITIONALLY throws, and that is not an
  // inconsistency: it is the only one of the four invoked from a flow that
  // already owns a visible error surface at the point of action (FileMenu's,
  // where a corrupt file reports itself). The banner is easy to miss right
  // after a deliberate action; the other three have nowhere else to put it.
  //
  // `{ activate: false }` plus an explicit `setActiveProject` AFTER the token
  // check, rather than letting `createProject` activate what it writes. This
  // is browser.ts's own ruling applied to its next caller: an implicit
  // activate leaves the trap armed, and here the trap is real — a superseded
  // handler that had already let the adapter move the index's `activeId`
  // would leave the persisted project pointing at a document the user is not
  // looking at, which is the very thing the token exists to prevent. Moving
  // the persisted id and adopting it are now one step, on one side of the
  // check.
  const onNewProject = useCallback(async () => {
    const next = createDocument('Untitled');
    const token = ++switchToken.current;
    await flushAutoSave();
    const id = await storage.createProject(next, { activate: false });
    setAvailable(storage.available);
    if (!id || token !== switchToken.current) return;
    setActiveId(id);
    replaceDocument(next);
    await storage.setActiveProject(id);
  }, [replaceDocument, flushAutoSave]);

  // Duplicate does NOT switch: you asked for a copy, not to leave what you
  // were doing. The new row appears in the list on the menu's own refresh.
  // It still flushes — the copy is taken from what is STORED, so an unwritten
  // edit would be missing from a duplicate of the project you are looking at.
  // The cause is READ OFF `storage.available` rather than plumbed out of the
  // adapter, and that is exact rather than convenient: `duplicateProject`
  // returns null for two reasons, and they are told apart by precisely this
  // flag. A source it could not load moves nothing, so the store is still
  // available; a write it could not commit sets `_available = false` on its
  // way out.
  //
  // **`storage.available`, NOT the `available` React state** — that is the
  // load-bearing half, and it was pinned by mutation rather than argued.
  // `available` is a render behind and `setAvailable` does not update it
  // synchronously, so reading it here reports the PREVIOUS attempt's verdict:
  // swapping the two turns the write-failure case red. What is NOT
  // load-bearing, despite looking like it: the position relative to
  // `setAvailable`. That call sets React state and mutates nothing on the
  // adapter, so hoisting the read above it changes no behaviour and no test —
  // checked, so that a later reader does not preserve an ordering that means
  // nothing while feeling protected by it.
  const onDuplicateProject = useCallback(async (id: string): Promise<DuplicateFailure | null> => {
    await flushAutoSave();
    const copyId = await storage.duplicateProject(id);
    setAvailable(storage.available);
    if (copyId) return null;
    return storage.available ? 'source-missing' : 'write-failed';
  }, [flushAutoSave]);

  // `deleteProject` resolves `{ activeId, doc } | null`, where null means
  // there is nothing to adopt — covering THREE cases: a refused delete
  // (unusable index), a successful delete of a project that was not the
  // active one, and a last-project delete whose replacement could not be
  // written (browser.ts states the list). The adapter has already
  // made that decision; re-deriving it here with an `id === activeId` check
  // would risk replacing a document that did not need replacing, dropping
  // unsaved edits.
  //
  // The flush covers a BACKGROUND delete: the open project keeps its
  // document, and its pending write must not be cancelled by the rerender the
  // delete causes. Deleting the open project flushes into a key that is about
  // to be removed, which is harmless.
  //
  // `null` also covers a third case nobody enumerated at first — the open
  // project was destroyed and its replacement could not be written — where
  // `activeId` below goes on naming a project that no longer exists. That is
  // deliberately NOT patched up here: `storage.autoSave` refuses an id the
  // index does not name (see its comment), so `available` reports it and the
  // banner tells the truth, at the seam, for every route into that state
  // including one caused by another tab.
  //
  // The token check covers the ADOPTION only, and that is the honest limit:
  // `deleteProject`'s own move of the index `activeId` is intrinsic — the
  // project is gone and the adapter must name a replacement — so it cannot be
  // deferred to the far side of the check the way the other three handlers'
  // `setActiveProject` calls are (invariant 32).
  //
  // Follow-up 160 filed that as a residue and it is CLOSED, by neither the
  // remedy it named nor a change here. Two facts closed it. The named remedy —
  // `deleteProject` taking the caller's intended active id — cannot work: this
  // handler captures `activeId` BEFORE its awaits, so on the only path that
  // matters the captured value names the project being deleted, and writing it
  // would leave the index naming something that no longer exists. And the
  // residue is unreachable here anyway, because every index write in
  // `deleteProject` lands in the same synchronous run as its index read (a
  // prohibition and two tests now hold that), so a later-started switch's own
  // write is always the last one. An adapter with genuinely async I/O owes
  // atomic read-modify-write on the index — which every index writer needs,
  // not just this one.
  const onDeleteProject = useCallback(async (id: string) => {
    const token = ++switchToken.current;
    await flushAutoSave();
    const next = await storage.deleteProject(id);
    setAvailable(storage.available);
    if (next && token === switchToken.current) {
      setActiveId(next.activeId);
      replaceDocument(next.doc);
    }
  }, [replaceDocument, flushAutoSave]);

  // The trigger for Import now lives in ProjectMenu; the flow itself and its
  // error surface stay owned by FileMenu (see fileMenuRef below). This is
  // what App hands FileMenu as `onImported`: given a document the user just
  // picked off disk, store it as a NEW library entry and switch to it — the
  // same replaceDocument-based shape as onNewProject/openProject (invariant
  // 24, spec §3.1).
  //
  // Superseding an import does NOT lose it: the project is written and listed
  // either way, and only the switch to it is abandoned. Being a file-picker
  // gesture it is the least likely of the four to be overtaken, which is why
  // the throw below stays about the write failing and says nothing about the
  // token.
  const importIntoLibrary = useCallback(async (doc: SloydDocument) => {
    const token = ++switchToken.current;
    await flushAutoSave();
    const id = await storage.createProject(doc, { activate: false });
    // Before the throw below, not after it: the banner must not lag behind
    // the error the user is already reading.
    setAvailable(storage.available);
    if (!id) {
      // A silent no-op here would leave the user staring at whatever was on
      // screen with no sign the import they just did anything did not take
      // effect — `StorageBanner` covers the underlying `available` flip,
      // but that banner is easy to miss right after an action was taken.
      // Thrown INSIDE `importProjectIntoLibrary`'s try block (FileMenu.tsx),
      // so it surfaces exactly where the user acted, the same as a corrupt
      // file would.
      throw new DocumentError('Could not save the imported project.');
    }
    if (token !== switchToken.current) return;
    setActiveId(id);
    replaceDocument(doc);
    await storage.setActiveProject(id);
  }, [replaceDocument, flushAutoSave]);

  const fileMenuRef = useRef<FileMenuHandle>(null);
  const onImportProject = useCallback(() => {
    void fileMenuRef.current?.importProjectIntoLibrary();
  }, []);

  // Closing the sheet puts focus back where it was. In an effect rather than
  // in `onClose` because the shell is still `inert` when the handler runs —
  // focusing an inert element does nothing — and effects run after the commit
  // that removes the attribute. Fires on mount too, harmlessly: `opener` is
  // null until something opens the sheet.
  //
  // Keyed on `modalOpen`, not `cutListOpen`, so the dialogs get the same
  // return trip. A hop from Generate to Settings (the "Set up your API key"
  // button) keeps `modalOpen` true throughout, so this does not fire in
  // between and focus lands back on the toolbar button the user started from.
  useEffect(() => {
    if (modalOpen) return;
    const back = opener.current;
    opener.current = null;
    back?.focus();
  }, [modalOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntry(e.target as HTMLElement)) return;

      // The cut list or a dialog covers the app, so board shortcuts must not
      // fire behind it — Delete/Backspace especially, which would silently
      // delete the selected board while the user is reading a sheet that never
      // shows a selection. Escape is handled by CutList and the dialogs
      // themselves.
      //
      // This guard exists BECAUSE the listener is on `window`: the `inert`
      // shell below makes the covered UI unfocusable and unclickable, but a
      // window listener never sees the DOM tree the event came from as a
      // reason not to fire. Every window-level shortcut in the app needs the
      // flag reaching it explicitly — which is why `Viewport` takes it as a
      // prop rather than inferring it.
      //
      // `modalOpen` rather than `cutListOpen` since the Generate and Settings
      // dialogs (spec §6.4): their sheet takes focus on mount and is not a
      // text field, so isTextEntry above does not stop `m`, Backspace or
      // Ctrl+Z pressed there. Both dialogs own their Escape, as CutList does.
      if (modalOpen) return;

      // Escape backs out one level: drop what is held first, then the tool.
      // Note this sits below the modalOpen guard on purpose — CutList and both
      // dialogs own Escape while open, and a grab or anchor behind them must
      // survive it.
      if (e.key === 'Escape') {
        const { grabbed, tapeAxis, tapeAnchor, tool, cancelGrab, setTapeAxis, clearTapeAnchor, setTool } =
          useStore.getState();
        if (grabbed) {
          e.preventDefault();
          cancelGrab();
        } else if (tapeAxis) {
          // A rung above the anchor, keeping this ladder's back-out-one-level
          // shape: an axis is a level, and dropping the whole measurement to
          // correct a mis-pressed axis key would cost the anchor too.
          e.preventDefault();
          setTapeAxis(null);
        } else if (tapeAnchor) {
          e.preventDefault();
          clearTapeAnchor();
        } else if (tool !== 'select') {
          e.preventDefault();
          setTool('select');
        }
        return;
      }

      // M toggles the Move tool. Modifier chords are left alone — Ctrl+M and
      // Cmd+M are the browser's and the OS's.
      if (e.key === 'm' || e.key === 'M') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const { tool, setTool } = useStore.getState();
        setTool(tool === 'move' ? 'select' : 'move');
        return;
      }

      // T toggles the Tape tool, the same shape as M. Modifier chords are left
      // alone — Ctrl+T and Cmd+T are the browser's.
      if (e.key === 't' || e.key === 'T') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const { tool, setTool } = useStore.getState();
        setTool(tool === 'tape' ? 'select' : 'tape');
        return;
      }

      // X / Y / Z lock a world axis, so a typed distance can run somewhere no
      // second snap point happens to lie. In this EXISTING listener with M and
      // T rather than in one of its own, which is CLAUDE.md's standing rule for
      // window-level shortcuts — and here the inheritance buys behaviour rather
      // than merely satisfying the rule: `modalOpen` above means nothing arms
      // an axis behind a sheet or a dialog, and `isTextEntry` at the top is why the twin
      // branch in TapeReadout has to exist at all (once the box has focus this
      // listener never sees the key).
      //
      // The modifier test is part of the CONDITION and deliberately not an
      // early `return` like M's and T's: Ctrl+Z is `e.key === 'z'`, so a
      // returning guard here would swallow undo before the block below ever
      // runs. Same spelling the capture below uses, for the same reason.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && tapeAxisFromKey(e.key)) {
        const { tool, tapeAnchor, setTapeAxis } = useStore.getState();
        // An axis with no anchor names no ray. The store refuses it anyway;
        // testing here is what keeps the key FALLING THROUGH when the tape is
        // not armed, rather than being swallowed by a tool that is not in use —
        // the rule the capture below states for its own early return.
        if (tool === 'tape' && tapeAnchor) {
          e.preventDefault();
          setTapeAxis(tapeAxisFromKey(e.key));
          return;
        }
      }

      // TYPE-ANYWHERE DISTANCE ENTRY — SketchUp's VCB, and the reason the Tape
      // tool is worth having at all.
      //
      // Clicking a second snap point only ever places a guide where a snap
      // point already was, which duplicates a point that existed. Typing a
      // distance places one where nothing was — but the box that takes it lives
      // in the corner of the canvas, is deliberately not autofocused, and
      // announces itself with a placeholder. Reaching it means taking the
      // pointer off the target you are measuring to. So the feature was
      // present and effectively unreachable. This routes the first character
      // into the box and focuses it, so a distance is typed where the eye
      // already is.
      //
      // It lives inside this EXISTING listener rather than in one of its own,
      // which is the rule CLAUDE.md states for every window-level shortcut: a
      // window listener never sees which subtree an event came from, so each
      // one needs the modal flag explicitly. Here that inheritance buys two
      // guards rather than one — `modalOpen` above (no seeding a hidden box
      // while a sheet or a dialog is up) and `isTextEntry` at the top, which is
      // also why only the FIRST character needs capturing: once the input has
      // focus every later keystroke matches isTextEntry and returns early,
      // reaching the field directly.
      //
      // Only characters that can BEGIN a length (canBeginLength, derived from
      // parseLength's own patterns) — letters would eat the `t` and `m` tool
      // shortcuts. Modifier chords are left alone, matching the M and T blocks
      // above: Ctrl+0 and Cmd+- are the browser's zoom.
      //
      // The predicate stays "can BEGIN a length" even though the write below
      // appends, and the mismatch is deliberate: it is what decides whether an
      // unfocused keystroke is a NUMBER or a SHORTCUT, and that question is
      // asked afresh each time. Widening it to "can appear in a length" would
      // hand `/` and `"` to a box that may be empty. The cost is that a blurred
      // `3` cannot be continued with `/4` from the canvas — the user is one
      // click from the box, which is now visibly holding their number.
      //
      // No `e.key.length === 1` test here beside canBeginLength: that rule is
      // canBeginLength's own (it is what rejects 'Enter', 'ArrowLeft' and the
      // rest in one line, and a test pins it there). Two predicates that agree
      // today are two places for a future rule to disagree, and the redundant
      // one reads as load-bearing — follow-ups 113 and 125.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && canBeginLength(e.key)) {
        const { tool, tapeAnchor, tapeTyped, setTapeTyped } = useStore.getState();
        if (tool === 'tape' && tapeAnchor) {
          // preventDefault because some of these characters are browser
          // shortcuts with nothing focused ('/' opens quick-find in Firefox,
          // and '-' is a zoom-out chord on some layouts).
          e.preventDefault();
          // APPENDS rather than replaces, and this is a correction: the first
          // version replaced, on the reasoning that an unfocused keystroke
          // cannot be a continuation of anything. It can, by the one gesture
          // this tool is built around.
          //
          // A drag past CLICK_DRAG_SLOP_PX is an orbit, not a click — that is
          // exactly why OrbitControls is left ungated between anchoring and
          // placing, and CLAUDE.md sells it as the payoff ("the camera stays
          // fully usable mid-move, so you can orbit around to find the face you
          // are aiming at"). But a pointerdown on the canvas BLURS this input
          // while leaving the anchor alive. So the encouraged gesture is: type
          // `1`, orbit to see the face, type `2` — and replacing gives you `2`
          // while the box read `1` the whole way round. The displayed text and
          // the next keystroke's effect must not disagree; appending is what
          // makes the box behave the same whether or not it has focus, which is
          // the only rule a person can hold in their head about a text field.
          //
          // The cost is the case this comment used to claim was the common one:
          // a number abandoned rather than interrupted gets typed onto. That is
          // recoverable in one keystroke (the box takes focus below, so
          // Backspace works) and is visible while it happens, where the
          // interrupted-number case was neither.
          setTapeTyped(tapeTyped + e.key);
          // Returning INSIDE the tape branch, not below it: a digit that was
          // not captured has not been handled, so it must fall through to
          // whatever else this listener grows rather than being swallowed by a
          // tool that is not even armed.
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Backspace as well as Delete: the key labeled "delete" on a Mac
      // keyboard is Backspace, and binding only Delete would mean this
      // feature does not exist there.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Deleting the board being carried — or the one the tape is anchored
        // on — would leave the held point naming something that no longer
        // exists. The store drops both defensively; this stops the delete
        // happening at all.
        if (useStore.getState().grabbed || useStore.getState().tapeAnchor) return;
        const id = useStore.getState().selectedId;
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteBoard, modalOpen]);

  return (
    <div className="app">
      {/*
        Everything except the sheet and the dialogs lives in one wrapper so it
        can be made `inert` in a single place while any of them is open
        (`modalOpen`). Without it Tab
        walks out of the modal into NameField, the project-name field and the
        DimensionFields behind the scrim — all of which commit on change or
        blur, so the user silently edits the document while reading a sheet
        that shows no selection. `inert` removes the whole subtree from the tab
        order, from hit-testing and from the accessibility tree at once, which
        is why no hand-rolled Tab cycler is needed here.

        The wrapper is still a direct child of `.app`, so the print rule
        (`.app > *:not(.cutlist-overlay)`) hides it exactly as it hid the three
        elements it replaced.
      */}
      <div className="app-shell" inert={modalOpen}>
        <Toolbar
          orthographic={orthographic}
          onToggleProjection={() => setOrthographic((v) => !v)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
          showAxes={showAxes}
          onToggleAxes={() => setShowAxes((v) => !v)}
          showGuides={showGuides}
          onToggleGuides={() => setShowGuides((v) => !v)}
          onOpenCutList={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setCutListOpen(true);
          }}
          libraryAvailable={libraryAvailable}
          activeId={activeId}
          onOpenProject={openProject}
          onNewProject={onNewProject}
          onDuplicateProject={onDuplicateProject}
          onDeleteProject={onDeleteProject}
          onImportProject={onImportProject}
          onOpenGenerate={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setDialog('generate');
          }}
          onOpenSettings={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setDialog('settings');
          }}
          generating={generations.live > 0 ? { live: generations.live, total: batchSize } : null}
          newIds={newIds}
        >
          <SaveIndicator saving={saving} available={available} />
          <FileMenu ref={fileMenuRef} onImported={importIntoLibrary} />
        </Toolbar>
        <StorageBanner available={available} />
        <main className="workspace">
          {/*
            The viewport and anything drawn OVER it share one positioned
            wrapper. `.workspace` is a plain flex row with no positioning of
            its own and R3F's canvas div is a sibling rather than an ancestor,
            so an absolutely positioned overlay with no wrapper would resolve
            against the initial containing block and land under the sidebar.
            The wrapper is the workspace's first child, so the existing
            `.workspace > :first-child { flex: 1; min-width: 0 }` rule sizes it
            exactly as it sized the Viewport before — this follows the layout
            rather than adding a second one.

            It stays inside `.app-shell` on purpose: TapeReadout contains an
            <input> that commits to the document, which is precisely the class
            of control the cut list's `inert` shell exists to take out of the
            tab order (follow-up 56). Hoisting it to a child of `.app` would
            reopen that defect and lose the print rule as well.
          */}
          <div className="viewport-stack">
            <Viewport
              orthographic={orthographic}
              showGrid={showGrid}
              showAxes={showAxes}
              showGuides={showGuides}
              shortcutsSuspended={modalOpen}
            />
            {/*
              UNCONDITIONALLY MOUNTED, and that is load-bearing rather than
              lazy. It returns null unless the tape is anchored, so
              `{tool === 'tape' && <TapeReadout />}` looks like a free tidy —
              but its hooks run above that early return, and one of them is the
              effect keyed on `[anchor]` that resets `tapeTyped` when a
              measurement ends. Every anchor-clearing path except `setTool`
              relies on it (the store clears the anchor and leaves the text),
              so an unmounted readout leaves a stale number in the store to
              surface the next time a point is anchored. See follow-up 143.
            */}
            <TapeReadout />
          </div>
          <aside className="sidebar">
            <section className="panel panel-parts">
              <h2>Parts</h2>
              <PartsList />
            </section>
            <section className="panel panel-props">
              <h2>Properties</h2>
              <Properties />
            </section>
            <section className="panel panel-guides">
              <h2>Guides</h2>
              <GuidesList />
            </section>
          </aside>
        </main>
      </div>
      {cutListOpen && <CutList onClose={() => setCutListOpen(false)} />}
      {/*
        The two dialogs sit beside CutList, outside `.app-shell`, for the same
        reasons it does: the shell goes `inert` behind them, and the print rule
        (`.app > *:not(.cutlist-overlay)`) hides them without a rule of their
        own.
      */}
      {dialog === 'settings' && (
        <SettingsDialog
          settings={llmSettings}
          onSave={async (s) => {
            const ok = await storage.setLlmSettings(s);
            if (ok) setLlmSettingsState(s);
            return ok;
          }}
          // Closes here because SettingsDialog does not close itself on
          // Forget — left open, it would go on showing a form whose "Saved —
          // type to replace" placeholder describes a key that no longer exists.
          onForget={async () => {
            await storage.clearLlmSettings();
            setLlmSettingsState(null);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'generate' && (
        <GenerateDialog
          hasKey={llmSettings !== null}
          libraryAvailable={libraryAvailable}
          rows={generations.rows}
          live={generations.live}
          plan={generations.plan}
          onGenerate={(s, n) => {
            if (!llmSettings) return;
            setBatchSize(n);
            generations.start(new AnthropicClient(llmSettings.apiKey, llmSettings.model), s, n);
          }}
          onCancel={generations.cancel}
          // The ONE adopting path generation uses (spec §3.3): the existing
          // `openProject`, token and flush and all.
          onOpenProject={(id) => {
            setDialog(null);
            void openProject(id);
          }}
          onOpenSettings={() => setDialog('settings')}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
