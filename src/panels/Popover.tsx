import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';

export interface PopoverItem {
  label: string;
  /** A second, quieter line under the label. Not part of the accessible name. */
  detail?: string;
  run: () => void;
  /** Shown but not choosable (the exploded view's lock on an editing item, fu 262). */
  disabled?: boolean;
  /** The item's tooltip: why a disabled item cannot be chosen (edge banding spec §5.1). */
  title?: string;
}

interface Props {
  label: ReactNode;
  /** The items, or a function building them, called only while the popup is open (judged on open, never per render:
   *  fu 388's rule, edge banding spec §5.1). */
  items: PopoverItem[] | (() => PopoverItem[]);
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
 *
 * Follow-up 250 — browsers that do not focus a button on mousedown (Safari,
 * macOS Firefox): clicking the trigger focuses it explicitly, so a
 * mouse-opened popover still has focus inside it for Escape to reach; and
 * pressing an item there blurs the focused element with a NULL relatedTarget
 * before the click lands, so a null-relatedTarget focusout is ignored while a
 * pointer is down inside. With no pointer down it still closes. ProjectMenu
 * carries the same guard (ported, fu 250).
 */
export function Popover({ label, items, title, align = 'start', className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  /** A pointer is down inside the root (fu 250); cleared on release anywhere. */
  const pressing = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Opened by a click, the pointer is already up; opened by keyboard there
    // was none. Either way no press is in progress — clear a stale one left
    // by a press that was dragged off the closed trigger.
    pressing.current = false;
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
    const onUp = () => { pressing.current = false; };
    const el = root.current;
    el?.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el?.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [open]);

  const onFocusOut = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next && pressing.current) return;
    if (!next || !root.current?.contains(next)) setOpen(false);
  }, []);

  return (
    <div className={className ? `popover ${className}` : 'popover'} ref={root} onBlur={onFocusOut}
      onPointerDown={() => { pressing.current = true; }}>
      <button ref={trigger} className="popover-trigger" aria-expanded={open} title={title}
        onClick={() => { trigger.current?.focus(); setOpen((o) => !o); }}>
        {label}
      </button>
      {open && (
        <div className={`popover-popup popover-${align}`}>
          {(typeof items === 'function' ? items() : items).map((it) => (
            <button key={it.label} className="popover-item" aria-label={it.label} disabled={it.disabled} title={it.title}
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
