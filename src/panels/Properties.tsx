import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { isSheetGood, pocketCells, cutShape, storedAsShape, cutRemovesNothing, findTenons, positionAxisOf, linkPlan, postureRefusal, storageKey, mirroredAt, worldParts, catalogOf, pickerLibrary, materialKind, instanceAt, parentPath, placementsOf, instanceRefs, containerAt } from '../document/document';
import { DimensionField } from './DimensionField';
import { NameField } from './NameField';
import { ActionBar, COPY_IN_ROW } from './ActionBar';
import { formatLength } from '../units/length';
import type { Units } from '../units/length';
import { NOMINAL_SECTIONS, nominalName } from '../units/nominal';
import { AngleCuts } from './AngleCuts';
import { Holes } from './Holes';
import { Curves } from './Curves';
import type { CustomMaterial, MaterialKind, Rotation, Posture, Grain, Board, Cut, Dimension, Region } from '../document/document';

const DIMENSION_LABEL: Record<Dimension, string> = {
  length: 'Length',
  width: 'Width',
  thickness: 'Thickness',
};

/**
 * One cut's controls. A component of its own — rather than an inline `.map`
 * body in `Properties` — so its "would remove the whole board" error lives in
 * state keyed to the cut's own lifetime via `key={cut.id}`: it is cleared by
 * unmount whenever the cut is removed or the board changes (Properties
 * remounts via `key={board.id}`), so a stale error can never resurface on a
 * different cut, or on this one after a selection round-trip.
 */
