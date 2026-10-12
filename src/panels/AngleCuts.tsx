import { useState } from 'react';
import { useStore } from '../store/store';
import {
  angleCutRemovesNothing, defaultMiter, defaultMiterPair, defaultTaper, miterCut, miterDegrees, miterFields, miterRatio, taperCut, taperFields,
} from '../document/document';
import { angleLine } from '../document/angleText';
import type { AngleCut, Board, CutFrom, MiterFields } from '../document/document';
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
 * edit never swaps them under the user. Tapers and miters are edited; bevels and
 * chamfers (chunk 3, or a hand-edited file) show their bench line and a remove button only.
 */
function AngleRow({ board, cut, precision }: { board: Board; cut: AngleCut; precision: number }) {
  const updateAngleCut = useStore((s) => s.updateAngleCut);
  const removeAngleCut = useStore((s) => s.removeAngleCut);
  // Every hook sits above the kind branch below (rules of hooks): a row whose cut changes kind in place
  // must not change its hook count.
  const [error, setError] = useState<string | null>(null);
  const line = angleLine(board, cut, precision);
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
    const setM = (patch: Partial<MiterFields>) => {
      const next = { ...m, ...patch };
      // A miter deeper than the part is refused, never written (spec §7) — it would consume the part.
      if (board[next.across] * next.ratio > board.length) { setError('Removes more than the length — reduce the angle first.'); return; }
      setError(null);
      updateAngleCut(board.id, cut.id, miterCut(next, board));
    };
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
            <select id={`miter-end-${cut.id}`} className="input" value={m.end} onChange={(e) => setM({ end: e.target.value as CutFrom })}>
              <option value="min">Length min end</option>
              <option value="max">Length max end</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-across-${cut.id}`}>Across</label>
            <select id={`miter-across-${cut.id}`} className="input" value={m.across} onChange={(e) => setM({ across: e.target.value as 'width' | 'thickness' })}>
              <option value="width">Width</option>
              <option value="thickness">Thickness</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-long-${cut.id}`}>Long point</label>
            <select id={`miter-long-${cut.id}`} className="input" value={m.longSide} onChange={(e) => setM({ longSide: e.target.value as CutFrom })}>
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
            if (f.amount > board[o.face]) { setError(`Removes more than the ${o.face} — reduce it first.`); return; }
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
        <DimensionField label="Starts" precision={precision}
          value={Number.isFinite(f.start) ? f.start : null} max={board.length}
          onCommit={(v) => set({ start: v })} />
        <DimensionField label="Removes at that end" precision={precision}
          value={Number.isFinite(f.amount) ? f.amount : null} max={board[f.face]}
          onCommit={(v) => set({ amount: v })} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Angles section (spec §7): a single part's angle cuts. Chunk 2: Taper and Miter. */
export function AngleCuts({ board, precision }: { board: Board; precision: number }) {
  const addAngleCuts = useStore((s) => s.addAngleCuts);
  return (
    <>
      <h3>Angles{board.angleCuts.length > 0 && <span className="h3-count"> · {board.angleCuts.length}</span>}</h3>
      {board.angleCuts.map((cut) => <AngleRow key={cut.id} board={board} cut={cut} precision={precision} />)}
      <Popover className="add-angle" label={<>+ Add<span aria-hidden="true"> ▾</span></>} title="Add an angle cut"
        items={[
          { label: 'Taper', detail: 'Slope one face along the length', run: () => addAngleCuts(board.id, [defaultTaper(board)]) },
          { label: 'Miter', detail: '45° across the width at one end', run: () => addAngleCuts(board.id, [defaultMiter(board)]) },
          { label: 'Miter both ends', detail: 'A picture-frame rail, in one step', run: () => addAngleCuts(board.id, defaultMiterPair(board)) },
        ]} />
    </>
  );
}
