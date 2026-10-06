import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { boardsBounds } from '../document/document';
import { MAX_ROW, rowLayout } from '../document/row';
import type { RowMode, RowRefusal } from '../document/row';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';

const DIRECTIONS = [
  { label: '+X', axis: 0, sign: 1 },
  { label: '−X', axis: 0, sign: -1 },
  { label: '+Y (up)', axis: 1, sign: 1 },
  { label: '−Y (down)', axis: 1, sign: -1 },
  { label: '+Z', axis: 2, sign: 1 },
  { label: '−Z', axis: 2, sign: -1 },
] as const;
const FIELD_LABEL: Record<RowMode, string> = { gap: 'Gap', pitch: 'Pitch', fit: 'Across' };

/**
 * Copy in a row (copy-in-a-row spec §3): N ordinary copies of the selection
 * along an axis. Reads the selection itself and holds its values as local
 * state; nothing touches the document until Apply. It is rendered inside each
 * Properties panel's selection-keyed root, so a selection change remounts it,
 * closed and reset. rowLayout is the ONE source of the numbers: the summary
 * shows exactly what Apply will do.
 */
export function CopyInRow() {
  const allBoards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const precision = useStore((s) => s.doc.units.precision);
  const copyInRow = useStore((s) => s.copyInRow);
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState('2');
  const [dir, setDir] = useState(0);
  const [mode, setMode] = useState<RowMode>('gap');
  const [typed, setTyped] = useState<Partial<Record<RowMode, number>>>({ gap: 0 });
  // The measurement field is showing a refusal (fu 218): Apply would otherwise
  // use the last GOOD value while the field shows another. Reported by the
  // field itself, so every path that sets or clears its error is covered.
  const [fieldRefused, setFieldRefused] = useState(false);

  // Only while open: closed, the button needs nothing but whether anything is
  // selected, and this runs on every boards change (every drag frame).
  const selected = useMemo(() => {
    if (!open) return [];
    const byId = new Map(allBoards.map((b) => [b.id, b]));
    return selectedIds.flatMap((id) => byId.get(id) ?? []);
  }, [open, allBoards, selectedIds]);
  if (selectedIds.length === 0) return null;
  if (!open) {
    return <button className="copy-row-open" onClick={() => setOpen(true)}>Copy in a row…</button>;
  }
  if (selected.length === 0) return null;

  const { axis, sign } = DIRECTIONS[dir]!;
  const bounds = boardsBounds(selected)!;
  const s = bounds.max[axis] - bounds.min[axis];
  const value = typed[mode] ?? (mode === 'pitch' ? s : 2 * s);
  const count = Number(countText);
  const layout = rowLayout(mode, value, s, count);
  const fmt = (v: number) => formatLength(v, precision);
  const why: Record<RowRefusal, string> = {
    count: `A row has 2 to ${MAX_ROW} parts.`,
    value: 'Enter a measurement.',
    'negative-gap': "The gap can't be negative: the copies would overlap.",
    'pitch-short': `The pitch must be at least the part's ${fmt(s)}: the copies would overlap.`,
    'no-room': `Not enough room: ${count} parts need ${fmt(count * s)}, the span is ${fmt(value)}.`,
  };
  // rowLayout checks the count first, so this is exactly "the count is refused".
  const countRefused = !layout.ok && layout.reason === 'count';
  const summary = layout.ok
    ? `${count} in the row: ${count - 1} ${count - 1 === 1 ? 'copy' : 'copies'}, gap ${fmt(layout.gap)}, row ${fmt(layout.length)} long`
    : why[layout.reason];

  return (
    <fieldset className="copy-row">
      <legend>Copy in a row</legend>
      <div className="field">
        <label htmlFor="row-count">Count</label>
        <input id="row-count" type="number" min={2} max={MAX_ROW} step={1}
          className={countRefused ? 'input invalid' : 'input'} aria-invalid={countRefused ? 'true' : 'false'}
          value={countText} onChange={(e) => setCountText(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="row-dir">Direction</label>
        <select id="row-dir" className="input" value={dir} onChange={(e) => setDir(Number(e.target.value))}>
          {DIRECTIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
        </select>
      </div>
      <div className="copy-row-modes" role="radiogroup" aria-label="Spacing">
        {(['gap', 'pitch', 'fit'] as const).map((m) => (
          <label key={m}>
            <input type="radio" name="row-mode" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'gap' ? 'Gap' : m === 'pitch' ? 'Pitch' : 'Fit across'}
          </label>
        ))}
      </div>
      {/* Keyed on the mode so switching modes shows that mode's value, not the
          last field's draft (invariant 5's resync, by remount). The remount
          also clears a refusal, which reports false through onErrorChange.
          commitUnchanged: Pitch's and Across's shown value is a default that
          follows the direction until the person types; typing a value equal
          to the default must still pin it. */}
      <DimensionField key={mode} label={FIELD_LABEL[mode]} precision={precision} value={value}
        min={mode === 'gap' ? 0 : undefined} commitUnchanged onErrorChange={setFieldRefused}
        onCommit={(v) => setTyped((t) => ({ ...t, [mode]: v }))} />
      <p className={layout.ok ? 'copy-row-summary' : 'copy-row-summary invalid'} role="status">{summary}</p>
      <div className="row">
        <button disabled={!layout.ok || fieldRefused}
          onClick={() => { if (layout.ok && !fieldRefused) { copyInRow(selectedIds, count, axis, sign, layout.step); setOpen(false); } }}>
          Apply
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </fieldset>
  );
}
