import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../store/store';
import {
  archCurve, archFields, bowCurve, curveAs, curveKindChoice, bowFields, cornerCurve, cornerFields, curveFaults, defaultArch,
  defaultBow, defaultCorner, defaultCorners, defaultNotch, deriveCurveKind, profileFields, uvDims,
} from '../document/document';
import type { Board, CurveCut, CurveKindChoice, CutFrom, Dimension } from '../document/document';
import { curveFaultText, curveLine } from '../document/curveText';
import { endWord } from '../document/holeText';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';
import { Popover } from './Popover';
import { holeRefusal, refusalFor } from './curveRefusal';
import type { Control, Draft } from './curveRefusal';

const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const cap = (d: string) => d[0]!.toUpperCase() + d.slice(1);

/** The in-face dimension of `through` that is not `d`. */
const otherDim = (through: Dimension, d: Dimension): Dimension => uvDims(through).find((x) => x !== d)!;

/** The Kind select's options (fu 367); "Rounded corners" is four curves, a menu item only. */
const KIND_OPTIONS: { value: CurveKindChoice; label: string }[] = [
  { value: 'arch', label: 'Arch' }, { value: 'notch', label: 'Half-round notch' }, { value: 'bow', label: 'Bow' }, { value: 'corner', label: 'Rounded corner' },
];

/** A Through change keeps `along` unless it is the new through, which takes the old through's place. */
const reseat = (along: Dimension, from: Dimension, to: Dimension): Dimension => (along === to ? from : along);

