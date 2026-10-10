/** Anything that carries a sibling-unique name: a part or an assembly. */
export interface Named { id: string; name: string }

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
 * Since the assemblies round, the items are one container's parts AND
 * assemblies together (invariant 8, restated: unique among siblings).
 *
 * Precondition: `base` is non-empty after trimming. Both call sites
 * guarantee it — the name field reverts an emptied value before committing,
 * and validateBoard trims and substitutes 'Board' for a blank (including
 * whitespace-only) name on load.
 */
export function uniqueName(base: string, items: readonly Named[], excludeId?: string): string {
  const wanted = base.trim();
  const taken = new Set(
    items.filter((b) => b.id !== excludeId).map((b) => b.name),
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
export function dedupeNames<T extends Named>(items: readonly T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    // Only the items already placed are candidates for collision, so no
    // exclusion is needed: `item` itself is never in `out` yet.
    out.push({ ...item, name: uniqueName(item.name, out) });
  }
  return out;
}

/**
 * A PROJECT name for a project derived from another: Refine's " — refined", joinery's " — joined",
 * repair's " — repaired", Duplicate's " copy" (follow-up 237). A name already ending in the same
 * suffix is counted instead of stacked — "Box — refined" → "Box — refined 2" → "… 3" — from the
 * source's name alone, never the library (project names are not unique; see `duplicateProject`).
 * A different suffix underneath stacks: "Box — joined — refined" keeps the history. Only a count
 * of 2 or more without a leading zero is ours; "— refined 1" was typed and gets a fresh suffix.
 */
export function derivedName(name: string, suffix: string): string {
  if (name.endsWith(suffix)) return `${name} 2`;
  const m = / ([2-9]|[1-9]\d+)$/.exec(name);
  if (m && name.slice(0, m.index).endsWith(suffix)) return `${name.slice(0, m.index)} ${Number(m[1]) + 1}`;
  return `${name}${suffix}`;
}
