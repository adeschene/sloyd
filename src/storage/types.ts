import type { SloydDocument } from '../document/document';

export interface RecentEntry {
  id: string;
  name: string;
  savedAt: number;
}

/** One row in the project library. Index metadata, never document data. */
export interface ProjectEntry {
  id: string;
  /** Mirrors doc.name so the list renders without parsing every project. */
  name: string;
  savedAt: number;
  createdAt: number;
}

/**
 * The library index. `layout` versions the ARRANGEMENT OF KEYS, which is a
 * different thing from a document's `version` and must never be compared
 * against CURRENT_VERSION — they change for unrelated reasons.
 */
export interface LibraryIndex {
  layout: number;
  activeId: string;
  projects: ProjectEntry[];
}

export interface StorageCapabilities {
  /** Can the platform offer a recent-files menu? */
  recentFiles: boolean;
  /** Does the platform expose real filesystem paths? */
  realPaths: boolean;
}

/**
 * The single seam between Sloyd and any platform's persistence. Nothing else
 * in the app may touch localStorage, build a download link, or open a file
 * picker. A desktop build is a second implementation of this interface.
 */
export interface StorageAdapter {
  /** True while persistence is working. Goes false on quota/unavailability. */
  readonly available: boolean;
  readonly capabilities: StorageCapabilities;

  /**
   * Persist one project. Callers debounce; this must never throw (inv 7).
   *
   * The id is an EXPLICIT ARGUMENT, not adapter state, and that is what
   * closes the switch race: a debounce armed while project A was open would
   * otherwise fire after a switch and write A's document into B's slot —
   * silent data loss, invisible in any screenshot. Do not "simplify" this
   * back to a remembered active id.
   */
  autoSave(id: string, doc: SloydDocument): Promise<void>;
  /** Boot: read the library, adopting the legacy autosave slot on first run. */
  openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }>;
  /** One project's document, or null if its key is missing or unusable. */
  loadProject(id: string): Promise<SloydDocument | null>;
  /** Every project, most recently saved first. */
  listProjects(): Promise<ProjectEntry[]>;
  /** Store a new project and return its id, or null if the write failed. */
  createProject(doc: SloydDocument): Promise<string | null>;
  /** Copy a project under a new id, suffixed "copy". Null if id is unknown. */
  duplicateProject(id: string): Promise<string | null>;
  /** Delete a project and resolve with what should now be open. */
  deleteProject(id: string): Promise<{ activeId: string; doc: SloydDocument }>;
  /** Record which project is open, so the next boot returns to it. */
  setActiveProject(id: string): Promise<void>;
  /** "Save as" — writes the project out. May prompt the user. */
  exportProject(doc: SloydDocument): Promise<void>;
  /** "Open" — prompts and resolves with the chosen project. Rejects on cancel. */
  importProject(): Promise<SloydDocument>;
  /** Recently opened projects. Returns [] where unsupported. */
  listRecent(): Promise<RecentEntry[]>;
}
