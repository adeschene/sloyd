import type { Board } from './types';

/**
 * A trailing " (n)" disambiguation suffix, e.g. "Leg (2)". The stem is
 * captured lazily so "Leg (1) (2)" yields "Leg (1)" — only the last suffix
 * is a disambiguator; any earlier one was typed by the user.
 */
const SUFFIX_RE = /^(.*?)\s\((\d+)\)$/;

/**
 * A board name that no other board is using, disambiguated with " (n)" if
 * needed. `excludeId` is the board being renamed, so it does not collide
 * with itself.
 *
 * Precondition: `base` is non-empty after trimming. Both call sites
 * guarantee it — the name field reverts an emptied value before committing,
 * and validateBoard trims and substitutes 'Board' for a blank (including
 * whitespace-only) name on load.
 */
export function uniqueName(base: string, boards: Board[], excludeId?: string): string {
  const wanted = base.trim();
  const taken = new Set(
    boards.filter((b) => b.id !== excludeId).map((b) => b.name),
  );

  // Free as typed — including a name that already ends in " (n)". The user
  // asked for it, so it is not ours to rewrite.
  if (!taken.has(wanted)) return wanted;

  // Taken: search from the stem, so duplicating "Leg (1)" gives "Leg (2)"
  // rather than "Leg (1) (1)".
  const stem = SUFFIX_RE.exec(wanted)?.[1] ?? wanted;
  let n = 1;
  while (taken.has(`${stem} (${n})`)) n += 1;
  return `${stem} (${n})`;
}

/**
 * Resolve duplicate names across a whole list, in order — the first board
 * with a given name keeps it and later ones are disambiguated. Returns a new
 * array; the input is untouched.
 *
 * This is the load-time half of the uniqueness invariant. It cannot live in
 * validateBoard, which sees one board at a time and cannot know its siblings.
 */
export function dedupeNames(boards: Board[]): Board[] {
  const out: Board[] = [];
  for (const board of boards) {
    // Only the boards already placed are candidates for collision, so no
    // exclusion is needed: `board` itself is never in `out` yet.
    out.push({ ...board, name: uniqueName(board.name, out) });
  }
  return out;
}
