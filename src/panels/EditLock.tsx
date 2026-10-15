import type { ReactNode } from 'react';
import { useStore } from '../store/store';
import { EXPLODED_TITLE } from './ViewportControls';

/**
 * The exploded view's edit lock (invariant 47): a `<fieldset class="edit-lock" disabled>`, `display: contents`, around
 * controls that change the document. Placed around the EDITING regions only (fu 262), so a view-only control beside them
 * — a Select, Hide others, the guides footer's disclosure — stays live while exploded.
 */
export function EditLock({ children }: { children: ReactNode }) {
  const exploded = useStore((s) => s.explode > 0);
  return (
    <fieldset className="edit-lock" disabled={exploded} title={exploded ? EXPLODED_TITLE : undefined}>
      {children}
    </fieldset>
  );
}
