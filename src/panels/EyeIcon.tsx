/** An eye, or a struck-through eye. Inline because the app has no icon set. Shared by the parts and guides lists. */
export function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {hidden && <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}
