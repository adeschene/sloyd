import { useState } from 'react';
import { useStore } from '../store/store';
import {
  CHAMFER_EDGES, angleCutRemovesNothing, bevelAcross, bevelCut, bevelFields, chamferCut, chamferFields, defaultBevel, defaultChamfer, defaultRaisedPanel,
  defaultMiter, defaultMiterPair, defaultTaper, defaultTaperFaces, miterCut, miterDegrees, miterFields, miterRatio, taperCut, taperFields, TAPER_FOUR, TAPER_TWO,
} from '../document/document';
import { angleLine } from '../document/angleText';
import type { AngleCut, BevelFields, Board, ChamferFields, CutFrom, Dimension, MiterFields } from '../document/document';
import { DimensionField } from './DimensionField';
import { AngleField } from './AngleField';
import { Popover } from './Popover';
import { formatLength } from '../units/length';

const FACES: { value: string; label: string; face: 'width' | 'thickness'; from: CutFrom }[] = [
  { value: 'width|min', label: 'Width face — min side', face: 'width', from: 'min' },
  { value: 'width|max', label: 'Width face — max side', face: 'width', from: 'max' },
  { value: 'thickness|min', label: 'Thickness face — min side', face: 'thickness', from: 'min' },
  { value: 'thickness|max', label: 'Thickness face — max side', face: 'thickness', from: 'max' },
];

/**
 * One angle cut (angle-cuts spec §7). Its `kind` picks the controls, so an
 * edit never swaps them under the user. Every kind is edited; a stored cut the row cannot represent
 * (a hand-edited file) shows its bench line and a remove button only.
 */
/**
 * fu 296 (holes' and curves' precedent): a cut a later RESIZE pushed past its part is KEPT and noted ("… at this
 * size."), never clamped; an edit is refused only when it would overrun by MORE than the stored cut does. So a shortened
 * rail's miter can still change its long point or end, or be reduced, but never deepened past the part. `excess` is how
 * far a cut's depth passes what it may remove (≤ 0: it fits).
 */
const worse = (next: number, stored: number) => next > 1e-9 && next > stored + 1e-9;

