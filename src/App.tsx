import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewport } from './viewport/Viewport';
import { Toolbar } from './panels/Toolbar';
import { PartsList } from './panels/PartsList';
import { Properties } from './panels/Properties';
import { GuidesList } from './panels/GuidesList';
import { FileMenu, SaveIndicator, StorageBanner } from './panels/FileMenu';
import { CutList } from './panels/CutList';
import { TapeReadout } from './panels/TapeReadout';
import { canBeginLength } from './units/length';
import { tapeAxisFromKey } from './document/document';
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
  //    restore resolves, their edit wins and the restore is dropped.
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
        // The user edited while the restore was in flight — their work wins.
        if (useStore.getState().doc !== before) {
          setAvailable(storage.available);
          return;
        }
        setActiveId(id);
        setLibraryAvailable(libraryOk);
        replaceDocument(saved);
        setAvailable(storage.available);
      } catch {
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
  // `activeId` is in the dep list and passed EXPLICITLY, which is what makes
  // switching safe: a switch changes both it and `doc` in one render, and
  // this effect's cleanup clears the pending timer before the new one arms.
  // Drop the id from either place and a timer armed before a switch writes
  // the outgoing project into the incoming project's slot. See the race test
  // in App.test.tsx.
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

  // TASK 5 SCAFFOLDING: `libraryAvailable` decides whether the project menu
  // renders at all (a failed adoption must show today's app, not a menu that
  // lies), and `openProject` is its switch handler. Neither is threaded into
  // Toolbar yet — that wiring is Task 5's, deliberately out of scope here.
  // Referenced only so `noUnusedLocals` doesn't fail the build in the
  // meantime; remove this line once Task 5 consumes them for real.
  void libraryAvailable;
  void openProject;

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
        >
          <SaveIndicator saving={saving} available={available} />
          <FileMenu />
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
