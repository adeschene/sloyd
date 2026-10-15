import { useState } from 'react';
import { useStore } from '../store/store';
import {
  CHAMFER_EDGES, angleCutRemovesNothing, bevelAcross, bevelCut, bevelFields, chamferCut, chamferFields, defaultBevel, defaultChamfer,
  defaultMiter, defaultMiterPair, defaultTaper, miterCut, miterDegrees, miterFields, miterRatio, taperCut, taperFields,
} from '../document/document';
import { angleLine } from '../document/angleText';
import type { AngleCut, BevelFields, Board, ChamferFields, CutFrom, Dimension, MiterFields } from '../document/document';
import { DimensionField } from './DimensionField';
import { AngleField } from './AngleField';
import { Popover } from './Popover';

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
  if (cut.kind === 'miter') {
    const m = miterFields(cut, board);
    // Returns the refusal (fu 339): a select shows it in the row's alert (`pick`), a field as its own error.
    const setM = (patch: Partial<MiterFields>): string | void => {
      const next = { ...m, ...patch };
      // A miter deeper than the part is refused, never written (spec §7) — it would consume the part.
      if (board[next.across] * next.ratio > board.length) return 'Removes more than the length — reduce the angle first.';
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
    const setB = (patch: Partial<BevelFields>): string | void => {
      const next = { ...bevel, ...patch };
      // A bevel deeper than its face is refused, never written (spec §7) — it would consume the part.
      if (board[bevelAcross(next.face)] * next.ratio > board[next.face]) return `Removes more than the ${next.face} — reduce the angle first.`;
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
        <div className="field-grid field-grid-2">
          <div className="field field-wide">
            <label htmlFor={`chamfer-edge-${cut.id}`}>Edge</label>
            <select id={`chamfer-edge-${cut.id}`} className="input" value={edgeIndex} onChange={(e) => {
              const x = CHAMFER_EDGES[Number(e.target.value)]!;
              // Changing the edge keeps the legs; a leg longer than the new edge's face is refused, never clamped.
              const over = chamfer.legFace > board[x.face] ? x.face : chamfer.legAlong > board[x.along] ? x.along : null;
              if (over) { setError(`Removes more than the ${over} — reduce the size first.`); return; }
              setC(x);
            }}>
              {CHAMFER_EDGES.map((x, i) => <option key={i} value={i}>{edgeText(x)}</option>)}
            </select>
          </div>
          <DimensionField label="Size" units={units}
            value={chamfer.legFace === chamfer.legAlong ? chamfer.legFace : null} max={Math.min(board[chamfer.face], board[chamfer.along])}
            onCommit={(v) => setC({ legFace: v, legAlong: v })} />
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
  return (
    <div className="cut">
      {head}
      <p className="field-note">{line}</p>
      {none}
      <div className="field-grid field-grid-2">
        <div className="field field-wide">
          <label htmlFor={`angle-face-${cut.id}`}>Face</label>
          <select id={`angle-face-${cut.id}`} className="input" value={`${f.face}|${f.from}`} onChange={(e) => {
            const o = FACES.find((x) => x.value === e.target.value)!;
            // A removal beyond the new face is refused, never written (spec §7); the select stays on the stored face.
            if (f.amount > board[o.face]) { setError(`Removes more than the ${o.face} — reduce the removal first.`); return; }
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
  return (
    <>
      <h3>Angles{board.angleCuts.length > 0 && <span className="h3-count"> · {board.angleCuts.length}</span>}</h3>
      {board.angleCuts.map((cut) => <AngleRow key={cut.id} board={board} cut={cut} />)}
      <Popover className="add-angle" label={<>+ Add<span aria-hidden="true"> ▾</span></>} title="Add an angle cut"
        items={[
          { label: 'Taper', detail: 'Slope one face along the length', run: () => addAngleCuts(board.id, [defaultTaper(board)]) },
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
        ]} />
    </>
  );
}
