import type { Ref } from 'react';
import type { MaterialKind } from '../document/types';
import type { Row, DefDraft } from './materialsDraft';

export const KIND_TEXT: Record<MaterialKind, string> = {
  solid: 'Solid wood', 'sheet-veneered': 'Veneered sheet (plywood)', 'sheet-plain': 'Plain sheet (MDF, hardboard)',
};

/**
 * One custom material's definition fields (custom materials spec §4.1). A stored material's kind is shown, never
 * edited (a solid turned sheet would rewrite grains); only an unsaved new row gets `onKind` and so a kind select.
 * `name` is the row's STORED label, or "New material", so the fields' names do not change while typing.
 */
export function MaterialDefinition({ row, name, disabled, disabledTitle, onChange, onKind, nameRef }: {
  row: Row;
  name: string;
  disabled: boolean;
  disabledTitle?: string;
  onChange: (d: Partial<DefDraft>) => void;
  onKind?: (kind: MaterialKind) => void;
  nameRef?: Ref<HTMLInputElement>;
}) {
  const d = row.draft;
  return (
    <div className="material-definition">
      <label>Name
        <input className="input" ref={nameRef} aria-label={`${name}: name`} value={d.label} disabled={disabled} title={disabledTitle}
          onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>Colour
        <input type="color" aria-label={`${name}: colour`} value={d.color} disabled={disabled} title={disabledTitle}
          onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      {onKind ? (
        <label>Kind
          <select className="input" aria-label={`${name}: kind`} value={row.kind} disabled={disabled} title={disabledTitle}
            onChange={(e) => onKind(e.target.value as MaterialKind)}>
            {(Object.keys(KIND_TEXT) as MaterialKind[]).map((k) => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
          </select>
        </label>
      ) : (
        <span className="material-kind">{KIND_TEXT[row.kind]}</span>
      )}
      {row.kind !== 'solid' && (
        <>
          <label>Sheet length
            <input className="input" aria-label={`${name}: sheet length`} value={d.sheetLength} disabled={disabled} title={disabledTitle}
              onChange={(e) => onChange({ sheetLength: e.target.value })} />
          </label>
          <label>Sheet width
            <input className="input" aria-label={`${name}: sheet width`} value={d.sheetWidth} disabled={disabled} title={disabledTitle}
              onChange={(e) => onChange({ sheetWidth: e.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}
