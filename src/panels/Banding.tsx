import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { BAND_SIDES, bandFaultText, bandFaults, bandOn } from '../document/banding';
import type { BandType, Board, CornerRule, ProfileSide } from '../document/types';
import { endWord } from '../document/holeText';
import { Popover } from './Popover';
import type { PopoverItem } from './Popover';
import { bandEditRefusal, bandsShownCorner } from './bandingRefusal';

const MIXED = '__mixed';
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** Profiles' side words: `width min side`, `length max end`. */
const sideText = (s: ProfileSide) => `${s.across} ${s.from} ${endWord(s.across)}`;
const CORNER_LABEL: Record<CornerRule, string> = { long: 'Long edges run through', ends: 'Ends run through', mitre: 'Mitred' };
const MENU: readonly (readonly [string, readonly ProfileSide[]])[] = [
  ['all edges', BAND_SIDES], ['long edges', [BAND_SIDES[0]!, BAND_SIDES[1]!]], ['ends', [BAND_SIDES[2]!, BAND_SIDES[3]!]],
];

/** The value every part shares, else MIXED. */
const common = (values: readonly string[]) => (values.every((v) => v === values[0]) ? values[0]! : MIXED);
const sameParts = (a: readonly Board[], b: readonly Board[]) => a.length === b.length && a.every((p, i) => p === b[i]);

/** The fu 388 rule for one select: its options are judged ONLY while it has focus — every edit frame is a render — and
 *  afresh when a part or the band types change under it. Keyed on the parts themselves, never on the array (a caller's
 *  `[board]` is a new array every render). */
function useReasons(parts: readonly Board[], types: readonly BandType[], judge: () => Record<string, string>) {
  const [focused, setFocused] = useState(false);
  const [judged, setJudged] = useState<{ parts: readonly Board[]; types: readonly BandType[]; reasons: Record<string, string> } | null>(null);
  const fresh = !!judged && judged.types === types && sameParts(judged.parts, parts);
  useEffect(() => {
    if (!focused || fresh) return;
    setJudged({ parts, types, reasons: judge() });
  }, [focused, fresh]); // eslint-disable-line react-hooks/exhaustive-deps -- parts, types and judge are what `fresh` compares
  const reasons = focused && fresh ? judged!.reasons : {};
  return { reasons, focus: { onFocus: () => setFocused(true), onBlur: () => { setFocused(false); setJudged(null); } } };
}

function SideSelect({ parts, ids, side, types }: { parts: readonly Board[]; ids: string[]; side: ProfileSide; types: readonly BandType[] }) {
  const setBands = useStore((s) => s.setBands);
  const value = common(parts.map((p) => bandOn(p.bands, side)?.type ?? ''));
  const { reasons, focus } = useReasons(parts, types, () => {
    const out: Record<string, string> = {};
    for (const t of types) {
      if (t.id === value) continue;
      const r = bandEditRefusal(parts, types, [side], t.id);
      if (r) out[t.id] = r;
    }
    return out;
  });
  const id = `band-${side.across}-${side.from}`;
  return (
    <div className="field">
      <label htmlFor={id}>{cap(sideText(side))}</label>
      {/* A mixed select writes only on a CHANGE (inv 5): leaving it untouched writes nothing. */}
      <select id={id} className="input" value={value} {...focus}
        onChange={(e) => { const v = e.target.value; if (v !== MIXED) setBands(ids, [side], v === '' ? null : v); }}>
        {value === MIXED && <option value={MIXED} disabled>Mixed</option>}
        <option value="">None</option>
        {types.map((t) => (
          <option key={t.id} value={t.id} disabled={!!reasons[t.id]}>{reasons[t.id] ? `${t.name} — ${reasons[t.id]}` : t.name}</option>
        ))}
      </select>
    </div>
  );
}

/** The Banding section (edge banding spec §5.1): a select per side, `Band ▾`, the Corners select and each faulted band's
 *  note. For one part or a multi-selection of parts; the caller wraps it in its `EditLock` (inv 47). */
export function Banding({ boards }: { boards: readonly Board[] }) {
  const types = useStore((s) => s.doc.bandTypes);
  const setBands = useStore((s) => s.setBands);
  const updateBoards = useStore((s) => s.updateBoards);
  const ids = boards.map((b) => b.id);
  const corner = common(boards.map((b) => b.cornerRule));
  // Built only while the menu is open: Popover calls it on each of its renders while open, never while closed.
  const menu = (): PopoverItem[] => [
    ...types.flatMap((t) => MENU.map(([words, sides]) => {
      const refused = bandEditRefusal(boards, types, sides, t.id);
      return { label: `${t.name}: ${words}`, run: () => setBands(ids, sides, t.id), disabled: !!refused, title: refused ?? undefined };
    })),
    { label: 'Remove all bands', run: () => setBands(ids, BAND_SIDES, null) },
  ];
  const notes = boards.flatMap((b) => bandFaults(b, types).map((f) => ({
    key: `${b.id}:${f.side.across}-${f.side.from}:${f.kind}`,
    text: `${boards.length > 1 ? `${b.name} — ${sideText(f.side)}` : cap(sideText(f.side))}: ${bandFaultText(f.kind)}`,
  })));
  return (
    <>
      <h3>Banding</h3>
      <div className="field-grid field-grid-2">
        {BAND_SIDES.map((side) => <SideSelect key={`${side.across}-${side.from}`} parts={boards} ids={ids} side={side} types={types} />)}
        {bandsShownCorner(boards, types) && (
          <div className="field">
            <label htmlFor="band-corners">Corners</label>
            <select id="band-corners" className="input" value={corner}
              onChange={(e) => { const v = e.target.value; if (v !== MIXED) updateBoards(ids, { cornerRule: v as CornerRule }); }}>
              {corner === MIXED && <option value={MIXED} disabled>Mixed</option>}
              {(Object.keys(CORNER_LABEL) as CornerRule[]).map((r) => <option key={r} value={r}>{CORNER_LABEL[r]}</option>)}
            </select>
          </div>
        )}
      </div>
      {notes.map((n) => <p key={n.key} className="field-note">{n.text}</p>)}
      <Popover className="add-band" label={<>Band<span aria-hidden="true"> ▾</span></>} title="Band edges with a band type" items={menu} />
    </>
  );
}
