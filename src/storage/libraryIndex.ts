import type { LibraryIndex, ProjectEntry } from './types';

/**
 * Versions the ARRANGEMENT OF KEYS, not any document inside them. Separate
 * from CURRENT_VERSION on purpose: a .sloyd file written by this build is
 * byte-identical to one written before the library existed.
 */
export const LAYOUT_VERSION = 1;

function parseEntry(raw: unknown): ProjectEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;
  if (typeof e.name !== 'string') return null;
  // A bad timestamp costs sort position; dropping the project costs work.
  // Default it, the way units.precision and stock.kerf are defaulted.
  return {
    id: e.id,
    name: e.name,
    savedAt: typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? e.savedAt : 0,
    createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0,
  };
}

/**
 * Parse a raw index, or null if it is unusable as a whole. A MALFORMED ENTRY
 * IS DROPPED rather than refused — validateGuides' argument applies verbatim:
 * a saved library must always open, and a project row has no nearest-legal
 * value to clamp toward.
 */
export function parseIndex(raw: unknown): LibraryIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const i = raw as Record<string, unknown>;
  if (i.layout !== LAYOUT_VERSION) return null;
  if (!Array.isArray(i.projects)) return null;
  const projects = i.projects.map(parseEntry).filter((p): p is ProjectEntry => p !== null);
  return {
    layout: LAYOUT_VERSION,
    activeId: typeof i.activeId === 'string' ? i.activeId : '',
    projects,
  };
}

/** Most recently saved first; ties broken by newest created. Pure, copies. */
export function sortEntries(entries: ProjectEntry[]): ProjectEntry[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt || b.createdAt - a.createdAt);
}

/** Record a save against one project, adopting the document's current name. */
export function touchEntry(
  index: LibraryIndex,
  id: string,
  name: string,
  now: number,
): LibraryIndex {
  return {
    ...index,
    projects: index.projects.map((p) => (p.id === id ? { ...p, name, savedAt: now } : p)),
  };
}

/** Drop one project. Deliberately does NOT choose a new active id. */
export function removeEntry(index: LibraryIndex, id: string): LibraryIndex {
  return { ...index, projects: index.projects.filter((p) => p.id !== id) };
}
