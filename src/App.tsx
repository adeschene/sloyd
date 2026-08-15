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
  // Where focus was when the sheet opened, so closing it puts focus back.
  // Captured HERE rather than in CutList's mount effect: `inert` on the shell
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
  useEffect(() => {
    if (!restored.current || !activeId) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await storage.autoSave(activeId, doc);
      setAvailable(storage.available);
      setSaving(false);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, activeId]);

  // Switching IS a replaceDocument call (invariant 24, spec §3.1): a fresh
  // action would have to re-derive every held-point clearing rule, and a
  // wholesale rewrite of doc.boards is exactly what that invariant names.
  const openProject = useCallback(async (id: string) => {
    if (id === activeId) return;
    const next = await storage.loadProject(id);
    if (!next) return;
    setActiveId(id);
    replaceDocument(next);
    await storage.setActiveProject(id);
  }, [activeId, replaceDocument]);

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
  const onNewProject = useCallback(async () => {
    const next = createDocument('Untitled');
    const id = await storage.createProject(next);
    if (!id) return;
    setActiveId(id);
    replaceDocument(next);
  }, [replaceDocument]);

  // Duplicate does NOT switch: you asked for a copy, not to leave what you
  // were doing. The new row appears in the list on the menu's own refresh.
  const onDuplicateProject = useCallback(async (id: string) => {
    await storage.duplicateProject(id);
  }, []);

  // `deleteProject` resolves `{ activeId, doc } | null`, where null means
  // "nothing about the open project should change" — covering BOTH a
  // refused delete (unusable index) and a successful delete of a project
  // that was not the active one (storage/types.ts). The adapter has already
  // made that decision; re-deriving it here with an `id === activeId` check
  // would risk replacing a document that did not need replacing, dropping
  // unsaved edits.
  const onDeleteProject = useCallback(async (id: string) => {
    const next = await storage.deleteProject(id);
    if (next) {
      setActiveId(next.activeId);
      replaceDocument(next.doc);
    }
  }, [replaceDocument]);

  // The trigger for Import now lives in ProjectMenu; the flow itself and its
  // error surface stay owned by FileMenu (see fileMenuRef below). This is
  // what App hands FileMenu as `onImported`: given a document the user just
  // picked off disk, store it as a NEW library entry and switch to it — the
  // same replaceDocument-based shape as onNewProject/openProject (invariant
  // 24, spec §3.1).
  const importIntoLibrary = useCallback(async (doc: SloydDocument) => {
    const id = await storage.createProject(doc);
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
    setActiveId(id);
    replaceDocument(doc);
  }, [replaceDocument]);

  const fileMenuRef = useRef<FileMenuHandle>(null);
  const onImportProject = useCallback(() => {
    void fileMenuRef.current?.importProjectIntoLibrary();
  }, []);

  // Closing the sheet puts focus back where it was. In an effect rather than
  // in `onClose` because the shell is still `inert` when the handler runs —
  // focusing an inert element does nothing — and effects run after the commit
  // that removes the attribute. Fires on mount too, harmlessly: `opener` is
  // null until something opens the sheet.
  useEffect(() => {
    if (cutListOpen) return;
    const back = opener.current;
    opener.current = null;
    back?.focus();
  }, [cutListOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntry(e.target as HTMLElement)) return;

      // The cut list covers the app, so board shortcuts must not fire behind
      // it — Delete/Backspace especially, which would silently delete the
      // selected board while the user is reading a sheet that never shows a
      // selection. Escape is handled by CutList itself.
      //
      // This guard exists BECAUSE the listener is on `window`: the `inert`
      // shell below makes the covered UI unfocusable and unclickable, but a
      // window listener never sees the DOM tree the event came from as a
      // reason not to fire. Every window-level shortcut in the app needs the
      // flag reaching it explicitly — which is why `Viewport` takes it as a
      // prop rather than inferring it.
      if (cutListOpen) return;

      // Escape backs out one level: drop what is held first, then the tool.
      // Note this sits below the cutListOpen guard on purpose — CutList owns
      // Escape while it is open, and a grab or anchor behind the sheet must
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
      // than merely satisfying the rule: `cutListOpen` above means nothing arms
      // an axis behind a sheet, and `isTextEntry` at the top is why the twin
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
      // one needs the cut-list flag explicitly. Here that inheritance buys two
      // guards rather than one — `cutListOpen` above (no seeding a hidden box
      // while a sheet is being read) and `isTextEntry` at the top, which is
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
  }, [undo, redo, deleteBoard, cutListOpen]);

  return (
    <div className="app">
      {/*
        Everything except the sheet lives in one wrapper so it can be made
        `inert` in a single place while the cut list is open. Without it Tab
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
      <div className="app-shell" inert={cutListOpen}>
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
              shortcutsSuspended={cutListOpen}
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
    </div>
  );
}