function CutRow({ board, cut, units, solids }: { board: Board; cut: Cut; units: Units; solids: Region[] }) {
  const updateCut = useStore((s) => s.updateCut);
  const removeCut = useStore((s) => s.removeCut);
  const [error, setError] = useState<string | null>(null);
  const tenon = findTenons(board).some((t) => t.cutIds.includes(cut.id));
  const shape = cutShape(board, cut, solids);
  const word = tenon ? 'tenon shoulder' : shape.word;
  // Cut-storage spec §3.3: offered only where the sheet prints THIS cut's own
  // line (not a tenon's shoulder) and reads it running the other way.
  // And only where the re-store is accepted: `storedAsShape` hands back the
  // same object when the sheet would read the result differently, and a button
  // that changes nothing would leave an undo entry that does nothing (inv 4).
  // Nor where only the tie's final default chose the direction (fu 198).
  const restored = !tenon && !cutRemovesNothing(board, cut) && cut.across !== shape.run && !shape.runByDefault
    ? storedAsShape(board, cut, solids)
    : cut;
  const sideways = restored !== cut;
  // Bumped whenever a patch is refused. The three DimensionFields below are
  // keyed on it, so a refusal remounts them: each field's own `commit()` has
  // already optimistically set its local text to the (rejected) typed value
  // before `set()` below ever sees the patch, and nothing in DimensionField
  // itself would otherwise resync that text — its adopt-external-change
  // effect only fires when the STORED value changes, and a refused patch, by
  // definition, never reaches the store. Remounting re-initialises each
  // field's local state straight from the still-true stored `cut`, which is
  // this row's analogue of invariant 5's blur resync.
  const [attempt, setAttempt] = useState(0);

  const pos = positionAxisOf(cut.face, cut.across);
  const posDim = board[pos];
  const faceDim = board[cut.face];
  const acrossDim = board[cut.across];

  // Computed from the POST-patch cut, not the loader's clamped values —
  // nothing here has been clamped, so a cut can reach an out-of-range state
  // in-session (e.g. shrinking `face` after adding the cut). `>=`/`<=`
  // therefore refuses everything the loader's `===` would later drop, not
  // just the exact edge it checks.
  const wouldRemoveAll = (patch: Partial<Cut>) => {
    const next = { ...cut, ...patch };
    const p = positionAxisOf(next.face, next.across);
    return next.depth >= board[next.face] &&
           next.offset <= 0 &&
           next.width >= board[p] &&
           next.stopMin <= 0 &&
           next.stopMax <= 0;
  };

  // A stop pair meeting or passing across the whole `across` dimension leaves
  // no cut. Each stop field's max refuses a sum OVER the length, but equality
  // is a value DimensionField allows — so this is needed beside it, not
  // instead of it. Post-patch, like wouldRemoveAll, and for the same reason.
  const wouldLeaveNoCut = (patch: Partial<Cut>) => {
    const next = { ...cut, ...patch };
    return next.stopMin + next.stopMax >= board[next.across];
  };

  // The error is cleared eagerly on any accepted patch (below), but that only
  // covers changes that go through THIS row's own `set()`. An undo, or a
  // board dimension growing via the Dimensions section above, changes `cut`
  // or `board` without ever calling `set()` here — with no invalidation path
  // of its own, a stale error would otherwise outlive the condition it
  // describes indefinitely, survivable only by unmounting (removing the cut,
  // or switching boards and back). Keyed on exactly what `wouldRemoveAll` and
  // `wouldLeaveNoCut` read, so it re-checks whenever any of that changes.
  useEffect(() => {
    if (error && !wouldRemoveAll({}) && !wouldLeaveNoCut({})) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut.face, cut.across, cut.offset, cut.width, cut.depth, cut.stopMin, cut.stopMax,
      board.length, board.width, board.thickness]);

  const acrossRef = useRef<HTMLSelectElement>(null);

  const set = (patch: Partial<Cut>) => {
    if (wouldRemoveAll(patch)) {
      setError('That would remove the whole board.');
      setAttempt((n) => n + 1);
      return;
    }
    // Only a transition INTO the no-cut state is refused. A board shrink can
    // leave a cut with no length already; refusing every edit then would lock
    // the row, since even stopMax -> 0 still leaves the pair crossing.
    if (wouldLeaveNoCut(patch) && !wouldLeaveNoCut({})) {
      setError('That would leave no cut.');
      setAttempt((n) => n + 1);
      return;
    }
    setError(null);
    updateCut(board.id, cut.id, patch);
  };

  /**
   * Adjust offset/width/depth for a new face/across pair, changing only what
   * the new axis actually makes illegal. A prior version of this function
   * recomputed all three unconditionally from addCut's formula, which fixed
   * the unsatisfiable-field bug (below) but introduced a worse one: it threw
   * away perfectly legal numbers on every face/across change, even when
   * nothing about them was actually wrong — silently overwriting what the
   * user typed, which is precisely what refusing-rather-than-clamping and
   * DimensionField's `dirty` guard both exist to avoid elsewhere in this
   * panel.
   *
   * So: clamp only when a value is no longer legal, and prefer a clamp over
   * a reset — a clamped number is closer to the user's intent than a
   * recomputed default. Clamp order mirrors validateCuts' documented order
   * (offset into [0, newPosDim] first, then width into [0, newPosDim -
   * offset]): clamping width first would let an already-out-of-range offset
   * eat into it twice.
   *
   * The one case that is NOT a clamp: if offset was clamped all the way to
   * newPosDim (the old offset was at or past the new axis's full length),
   * there is zero room left for ANY positive width — clamping alone cannot
   * produce a legal cut here, only a fresh position can. That is exactly
   * the unsatisfiable-field bug this function was first written to fix
   * (switching `face` from `thickness` to `length` on the default cut moves
   * the position axis from 24" down to 0.75", and the old offset of 6" has
   * nowhere left to go). Falling back to addCut's own quarter-of-the-axis
   * formula there is deliberate and narrow, not the general rule.
   *
   * The stops are the exception that resets rather than clamps (see the return).
   */
  const repositionForAxes = (face: Dimension, across: Dimension): Partial<Cut> => {
    const newPosDim = board[positionAxisOf(face, across)];
    const newFaceDim = board[face];

    let offset = Math.min(cut.offset, newPosDim);
    let width = Math.min(cut.width, newPosDim - offset);
    if (width <= 0) {
      offset = newPosDim / 4;
      width = Math.min(0.75, newPosDim / 4);
    }
    const depth = Math.min(cut.depth, newFaceDim);

    // The stops measure along `across`. A new `across` makes them numbers
    // along a different dimension that describe nothing, so they RESET —
    // unlike offset/width/depth, which keep meaning on their own axes and are
    // clamped. Same `across`: kept, and still legal.
    return {
      face, across, offset, width, depth,
      ...(across === cut.across ? {} : { stopMin: 0, stopMax: 0 }),
    };
  };

  // Changing `face` to whatever `across` currently holds would leave
  // `across` naming the same dimension twice, so it moves in the same
  // edit — the select is never rendered holding a value it has no option
  // for (the rule follow-up 46 arrived at for grain on sheet goods).
  const setFace = (face: Dimension) => {
    const across = face === cut.across ? positionAxisOf(face, cut.face) : cut.across;
    set(repositionForAxes(face, across));
  };

  return (
    <div className="cut">
      <div className="cut-head">
        <span className="cut-label">{word}</span>
        <button
          className="cut-remove"
          aria-label={`Remove cut (${word}, offset ${formatLength(cut.offset, units)})`}
          onClick={() => removeCut(board.id, cut.id)}
        >
          ✕
        </button>
      </div>

      {/* Kept rather than dropped, so growing the board back restores the
          joint; the cut list leaves it out meanwhile. The loader drops such a
          cut on the next open, and the note says so (follow-up 178). */}
      {cutRemovesNothing(board, cut) && (
        <p className="field-note" role="status">
          This cut no longer fits the board and removes nothing. It will be dropped when the
          project is reopened.
        </p>
      )}

      {sideways && (
        <div className="field-note" role="status">
          <p>The cut list reads this cut as running across the {shape.run}.</p>
          {/* The button unmounts once the cut matches, so focus moves to the
              field the click just changed rather than dropping to <body>. */}
          <button onClick={() => { set(restored); acrossRef.current?.focus(); }}>
            Match the cut list
          </button>
        </div>
      )}

      <div className="field-grid field-grid-2">
      <div className="field">
        <label htmlFor={`face-${cut.id}`}>Cut into</label>
        <select id={`face-${cut.id}`} className="input" value={cut.face}
          onChange={(e) => setFace(e.target.value as Dimension)}>
          <option value="thickness">Face</option>
          <option value="width">Edge</option>
          <option value="length">End</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor={`from-${cut.id}`}>From</label>
        <select id={`from-${cut.id}`} className="input" value={cut.from}
          onChange={(e) => set({ from: e.target.value as Cut['from'] })}>
          <option value="min">Near side</option>
          <option value="max">Far side</option>
        </select>
      </div>

      {/* Full row, so the two stops share the next one (spec §4.4). */}
      <div className="field field-wide">
        <label htmlFor={`across-${cut.id}`}>Runs across</label>
        <select id={`across-${cut.id}`} ref={acrossRef} className="input" value={cut.across}
          onChange={(e) => set(repositionForAxes(cut.face, e.target.value as Dimension))}>
          {(['length', 'width', 'thickness'] as Dimension[])
            .filter((d) => d !== cut.face)
            .map((d) => (
              <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>
            ))}
        </select>
      </div>

      <DimensionField key={`stopMin-${attempt}`} label="Stop short — near end" units={units}
        value={cut.stopMin} min={0} max={Math.max(0, acrossDim - cut.stopMax)}
        onCommit={(v) => set({ stopMin: v })} />
      <DimensionField key={`stopMax-${attempt}`} label="Stop short — far end" units={units}
        value={cut.stopMax} min={0} max={Math.max(0, acrossDim - cut.stopMin)}
        onCommit={(v) => set({ stopMax: v })} />

      <DimensionField key={`offset-${attempt}`} label="From the end" units={units} value={cut.offset}
        min={0} max={posDim} onCommit={(v) => set({ offset: v })} />
      <DimensionField key={`width-${attempt}`} label="Cut width" units={units} value={cut.width}
        max={Math.max(0, posDim - cut.offset)} onCommit={(v) => set({ width: v })} />
      <DimensionField key={`depth-${attempt}`} label="Depth" units={units} value={cut.depth}
        max={faceDim} onCommit={(v) => set({ depth: v })} />
      </div>

      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * The Posture select. Its own component so its refusal lives in state tied to
 * the selected part's lifetime: Properties' root div is keyed on the part, so a
 * selection change remounts this and the message cannot outlive its part, as
 * with CutRow's error. The store refuses the same patch through the same
 * decider (`postureRefusal`), so the two cannot disagree; the select is
 * controlled, so a refused choice snaps back to the stored posture. The
 * message is shown only while the attempted posture is still refused, so an
 * Unlink or an undo clears it without an effect.
 */
function PostureField({ board }: { board: Board }) {
  const updateBoard = useStore((s) => s.updateBoard);
  const [attempt, setAttempt] = useState<Posture | null>(null);
  const error = useStore((s) => (attempt === null ? null : postureRefusal(s.doc, [board.id], attempt)));
  return (
    <>
      <div className="field">
        <label htmlFor="posture">Posture</label>
        <select id="posture" className="input" value={board.posture}
          onChange={(e) => {
            const next = e.target.value as Posture;
            if (postureRefusal(useStore.getState().doc, [board.id], next) !== null) { setAttempt(next); return; }
            setAttempt(null);
            updateBoard(board.id, { posture: next });
          }}>
          <option value="flat">Flat</option>
          <option value="on-edge">On edge</option>
          <option value="upright">Upright</option>
        </select>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}

/**
 * The value every part holds, or null when they differ. EXACT comparison of
 * stored values: two thicknesses that both display 11/16" but are stored as
 * 0.7 and 0.6875 are mixed, because showing "11/16" would claim they agree
 * when they do not (stored values are exact; display rounds — invariant 5).
 */
function shared<T>(boards: Board[], read: (b: Board) => T): T | null {
  const first = read(boards[0]!);
  return boards.every((b) => read(b) === first) ? first : null;
}

/**
 * Properties for two or more selected parts (multi-select spec §4.4): Length,
 * Width, Thickness, Grain and Material, plus Duplicate and Delete. No name,
 * position, posture, turn or cuts.
 *
 * Every edit is ONE `updateBoards` call — one undo entry, each part through
 * the same per-board rules a single edit uses (its own min corner, its own
 * sheet-good grain reset).
 *
 * THE TRAP is invariant 5's: a mixed field (null value) must never write on an
 * untouched blur. DimensionField's dirty guard holds that for the text fields;
 * the selects write only from onChange, never on blur.
 *
 * The root is keyed on the selection, so ANY selection change remounts the
 * fields and they resync from the new parts — the rule invariant 5 states for
 * an external change. Without it a mixed field (null -> null) would keep a
 * stale draft across a selection change, since its value never changed.
 */
const NEW_MATERIAL = '__new__';
type NewMaterialHandler = (ids: string[], kind: MaterialKind) => void;

/**
 * The Nominal size select (custom materials spec §5.3): only when every part's material is sold in nominal sizes.
 * Shows the shared section, `Custom`, or `mixed`; choosing a section sets thickness and width in ONE edit (the
 * normal reorient path, invariant 2). `Custom` changes nothing.
 */
function NominalSize({ ids, boards }: { ids: string[]; boards: Board[] }) {
  const doc = useStore((s) => s.doc);
  const catalog = catalogOf(doc);
  if (boards.length === 0 || !boards.every((b) => catalog.get(b.material)?.nominal)) return null;
  const names = new Set(boards.map((b) => nominalName(b.thickness, b.width, doc.units) ?? 'custom'));
  const value = names.size === 1 ? [...names][0]! : '';
  return (
    <div className="field">
      <label htmlFor="nominal-size">Nominal size</label>
      <select id="nominal-size" className="input" value={value} onChange={(e) => {
        const s = NOMINAL_SECTIONS.find((x) => x.name === e.target.value);
        if (!s) return;
        // Keep the parts' stored order when they all share it, so a board stored thicker-than-wide does not turn
        // over (spec §5.3, amended); a selection mixing orders takes the thinner side as thickness.
        const reversed = boards.every((b) => b.thickness > b.width);
        useStore.getState().updateBoards(ids, reversed ? { thickness: s.width, width: s.thickness } : { thickness: s.thickness, width: s.width });
      }}>
        {value === '' && <option value="" disabled>mixed</option>}
        <option value="custom">Custom</option>
        {NOMINAL_SECTIONS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </div>
  );
}

/** The Material select (custom materials spec §4.2): built-ins, this project's, the library's (one label each), New material…. */
function MaterialSelect({ ids, value, library, onNewMaterial }: {
  ids: string[]; value: string | null; library: CustomMaterial[]; onNewMaterial?: NewMaterialHandler;
}) {
  const doc = useStore((s) => s.doc);
  const catalog = catalogOf(doc);
  const fromLibrary = pickerLibrary(doc.materials, library);
  const pick = (id: string) => {
    if (id === NEW_MATERIAL) {
      // A sheet selection starts a sheet of its kind (one kind for all, else solid): the kind cannot change once saved.
      const world = worldParts(doc).filter((b) => ids.includes(b.id));
      const kinds = new Set(world.map((b) => materialKind(b.material)));
      const only: MaterialKind = kinds.size === 1 ? [...kinds][0]! : 'solid';
      onNewMaterial?.(ids, only);
      return;
    }
    const adopt = fromLibrary.find((m) => m.id === id);
    useStore.getState().updateBoards(ids, { material: id }, adopt ? [adopt] : undefined);
  };
  return (
    <select id="material" className="input" value={value ?? ''} onChange={(e) => pick(e.target.value)}>
      {value === null && <option value="" disabled>mixed</option>}
      {catalog.ids.filter((id) => catalog.get(id)!.builtIn).map((id) => <option key={id} value={id}>{catalog.label(id)}</option>)}
      {doc.materials.length > 0 && (
        <optgroup label="This project">
          {doc.materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      )}
      {fromLibrary.length > 0 && (
        <optgroup label="Your library">
          {fromLibrary.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      )}
      {onNewMaterial && <option value={NEW_MATERIAL}>New material…</option>}
    </select>
  );
}

function GroupProperties({ library, onNewMaterial }: { library: CustomMaterial[]; onNewMaterial?: NewMaterialHandler }) {
  const doc = useStore((s) => s.doc);
  const allBoards = useStore((s) => worldParts(s.doc));
  const selectedIds = useStore((s) => s.selectedIds);
  const units = useStore((s) => s.doc.units);
  const updateBoards = useStore((s) => s.updateBoards);
  const deleteBoards = useStore((s) => s.deleteBoards);
  const duplicateBoards = useStore((s) => s.duplicateBoards);
  const hideUnselected = useStore((s) => s.hideUnselected);
  const linkBoards = useStore((s) => s.linkBoards);
  const unlinkBoards = useStore((s) => s.unlinkBoards);
  const boards = useMemo(
    () => selectedIds.flatMap((id) => allBoards.filter((b) => b.id === id)),
    [allBoards, selectedIds],
  );
  // A selection that includes an assembly is mixed: no shared size fields, no Link.
  const allParts = boards.length === selectedIds.length;
  const plan = useMemo(() => (allParts ? linkPlan(allBoards, selectedIds, (p) => storageKey(doc, p), (p) => mirroredAt(doc, p)) : null), [allParts, allBoards, selectedIds, doc]);
  const anyAssembly = useStore((s) => selectedIds.some((id) => instanceAt(s.doc, id) !== null));
  if (selectedIds.length === 0) return null;

  const set = (patch: Partial<Board>) => updateBoards(selectedIds, patch);
  const grain = allParts ? shared(boards, (b) => b.grain) : null;
  const material = allParts ? shared(boards, (b) => b.material) : null;
  // A sheet good has no 'thickness' grain (isSheetGood's comment), so the
  // option is offered only when it would be legal for EVERY selected part.
  const anySheetGood = boards.some((b) => isSheetGood(b.material));

  return (
    <div className="properties" key={selectedIds.join('|')}>
      <h3 className="props-title">{allParts ? `${boards.length} parts selected` : `${selectedIds.length} items selected`}</h3>
      <ActionBar
        actions={[
          ...(plan && !('refused' in plan) ? [{ label: 'Link', run: () => linkBoards(selectedIds) }] : []),
          { label: 'Duplicate', run: () => duplicateBoards(selectedIds) },
          { label: 'Group', run: () => useStore.getState().groupSelected() },
          { label: 'Hide others', run: hideUnselected },
          ...(allParts && boards.some((b) => b.shape) ? [{ label: 'Unlink', run: () => unlinkBoards(selectedIds) }] : []),
          ...(anyAssembly ? [{ label: 'Ungroup', run: () => useStore.getState().ungroupSelected() }] : []),
          COPY_IN_ROW,
        ]}
        onDelete={() => deleteBoards(selectedIds)}
      />
      {plan && 'refused' in plan && <p className="field-error" role="status">{plan.refused}</p>}
      {plan && !('refused' in plan) && plan.changing.length > 0 && (
        <p className="link-note">
          Linking makes {plan.changing.length} {plan.changing.length === 1 ? 'part' : 'parts'} match {plan.source.name}: size, material, grain, posture and cuts.
        </p>
      )}

      {allParts && <>
      <h3>Size</h3>
      <div className="field-grid field-grid-3">
      <DimensionField label="Length" units={units} value={shared(boards, (b) => b.length)}
        onCommit={(v) => set({ length: v })} />
      <DimensionField label="Width" units={units} value={shared(boards, (b) => b.width)}
        onCommit={(v) => set({ width: v })} />
      <DimensionField label="Thickness" units={units} value={shared(boards, (b) => b.thickness)}
        onCommit={(v) => set({ thickness: v })} />
      </div>
      <NominalSize ids={selectedIds} boards={boards} />

      <h3>Stock</h3>
      <div className="field-grid field-grid-2">
      <div className="field">
        <label htmlFor="grain">Grain runs</label>
        <select id="grain" className="input" value={grain ?? ''}
          onChange={(e) => set({ grain: e.target.value as Grain })}>
          {grain === null && <option value="" disabled>mixed</option>}
          <option value="length">Along length</option>
          <option value="width">Across width</option>
          {!anySheetGood && <option value="thickness">Through thickness</option>}
        </select>
      </div>

      <div className="field">
        <label htmlFor="material">Material</label>
        <MaterialSelect ids={selectedIds} value={material} library={library} onNewMaterial={onNewMaterial} />
      </div>
      </div>
      </>}
    </div>
  );
}

/** The panel for one selected assembly (assemblies spec §10): name, turn and the item actions. */
function InstanceProperties({ path }: { path: string }) {
  const inst = useStore((s) => instanceAt(s.doc, path));
  const duplicateBoards = useStore((s) => s.duplicateBoards);
  const deleteBoards = useStore((s) => s.deleteBoards);
  const hideUnselected = useStore((s) => s.hideUnselected);
  const turnAssembly = useStore((s) => s.turnAssembly);
  // Numbers and a boolean only (inv 43): a Map or array here would re-render on every set().
  const copies = useStore((s) => { const d = instanceAt(s.doc, path); return d ? placementsOf(s.doc).get(d.definition) ?? 0 : 0; });
  const refs = useStore((s) => { const d = instanceAt(s.doc, path); return d ? instanceRefs(s.doc).get(d.definition) ?? 0 : 0; });
  const copyHere = useStore((s) => {
    const me = instanceAt(s.doc, path);
    const c = containerAt(s.doc, parentPath(path));
    return !!me && !!c && c.instances.some((i) => i.definition === me.definition && i.id !== me.id);
  });
  const selectCopies = useStore((s) => s.selectCopies);
  const makeUnique = useStore((s) => s.makeUnique);
  if (!inst) return null;
  return (
    <div className="properties" key={path}>
      <div className="props-name">
        <NameField value={inst.name} onCommit={(typed) => useStore.getState().renameItem(path, typed)} />
        <span className="kind-chip">Assembly</span>
      </div>
      <ActionBar
        actions={[
          { label: 'Duplicate', run: () => duplicateBoards([path]) },
          { label: 'Ungroup', run: () => useStore.getState().ungroupSelected() },
          { label: 'Hide others', run: hideUnselected },
          { label: 'Copy mirrored', run: () => useStore.getState().copyMirrored(path) },
          COPY_IN_ROW,
          ...(copies >= 2 && copyHere ? [{ label: 'Select copies', run: () => selectCopies(path) }] : []),
          ...(refs >= 2 ? [{ label: 'Make Unique', run: () => makeUnique(path) }] : []),
          { label: 'Group', run: () => useStore.getState().groupSelected() },
        ]}
        onDelete={() => deleteBoards([path])}
      />
      <p className="assembly-note">Double-click it in the view to edit its parts.</p>
      {copies >= 2 && <p className="link-note">Shared by {copies} copies: edits inside change all of them.</p>}
      <h3>Orientation</h3>
      <div className="field-grid field-grid-2">
      <div className="field">
        <label htmlFor="turn">Turn</label>
        <select id="turn" className="input" value={inst.rotation}
          onChange={(e) => turnAssembly(path, Number(e.target.value) as Rotation)}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>
      <label className="checkbox field-grid-checkbox">
        <input type="checkbox" checked={inst.mirrored === true}
          onChange={(e) => useStore.getState().mirrorAssembly(path, e.target.checked)} />
        Mirrored
      </label>
      </div>
    </div>
  );
}

export function Properties({ library = [], onNewMaterial }: { library?: CustomMaterial[]; onNewMaterial?: NewMaterialHandler } = {}) {
  const board = useStore((s) =>
    s.selectedIds.length === 1 ? worldParts(s.doc).find((b) => b.id === s.selectedIds[0]) : undefined);
  const instPath = useStore((s) => (s.selectedIds.length === 1 && instanceAt(s.doc, s.selectedIds[0]!) ? s.selectedIds[0]! : null));
  const groupSize = useStore((s) => s.selectedIds.length);
  const units = useStore((s) => s.doc.units);
  const updateBoard = useStore((s) => s.updateBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const duplicateBoard = useStore((s) => s.duplicateBoard);
  const hideUnselected = useStore((s) => s.hideUnselected);
  const addCut = useStore((s) => s.addCut);
  const unlinkBoards = useStore((s) => s.unlinkBoards);
  const selectLinked = useStore((s) => s.selectLinked);
  // OTHER parts using this one's shape (its link); a number, so it re-renders only when the count moves.
  const linkedCount = useStore((s) => {
    const sel = s.selectedIds.length === 1 ? worldParts(s.doc).find((b) => b.id === s.selectedIds[0]) : undefined;
    return sel?.shape ? worldParts(s.doc).filter((b) => b.shape === sel.shape).length - 1 : 0;
  });
  // Whether any OTHER member of this part's link is a VISIBLE direct child of the
  // open level: Select linked can only select those (selectionPatch drops hidden
  // ids and other levels), so the button is shown only then. A boolean, so it
  // re-renders only when it flips (inv 43).
  const linkedHere = useStore((s) => {
    const sel = s.selectedIds.length === 1 ? worldParts(s.doc).find((b) => b.id === s.selectedIds[0]) : undefined;
    return !!sel?.shape && worldParts(s.doc).some((b) => b.shape === sel.shape && b.id !== sel.id && parentPath(b.id) === s.openPath && !s.hiddenIds.includes(b.id));
  });
  const lengthRef = useRef<HTMLInputElement>(null);

  // This component remounts (`key={board.id}` below) on every selection
  // change, including a plain click in the parts list or viewport. Only
  // honor a focus request that addBoard() actually made — consuming it here
  // clears the flag so a later remount (e.g. selecting a different board)
  // does not steal focus again.
  useEffect(() => {
    if (board && useStore.getState().consumeLengthFocus()) {
      lengthRef.current?.focus();
    }
  }, [board?.id]);

  if (groupSize >= 2) return <GroupProperties library={library} onNewMaterial={onNewMaterial} />;
  if (instPath) return <InstanceProperties path={instPath} />;
  if (!board) return <p className="empty">Select a part to edit it.</p>;

  // Once per render, shared by every CutRow's label (no memo key to go stale — inv 15).
  const solids = pocketCells(board);

  const setPos = (axis: 0 | 1 | 2) => (v: number) => {
    const position = [...board.position] as [number, number, number];
    position[axis] = v;
    updateBoard(board.id, { position });
  };

  /**
   * Store a renamed part and report the name that was actually stored, so the
   * field can show it. `renameItem` is the one home of the rule: it dedupes
   * among the part's siblings and writes nothing (no undo entry) when the
   * deduplicated name is the current one.
   */
  const commitName = (typed: string) => useStore.getState().renameItem(board.id, typed);

  return (
    <div className="properties" key={board.id}>
      <div className="props-name">
        <NameField value={board.name} onCommit={commitName} />
        <span className="kind-chip">Part</span>
      </div>
      <ActionBar
        actions={[
          { label: 'Duplicate', run: () => duplicateBoard(board.id) },
          { label: 'Group', run: () => useStore.getState().groupSelected() },
          { label: 'Hide others', run: hideUnselected },
          COPY_IN_ROW,
        ]}
        onDelete={() => deleteBoard(board.id)}
      />
      {linkedCount > 0 && (
        <div className="link-block">
          <p>Linked with {linkedCount} other {linkedCount === 1 ? 'part' : 'parts'}: edits to size, material, grain, posture or cuts change all {linkedCount + 1}.</p>
          <div className="row">
            {linkedHere && <button onClick={() => selectLinked(board.id)}>Select linked</button>}
            <button onClick={() => unlinkBoards([board.id])}>Unlink</button>
          </div>
        </div>
      )}

      <h3>Size</h3>
      <div className="field-grid field-grid-3">
      <DimensionField ref={lengthRef} label="Length" units={units} value={board.length}
        onCommit={(v) => updateBoard(board.id, { length: v })} />
      <DimensionField label="Width" units={units} value={board.width}
        onCommit={(v) => updateBoard(board.id, { width: v })} />
      <DimensionField label="Thickness" units={units} value={board.thickness}
        onCommit={(v) => updateBoard(board.id, { thickness: v })} />
      </div>
      <NominalSize ids={[board.id]} boards={[board]} />

      <h3>Position</h3>
      <div className="field-grid field-grid-3">
      <DimensionField label="X" units={units} allowNegative value={board.position[0]} onCommit={setPos(0)} />
      <DimensionField label="Y" units={units} allowNegative value={board.position[1]} onCommit={setPos(1)} />
      <DimensionField label="Z" units={units} allowNegative value={board.position[2]} onCommit={setPos(2)} />
      </div>

      <h3>Orientation &amp; stock</h3>
      {/* Posture names which of the board's dimensions points up, and that is
          the whole model: it picks the vertical dimension, Turn orders the other
          two. Upright is what v2 could not express — a leg, a post, a stile.
          "Turn" rather than "Rotation" because with three postures it is no
          longer the only thing that rotates the board. */}
      <div className="field-grid field-grid-2">
      <PostureField board={board} />
      <div className="field">
        <label htmlFor="turn">Turn</label>
        <select id="turn" className="input" value={board.rotation}
          onChange={(e) => updateBoard(board.id, { rotation: Number(e.target.value) as Rotation })}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>

      {/* Grain is a property of the part, not of the world: it names which of
          the board's own dimensions the fibres follow, so it turns with the
          board the way real stock does. Across the width is what makes two
          parts meeting at a right angle share one grain direction; through the
          thickness is an end-grain board. */}
      <div className="field">
        <label htmlFor="grain">Grain runs</label>
        <select id="grain" className="input" value={board.grain}
          onChange={(e) => updateBoard(board.id, { grain: e.target.value as Grain })}>
          <option value="length">Along length</option>
          <option value="width">Across width</option>
          {!isSheetGood(board.material) && <option value="thickness">Through thickness</option>}
        </select>
      </div>

      <div className="field">
        <label htmlFor="material">Material</label>
        <MaterialSelect ids={[board.id]} value={board.material} library={library} onNewMaterial={onNewMaterial} />
      </div>
      </div>

      {/* Joinery. One primitive — a rectangular through-cut — so a dado and a
          rabbet are the same control with different numbers, and the label
          is derived from the geometry rather than chosen by the user. */}
      <h3>Cuts{board.cuts.length > 0 && <span className="h3-count"> · {board.cuts.length}</span>}</h3>
      {board.cuts.map((cut) => (
        <CutRow key={cut.id} board={board} cut={cut} units={units} solids={solids} />
      ))}
      <button className="add-cut" onClick={() => addCut(board.id)}>+ Add cut</button>

      <AngleCuts board={board} />
      <Holes board={board} />
      <Curves board={board} />
    </div>
  );
}