function CurveRowView({ board, curve }: { board: Board; curve: CurveCut }) {
  const units = useStore((s) => s.doc.units);
  const updateCurve = useStore((s) => s.updateCurve);
  const removeCurve = useStore((s) => s.removeCurve);
  const [error, setError] = useState<string | null>(null);
  const f = (n: number) => formatLength(n, units);
  const line = curveLine(board, curve, units);
  const stored = curveFaults(board, curve);
  /** Tries the edit: the refusal text when it is refused (nothing stored), else null. */
  const attempt = (next: Draft, control: Control | null): string | null => {
    const refused = refusalFor(board, curve, next, control);
    if (refused) return refused;
    setError(null);
    updateCurve(board.id, curve.id, next);
    return null;
  };
  // Holes chunk 1 R7: a typed field owns its refusal (DimensionField shows the returned text as ITS error, keeps the
  // text and focus). A select shows its refusal on the row (it stays on the stored value).
  const field = (next: Draft, control: Control): string | undefined => attempt(next, control) ?? undefined;
  const set = (next: Draft) => { const r = attempt(next, null); if (r) setError(r); };

  const arch = archFields(curve);
  const bow = arch ? null : bowFields(curve);
  const corner = arch || bow ? null : cornerFields(curve);
  const kind = deriveCurveKind(curve);
  // fu 367: a kind change keeps the curve's placement and id and takes the new kind's preset sizes (`curveAs`). An option
  // whose result would be refused is disabled and its label says why (presets minors 2: the refusal's own words, up to its
  // dash); the change still goes through `set`, so a stale list refuses in the row's own words and the select stays on the
  // stored kind. Presets minors 1: the options are judged only while the select has FOCUS — never on a plain render, which
  // every edit frame (a resize drag included) is — and re-judged when the curve or part changes under the focused select.
  const choice = curveKindChoice(curve);
  // A Rounded corner is a corner row only through the thickness; through the length or width it is a Roundover (Profiles).
  const kindOptions = KIND_OPTIONS.filter((o) => o.value !== 'corner' || curve.through === 'thickness');
  const [kindFocused, setKindFocused] = useState(false);
  const [judged, setJudged] = useState<{ curve: CurveCut; board: Board; reasons: Partial<Record<CurveKindChoice, string>> } | null>(null);
  useEffect(() => {
    if (!kindFocused || !choice || (judged && judged.curve === curve && judged.board === board)) return;
    const reasons: Partial<Record<CurveKindChoice, string>> = {};
    for (const o of kindOptions) {
      if (o.value === choice) continue;
      const next = curveAs(o.value, curve, board);
      const refused = next ? refusalFor(board, curve, next, null) : 'No room for it on this part';
      if (refused) reasons[o.value] = refused.split(' — ')[0]!.replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, '');
    }
    setJudged({ curve, board, reasons });
  }, [kindFocused, choice, curve, board, judged]);
  const reasons = kindFocused && judged && judged.curve === curve && judged.board === board ? judged.reasons : {};
  const kindSelect = choice && (
    <div className="field">
      <label htmlFor={`curve-kind-${curve.id}`}>Kind</label>
      <select id={`curve-kind-${curve.id}`} className="input" value={choice}
        onFocus={() => setKindFocused(true)} onBlur={() => { setKindFocused(false); setJudged(null); }}
        onChange={(e) => {
          const next = curveAs(e.target.value as CurveKindChoice, curve, board);
          if (next) set(next);
        }}>
        {kindOptions.map((o) => {
          const why = reasons[o.value];
          return <option key={o.value} value={o.value} disabled={why !== undefined}>{why ? `${o.label} — ${why}` : o.label}</option>;
        })}
      </select>
    </div>
  );
  const label = arch ? (arch.rise === arch.span / 2 ? 'Half-round notch' : 'Arch') : bow ? 'Bow' : corner ? 'Rounded corner' : 'Curve cut';

  const throughSelect = (onThrough: (to: Dimension) => void) => (
    <div className="field">
      <label htmlFor={`curve-through-${curve.id}`}>Through</label>
      <select id={`curve-through-${curve.id}`} className="input" value={curve.through} onChange={(e) => onThrough(e.target.value as Dimension)}>
        {DIMS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
      </select>
    </div>
  );
  const sideSelect = (edge: Dimension, value: CutFrom, onSide: (side: CutFrom) => void) => (
    <div className="field">
      <label htmlFor={`curve-side-${curve.id}`}>Side</label>
      <select id={`curve-side-${curve.id}`} className="input" value={value} onChange={(e) => onSide(e.target.value as CutFrom)}>
        {(['min', 'max'] as const).map((s) => <option key={s} value={s}>{`${cap(edge)} ${s} ${endWord(edge)}`}</option>)}
      </select>
    </div>
  );

  let fields: ReactNode = null;
  let note: string | null = null;
  if (arch) {
    const edge = otherDim(curve.through, arch.along);
    fields = (
      <div className="field-grid field-grid-2">
        {kindSelect}
        {throughSelect((to) => set(archCurve({ ...arch, through: to, along: reseat(arch.along, curve.through, to) })))}
        {sideSelect(edge, arch.side, (side) => set(archCurve({ ...arch, side })))}
        <div className="field">
          <label htmlFor={`curve-from-${curve.id}`}>From</label>
          <select id={`curve-from-${curve.id}`} className="input" value={arch.from} onChange={(e) => set(archCurve({ ...arch, from: e.target.value as CutFrom }))}>
            {(['min', 'max'] as const).map((s) => <option key={s} value={s}>{`${cap(arch.along)} ${s} ${endWord(arch.along)}`}</option>)}
          </select>
        </div>
        <DimensionField label="Start" value={arch.start} min={0} units={units} onCommit={(start) => field(archCurve({ ...arch, start }), 'Start')} />
        <DimensionField label="Span" value={arch.span} units={units} onCommit={(span) => field(archCurve({ ...arch, span }), 'Span')} />
        {/* An arc past a half circle is refused in refusalFor's own words, not the field's "Must be at most". */}
        <DimensionField label="Rise" value={arch.rise} units={units} onCommit={(rise) => field(archCurve({ ...arch, rise }), 'Rise')} />
      </div>
    );
  } else if (bow) {
    // P2: every Bow edit writes it at the CURRENT edge length (a resize never stretches it; an edit refits it).
    const refit = (b: typeof bow) => bowCurve({ ...b, span: board[b.along] });
    const edge = otherDim(curve.through, bow.along);
    // The bench line's own test (curveText.ts), so the note and the line's "over …" agree.
    if (Math.abs(bow.span - board[bow.along]) > 1e-9) note = `Spans ${f(bow.span)} of this ${f(board[bow.along])} ${bow.along} — change the Rise to refit it.`;
    fields = (
      <div className="field-grid field-grid-2">
        {kindSelect}
        {throughSelect((to) => set(refit({ ...bow, through: to, along: reseat(bow.along, curve.through, to) })))}
        {sideSelect(edge, bow.side, (side) => set(refit({ ...bow, side })))}
        <DimensionField label="Rise" value={bow.rise} units={units} onCommit={(rise) => field(refit({ ...bow, rise }), 'Rise')} />
      </div>
    );
  } else if (corner) {
    const [u, v] = uvDims(curve.through);
    fields = (
      <div className="field-grid field-grid-2">
        {kindSelect}
        <div className="field field-wide">
          <label htmlFor={`curve-corner-${curve.id}`}>Corner</label>
          <select id={`curve-corner-${curve.id}`} className="input" value={`${corner.uFrom}|${corner.vFrom}`} onChange={(e) => {
            const [uFrom, vFrom] = e.target.value.split('|') as [CutFrom, CutFrom];
            set(cornerCurve({ ...corner, uFrom, vFrom }));
          }}>
            {(['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => (
              <option key={`${uf}|${vf}`} value={`${uf}|${vf}`}>{`${cap(u)} ${uf} ${endWord(u)} / ${v} ${vf} ${endWord(v)}`}</option>
            )))}
          </select>
        </div>
        <DimensionField label="Radius" value={corner.radius} units={units} onCommit={(radius) => field(cornerCurve({ ...corner, radius }), 'Radius')} />
      </div>
    );
  }
  return (
    <div className="cut" data-kind={kind ?? 'curve'}>
      <div className="cut-head">
        <span className="cut-label curve-label">{label}</span>
        <button className="cut-remove" aria-label={`Remove curve (${line})`} onClick={() => removeCurve(board.id, curve.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {note && <p className="field-note">{note}</p>}
      {stored.length > 0 && <p className="field-note" role="status">{cap(curveFaultText(stored[0]!))} at this size.</p>}
      {fields}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Curves section (curves spec §8): one row per stored curve, and + Add curve ▾. */
export function Curves({ board }: { board: Board }) {
  const addCurves = useStore((s) => s.addCurves);
  const units = useStore((s) => s.doc.units);
  // A preset whose default would fault on this part — a curve fault, or a hole it would put into the waste — is
  // withheld, not added and refused (the AngleCuts/Holes precedent).
  const fits = (cs: Draft[] | null): cs is Draft[] => {
    if (!cs) return false;
    if (cs.some((c) => curveFaults(board, c).length > 0)) return false;
    const after: Board = { ...board, curves: [...board.curves, ...cs.map((c, i) => ({ ...c, id: `__preset${i}` }))] };
    return holeRefusal(board, after) === null;
  };
  const shown = board.curves.filter((c) => !profileFields(c));
  const one = (c: Draft | null) => (c ? [c] : null);
  const arch = one(defaultArch(board));
  const notch = one(defaultNotch(board));
  const bow = one(defaultBow(board));
  const corner = one(defaultCorner(board));
  const corners = defaultCorners(board);
  const items = [
    ...(fits(arch) ? [{ label: 'Arch', detail: 'An arch along the width min side', run: () => addCurves(board.id, arch) }] : []),
    ...(fits(notch) ? [{ label: 'Half-round notch', detail: `A half circle ${formatLength(2, units)} wide, centred`, run: () => addCurves(board.id, notch) }] : []),
    ...(fits(bow) ? [{ label: 'Bow', detail: 'The whole width min side bowed', run: () => addCurves(board.id, bow) }] : []),
    ...(fits(corner) ? [{ label: 'Rounded corner', detail: 'One corner', run: () => addCurves(board.id, corner) }] : []),
    ...(fits(corners) ? [{ label: 'Rounded corners', detail: 'All four corners', run: () => addCurves(board.id, corners) }] : []),
  ];
  return (
    <>
      <h3>Curves{shown.length > 0 && <span className="h3-count"> · {shown.length}</span>}</h3>
      {shown.map((c) => <CurveRowView key={c.id} board={board} curve={c} />)}
      {items.length > 0
        ? <Popover className="add-curve" label={<>+ Add curve<span aria-hidden="true"> ▾</span></>} title="Add a curve" items={items} />
        : <p className="field-note">No curve preset fits this part.</p>}
    </>
  );
}
