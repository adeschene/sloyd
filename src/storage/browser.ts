import { DocumentError, createDocument, migrateDocument, nextId } from '../document/document';
import type { SloydDocument } from '../document/document';
import type { LibraryIndex } from './types';
import type { RecentEntry, StorageAdapter, StorageCapabilities } from './types';
import { LAYOUT_VERSION, parseIndex, sortEntries } from './libraryIndex';

export const AUTOSAVE_KEY = 'sloyd.autosave.v1';
export const LIBRARY_KEY = 'sloyd.library.v1';
export const PROJECT_PREFIX = 'sloyd.project.';

export class BrowserStorageAdapter implements StorageAdapter {
  private store: Storage | null;
  private _available = true;
  private now: () => number;

  constructor(store: Storage | null = safeLocalStorage(), now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
    if (!store) this._available = false;
  }

  get available(): boolean {
    return this._available;
  }

  get capabilities(): StorageCapabilities {
    return { recentFiles: false, realPaths: false };
  }

  async autoSave(doc: SloydDocument): Promise<void> {
    if (!this.store) {
      this._available = false;
      return;
    }
    try {
      this.store.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
      this._available = true;
    } catch {
      // Quota exceeded, or private browsing. Never throw from an autosave —
      // the UI surfaces `available === false` as a banner instead.
      this._available = false;
    }
  }

  async loadAutoSaved(): Promise<SloydDocument | null> {
    if (!this.store) return null;
    let raw: string | null;
    try {
      raw = this.store.getItem(AUTOSAVE_KEY);
    } catch {
      this._available = false;
      return null;
    }
    if (!raw) return null;
    try {
      return migrateDocument(JSON.parse(raw));
    } catch {
      // Corrupt or foreign autosave: start clean rather than block the app.
      return null;
    }
  }

  /**
   * The boot path. Reads the library, adopting the legacy single autosave
   * slot the first time. Never throws: a failure here degrades to the
   * pre-library app rather than to an empty one.
   */
  async openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const legacy = (await this.loadAutoSaved()) ?? createDocument();

    if (!this.store) return { activeId: '', doc: legacy, libraryAvailable: false };

    const existing = parseIndex(readJSON(this.store, LIBRARY_KEY));
    if (existing && existing.projects.length > 0) {
      const activeId = existing.projects.some((p) => p.id === existing.activeId)
        ? existing.activeId
        : sortEntries(existing.projects)[0].id;
      const doc = await this.loadProject(activeId);
      if (doc) return { activeId, doc, libraryAvailable: true };
      // The index names a project whose key is gone. Fall through and adopt,
      // which is the same recovery as a first boot.
    }

    return this.adopt(legacy);
  }

  /**
   * Write new, verify, THEN commit the index. Never overwrite in place, and
   * NEVER delete AUTOSAVE_KEY — it costs a few KB and it is the entire
   * rollback story for this round. Nothing writes to it after this point.
   */
  private async adopt(doc: SloydDocument): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const id = nextId();
    const at = this.now();
    try {
      this.store!.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
      // Verify the round-trip before committing the index to it.
      if (!this.store!.getItem(PROJECT_PREFIX + id)) throw new Error('project did not persist');
      const index: LibraryIndex = {
        layout: LAYOUT_VERSION,
        activeId: id,
        projects: [{ id, name: doc.name, savedAt: at, createdAt: at }],
      };
      this.store!.setItem(LIBRARY_KEY, JSON.stringify(index));
      this._available = true;
      return { activeId: id, doc, libraryAvailable: true };
    } catch {
      this._available = false;
      // Adoption is retried on the next boot: the absent index is the only
      // thing that triggers it, so nothing has to remember this failed.
      return { activeId: '', doc, libraryAvailable: false };
    }
  }

  async loadProject(id: string): Promise<SloydDocument | null> {
    if (!this.store || !id) return null;
    const raw = readJSON(this.store, PROJECT_PREFIX + id);
    if (raw === null) return null;
    try {
      return migrateDocument(raw);
    } catch {
      return null;
    }
  }

  /** Validate a project file's text. Throws DocumentError with a reason. */
  parseProjectFile(text: string): SloydDocument {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new DocumentError('That file is not a valid Sloyd project file.');
    }
    return migrateDocument(parsed);
  }

  async exportProject(doc: SloydDocument): Promise<void> {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(doc.name)}.sloyd`;
    window.document.body.appendChild(a);
    try {
      a.click();
    } finally {
      // Always clean up, even if click() throws (sandboxed iframe, CSP, etc.) —
      // otherwise the anchor stays in the DOM and the blob URL leaks.
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  async importProject(): Promise<SloydDocument> {
    return new Promise((resolve, reject) => {
      const input = window.document.createElement('input');
      input.type = 'file';
      input.accept = '.sloyd,application/json';

      let settled = false;
      let focusTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        input.removeEventListener('change', onChange);
        input.removeEventListener('cancel', onCancel);
        window.removeEventListener('focus', onFocus);
        if (focusTimer !== undefined) clearTimeout(focusTimer);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const rejectCancelled = () =>
        settle(() => reject(new DocumentError('File selection was cancelled.', { cancelled: true })));

      const onChange = async () => {
        // The window regains focus as soon as the native picker dialog
        // closes, which fires before `change` when the OS delivers focus
        // eagerly. If the focus-fallback timer below is still pending when
        // that happens, it can fire mid-await (file.text() can take a
        // while) and reject with a cancellation error that FileMenu
        // silently swallows — the user picked a real file and the app does
        // nothing. Clear the timer the instant we know a selection is
        // actually being processed.
        if (focusTimer !== undefined) {
          clearTimeout(focusTimer);
          focusTimer = undefined;
        }
        const file = input.files?.[0];
        if (!file) {
          rejectCancelled();
          return;
        }
        try {
          const parsed = this.parseProjectFile(await file.text());
          settle(() => resolve(parsed));
        } catch (err) {
          settle(() => reject(err));
        }
      };

      const onCancel = () => {
        rejectCancelled();
      };

      const onFocus = () => {
        // Not all browsers fire `cancel` on picker dismissal. As a fallback,
        // if focus returns to the window and neither `change` nor `cancel`
        // has fired shortly after, assume the picker was dismissed with no
        // selection and settle so callers never hang.
        focusTimer = setTimeout(rejectCancelled, 300);
      };

      input.addEventListener('change', onChange);
      input.addEventListener('cancel', onCancel);
      window.addEventListener('focus', onFocus);

      input.click();
    });
  }

  async listRecent(): Promise<RecentEntry[]> {
    return [];
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Accessing localStorage throws outright in some privacy modes.
    return null;
  }
}

/** Read and JSON.parse a key. Null for absent, unreadable or corrupt. */
function readJSON(store: Storage, key: string): unknown {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-');
  return cleaned || 'sloyd-project';
}

export const storage: StorageAdapter = new BrowserStorageAdapter();
