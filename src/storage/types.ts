import type { SloydDocument } from '../document/document';

export interface RecentEntry {
  id: string;
  name: string;
  savedAt: number;
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

  /** Persist the working document. Callers debounce; this must never throw. */
  autoSave(doc: SloydDocument): Promise<void>;
  /** Restore the working document, or null if there is none or it is unusable. */
  loadAutoSaved(): Promise<SloydDocument | null>;
  /** "Save as" — writes the project out. May prompt the user. */
  exportProject(doc: SloydDocument): Promise<void>;
  /** "Open" — prompts and resolves with the chosen project. Rejects on cancel. */
  importProject(): Promise<SloydDocument>;
  /** Recently opened projects. Returns [] where unsupported. */
  listRecent(): Promise<RecentEntry[]>;
}