function AngleRow({ board, cut }: { board: Board; cut: AngleCut }) {
  const units = useStore((s) => s.doc.units);
  const updateAngleCut = useStore((s) => s.updateAngleCut);
  const removeAngleCut = useStore((s) => s.removeAngleCut);
  // Every hook sits above the kind branch below (rules of hooks): a row whose cut changes kind in place
  // must not change its hook count.
  const [error, setError] = useState<string | null>(null);
  const line = angleLine(board, cut, units);
  const head = (
    <div className="cut-head">
      <span className="cut-label">{cut.kind[0]!.toUpperCase() + cut.kind.slice(1)}</span>
      <button className="cut-remove" aria-label={`Remove angle cut (${line})`} onClick={() => removeAngleCut(board.id, cut.id)}>✕</button>
    </div>
  );
  const none = angleCutRemovesNothing(board, cut) && (
    <p className="field-note" role="status">{`This ${cut.kind} removes nothing at this size.`}</p>
  );
  const m = cut.kind === 'miter' ? miterFields(cut, board) : null;
  if (m) {
    // Returns the refusal (fu 339): a select shows it in the row's alert (`pick`), a field as its own error.
    const mExcess = board[m.across] * m.ratio - board.length;
    const setM = (patch: Partial<MiterFields>): string | void => {
      const next = { ...m, ...patch };
      // A miter deeper than the part is refused, never written (spec §7) — it would consume the part — unless the stored
      // one already is, at this size, and this edit goes no deeper (fu 296).
      if (worse(board[next.across] * next.ratio - board.length, mExcess)) return 'Removes more than the length — reduce the angle first.';
      setError(null);
      updateAngleCut(board.id, cut.id, miterCut(next, board));
    };
    const pickM = (patch: Partial<MiterFields>) => { const r = setM(patch); if (r) setError(r); };
    const maxDegrees = miterDegrees(board.length / board[m.across]);
    const acrossName = m.across === 'width' ? 'Width' : 'Thickness';
    return (
      <div className="cut">
        {head}
        <p className="field-note">{line}</p>
        {none}
        {mExcess > 1e-9 && <p className="field-note" role="status">This miter removes more than the length at this size.</p>}
        <div className="field-grid field-grid-2">
          <div className="field field-wide">
            <label htmlFor={`miter-end-${cut.id}`}>End</label>
            <select id={`miter-end-${cut.id}`} className="input" value={m.end} onChange={(e) => pickM({ end: e.target.value as CutFrom })}>
              <option value="min">Length min end</option>
              <option value="max">Length max end</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-across-${cut.id}`}>Across</label>
            <select id={`miter-across-${cut.id}`} className="input" value={m.across} onChange={(e) => pickM({ across: e.target.value as 'width' | 'thickness' })}>
              <option value="width">Width</option>
              <option value="thickness">Thickness</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-long-${cut.id}`}>Long point</label>
            <select id={`miter-long-${cut.id}`} className="input" value={m.longSide} onChange={(e) => pickM({ longSide: e.target.value as CutFrom })}>
              <option value="min">{`${acrossName} — min side`}</option>
              <option value="max">{`${acrossName} — max side`}</option>
            </select>
          </div>
          <AngleField label="Angle" value={miterDegrees(m.ratio)} max={maxDegrees}
            onCommit={(deg) => setM({ ratio: miterRatio(deg) })} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    );
  }
  const bevel = cut.kind === 'bevel' ? bevelFields(cut, board) : null;
  if (bevel) {
    const bExcess = board[bevelAcross(bevel.face)] * bevel.ratio - board[bevel.face];
    const setB = (patch: Partial<BevelFields>): string | void => {
      const next = { ...bevel, ...patch };
      // A bevel deeper than its face is refused, never written (spec §7) — it would consume the part — unless the stored
      // one already is, at this size, and this edit overruns no further (fu 296).
      if (worse(board[bevelAcross(next.face)] * next.ratio - board[next.face], bExcess)) return `Removes more than the ${next.face} — reduce the angle first.`;
      setError(null);
      updateAngleCut(board.id, cut.id, bevelCut(next, board));
    };
    const pickB = (patch: Partial<BevelFields>) => { const r = setB(patch); if (r) setError(r); };
    const across = bevelAcross(bevel.face);
    const acrossName = across === 'width' ? 'Width' : 'Thickness';
    return (
      <div className="cut">
        {head}
        <p className="field-note">{line}</p>
        {none}
        {bExcess > 1e-9 && <p className="field-note" role="status">{`This bevel removes more than the ${bevel.face} at this size.`}</p>}
        <div className="field-grid field-grid-2">
          <div className="field field-wide">
            <label htmlFor={`bevel-face-${cut.id}`}>Face</label>
            <select id={`bevel-face-${cut.id}`} className="input" value={`${bevel.face}|${bevel.from}`} onChange={(e) => {
              const o = FACES.find((x) => x.value === e.target.value)!;
              pickB({ face: o.face, from: o.from });
            }}>
              {FACES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`bevel-long-${cut.id}`}>Long point</label>
            <select id={`bevel-long-${cut.id}`} className="input" value={bevel.longSide} onChange={(e) => pickB({ longSide: e.target.value as CutFrom })}>
              <option value="min">{`${acrossName} — min side`}</option>
              <option value="max">{`${acrossName} — max side`}</option>
            </select>
          </div>
          <AngleField label="Angle" value={miterDegrees(bevel.ratio)} max={miterDegrees(board[bevel.face] / board[across])}
            onCommit={(deg) => setB({ ratio: miterRatio(deg) })} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    );
  }
  const chamfer = cut.kind === 'chamfer' ? chamferFields(cut, board) : null;
  if (chamfer) {
    const setC = (patch: Partial<ChamferFields>) => {
      setError(null);
      updateAngleCut(board.id, cut.id, chamferCut({ ...chamfer, ...patch }, board));
    };
    const cExcess = Math.max(chamfer.legFace - board[chamfer.face], chamfer.legAlong - board[chamfer.along]);
    const edgeIndex = CHAMFER_EDGES.findIndex((x) => x.face === chamfer.face && x.from === chamfer.from && x.along === chamfer.along && x.alongFrom === chamfer.alongFrom);
    const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
    // fu 300: the bench vocabulary, short enough not to clip (fu 299) — a length side is an end; the through dimension is implied.
    const sideText = (d: Dimension, side: CutFrom) => `${d} ${side} ${d === 'length' ? 'end' : 'side'}`;
    const edgeText = (x: (typeof CHAMFER_EDGES)[number]) => cap(`${sideText(x.face, x.from)} · ${sideText(x.along, x.alongFrom)}`);
    return (
      <div className="cut">
        {head}
        <p className="field-note">{line}</p>
        {none}
        {cExcess > 1e-9 && <p className="field-note" role="status">This chamfer is bigger than its edge at this size.</p>}
        <div className="field-grid field-grid-2">
          <div className="field field-wide">
            <label htmlFor={`chamfer-edge-${cut.id}`}>Edge</label>
            <select id={`chamfer-edge-${cut.id}`} className="input" value={edgeIndex} onChange={(e) => {
              const x = CHAMFER_EDGES[Number(e.target.value)]!;
              // Changing the edge keeps the legs; a leg longer than the new edge's face is refused, never clamped — unless
              // the stored edge's legs already overrun as far, at this size (fu 296).
              const over = chamfer.legFace > board[x.face] ? x.face : chamfer.legAlong > board[x.along] ? x.along : null;
              const excess = Math.max(chamfer.legFace - board[x.face], chamfer.legAlong - board[x.along]);
              if (over && worse(excess, cExcess)) { setError(`Removes more than the ${over} — reduce the leg into the ${over} first.`); return; }
              setC(x);
            }}>
              {CHAMFER_EDGES.map((x, i) => <option key={i} value={i}>{edgeText(x)}</option>)}
            </select>
          </div>
          {/* fu 298: one field per leg, each its own stored value (never a mixed field), labelled as the bench line words
              it. A leg a resize pushed past its dimension may be reduced, never deepened (fu 296): the max is the larger of
              the dimension and the stored leg. */}
          <DimensionField label={`Into the ${chamfer.face}`} units={units}
            value={chamfer.legFace} max={Math.max(board[chamfer.face], chamfer.legFace)}
            onCommit={(v) => setC({ legFace: v })} />
          <DimensionField label={`Into the ${chamfer.along}`} units={units}
            value={chamfer.legAlong} max={Math.max(board[chamfer.along], chamfer.legAlong)}
            onCommit={(v) => setC({ legAlong: v })} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    );
  }
  if (cut.kind !== 'taper') {
    return <div className="cut">{head}<p className="field-note">{line}</p>{none}</div>;
  }
  const f = taperFields(cut, board);
  const set = (patch: Partial<typeof f>) => {
    setError(null);
    updateAngleCut(board.id, cut.id, taperCut({ ...f, ...patch }));
  };
  const tExcess = f.amount - board[f.face];
  return (
    <div className="cut">
      {head}
      <p className="field-note">{line}</p>
      {none}
      {tExcess > 1e-9 && <p className="field-note" role="status">{`This taper removes more than the ${f.face} at this size.`}</p>}
      <div className="field-grid field-grid-2">
        <div className="field field-wide">
          <label htmlFor={`angle-face-${cut.id}`}>Face</label>
          <select id={`angle-face-${cut.id}`} className="input" value={`${f.face}|${f.from}`} onChange={(e) => {
            const o = FACES.find((x) => x.value === e.target.value)!;
            // A removal beyond the new face is refused, never written (spec §7); the select stays on the stored face —
            // unless the stored removal already passes its face as far, at this size (fu 296).
            if (worse(f.amount - board[o.face], tExcess)) { setError(`Removes more than the ${o.face} — reduce the removal first.`); return; }
            set({ face: o.face, from: o.from });
          }}>
            {FACES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field field-wide">
          <label htmlFor={`angle-end-${cut.id}`}>From</label>
          <select id={`angle-end-${cut.id}`} className="input" value={f.end} onChange={(e) => set({ end: e.target.value as CutFrom })}>
            <option value="min">Length min end</option>
            <option value="max">Length max end</option>
          </select>
        </div>
        <DimensionField label="Starts" units={units}
          value={Number.isFinite(f.start) ? f.start : null} max={board.length}
          onCommit={(v) => set({ start: v })} />
        <DimensionField label="Removes at that end" units={units}
          value={Number.isFinite(f.amount) ? f.amount : null} max={board[f.face]}
          onCommit={(v) => set({ amount: v })} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Angles section (spec §7): a single part's angle cuts. Taper, Miter, Bevel and Chamfer. */
export function AngleCuts({ board }: { board: Board }) {
  const addAngleCuts = useStore((s) => s.addAngleCuts);
  const units = useStore((s) => s.doc.units);
  const raised = defaultRaisedPanel(board);
  // The menu's lengths read the project's units (presets minors 3); imperial formats as written before, `1/4"`.
  const tongue = formatLength(0.25, units);
  return (
    <>
      <h3>Angles{board.angleCuts.length > 0 && <span className="h3-count"> · {board.angleCuts.length}</span>}</h3>
      {board.angleCuts.map((cut) => <AngleRow key={cut.id} board={board} cut={cut} />)}
      <Popover className="add-angle" label={<>+ Add<span aria-hidden="true"> ▾</span></>} title="Add an angle cut"
        items={[
          { label: 'Taper', detail: 'Slope one face along the length', run: () => addAngleCuts(board.id, [defaultTaper(board)]) },
          // fu 278: independent rows in one undo entry; never withheld (each removes at most ¼ of either cross dimension).
          { label: 'Taper two faces', detail: "Slope two adjacent faces (a leg's inside faces)", run: () => addAngleCuts(board.id, defaultTaperFaces(board, TAPER_TWO)) },
          { label: 'Taper four faces', detail: 'Slope all four faces along the length', run: () => addAngleCuts(board.id, defaultTaperFaces(board, TAPER_FOUR)) },
          // A 45° miter across the width is as deep as the width; deeper than the length is refused on edit, so don't offer it (fu 296).
          ...(board.width > board.length ? [] : [
            { label: 'Miter', detail: '45° across the width at one end', run: () => addAngleCuts(board.id, [defaultMiter(board)]) },
            { label: 'Miter both ends', detail: 'A picture-frame rail, in one step', run: () => addAngleCuts(board.id, defaultMiterPair(board)) },
          ]),
          // The default 15° bevel is as deep as thickness × tan 15°; deeper than the width is refused on edit, so don't offer it.
          ...(board.thickness * miterRatio(15) > board.width ? [] : [
            { label: 'Bevel', detail: '15° along one edge', run: () => addAngleCuts(board.id, [defaultBevel(board)]) },
          ]),
          { label: 'Chamfer', detail: 'Knock off one edge at 45°', run: () => addAngleCuts(board.id, [defaultChamfer(board)]) },
          // Withheld under 1/2" thick (presets-batch spec §3.2): the 1/4" tongue would leave too shallow a bevel.
          ...(raised ? [{ label: 'Raised panel', detail: `Bevel the four front edges, leaving a ${tongue} tongue`, run: () => addAngleCuts(board.id, raised) }] : []),
        ]} />
    </>
  );
}
