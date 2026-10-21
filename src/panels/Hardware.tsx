import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { HARDWARE_COUNT_MAX } from '../document/hardwareModel';
import { holderHardware, holderPlacements } from '../document/hardware';
import type { HardwareTarget } from '../document/hardware';
import type { HardwareUse } from '../document/types';
import { CountField } from './CountField';
import { EditLock } from './EditLock';
import { Popover } from './Popover';
import type { PopoverItem } from './Popover';

const NONE: readonly HardwareUse[] = [];

/** The Hardware section (hardware spec §5.1): while the holder has none, only `+ Add hardware ▾`; once it has any, a row
 *  per entry (the type's name, a count 1..999, Remove) then the same menu. Every write is `setHardware` (one undo entry,
 *  on the Shape / Definition as the store decides). Selectors return stored arrays and numbers only (inv 43). Wraps itself
 *  in `EditLock` (inv 47), so the empty-state use needs no caller wrapper. */
export function Hardware({ target, heading, onNewHardwareType }: { target: HardwareTarget; heading: string; onNewHardwareType: () => void }) {
  const entries = useStore((s) => { const h = holderHardware(s.doc, target); return h.length === 0 ? NONE : h; });
  const types = useStore((s) => s.doc.hardwareTypes);
  const places = useStore((s) => holderPlacements(s.doc, target));
  const setHardware = useStore((s) => s.setHardware);
  const inputs = useRef(new Map<string, HTMLInputElement | null>());
  const pending = useRef<string | null>(null);
  // A freshly added row: focus its count once it has rendered.
  useEffect(() => {
    if (pending.current === null) return;
    const el = inputs.current.get(pending.current);
    if (el) { el.focus(); pending.current = null; }
  });
  const menu = (): PopoverItem[] => [
    ...types.map((t) => {
      const had = entries.some((u) => u.type === t.id);
      return {
        label: t.name, detail: had ? 'Already added' : undefined, disabled: had, title: had ? 'Already added' : undefined,
        run: () => { pending.current = t.id; setHardware(target, t.id, 1); },
      };
    }),
    { label: 'New hardware type…', run: onNewHardwareType },
  ];
  const total = entries.reduce((s, u) => s + u.count, 0) * places;
  return (
    <EditLock>
      <h3>{heading}</h3>
      {entries.map((u) => {
        const name = types.find((t) => t.id === u.type)?.name ?? u.type;
        return (
          <div className="row hardware-row" key={u.type}>
            <CountField ref={(el) => { inputs.current.set(u.type, el); }} label={name} value={u.count} max={HARDWARE_COUNT_MAX}
              invalid="Enter a whole number, 1 to 999" onCommit={(n) => { setHardware(target, u.type, n); }} />
            <button onClick={() => setHardware(target, u.type, null)}>Remove</button>
          </div>
        );
      })}
      {entries.length > 0 && places >= 2 && <p className="field-note">Counted once per copy: {total} in all.</p>}
      <Popover className="add-hardware" label={<>+ Add hardware<span aria-hidden="true"> ▾</span></>} title="Add hardware" items={menu} />
    </EditLock>
  );
}
