import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';

export interface PopoverItem {
  label: string;
  /** A second, quieter line under the label. Not part of the accessible name. */
  detail?: string;
  run: () => void;
}

interface Props {
  label: ReactNode;
  items: PopoverItem[];
  title?: string;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * A disclosure menu: a trigger and a popup of plain buttons (ui-polish spec §3.1).
 * Deliberately not an ARIA menu, like ProjectMenu, and closed by the same rules:
 * Escape on its own subtree (never a window keydown listener — invariant 27),
 * an outside pointerdown on window only while open, focus leaving it, or an item
 * being chosen. ProjectMenu keeps its own copy of these rules on purpose (its
 * arm/disarm focus handling is its own; CLAUDE.md "ProjectMenu.tsx").
 *
 * Choosing an item focuses the trigger BEFORE running it: an item that opens a
 * dialog has App record `document.activeElement` as the place to return focus,
 * and the item itself is about to unmount.
 */
export function Popover({ label, items, title, align = 'start', className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        trigger.current?.focus();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const el = root.current;
    el?.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      el?.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const onFocusOut = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !root.current?.contains(next)) setOpen(false);
  }, []);

  return (
    <div className={className ? `popover ${className}` : 'popover'} ref={root} onBlur={onFocusOut}>
      <button ref={trigger} className="popover-trigger" aria-expanded={open} title={title}
        onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`popover-popup popover-${align}`}>
          {items.map((it) => (
            <button key={it.label} className="popover-item" aria-label={it.label}
              onClick={() => { trigger.current?.focus(); setOpen(false); it.run(); }}>
              <span className="popover-item-label">{it.label}</span>
              {it.detail && <span className="popover-item-detail">{it.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
