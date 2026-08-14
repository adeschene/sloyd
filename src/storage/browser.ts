import { DocumentError, createDocument, migrateDocument, nextId } from '../document/document';
import type { SloydDocument } from '../document/document';
import type { LibraryIndex, ProjectEntry } from './types';
import type { RecentEntry, StorageAdapter, StorageCapabilities } from './types';
import { LAYOUT_VERSION, parseIndex, removeEntry, sortEntries, touchEntry } from './libraryIndex';

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

  async autoSave(id: string, doc: SloydDocument): Promise<void> {
    if (!this.store || !id) {
      this._available = false;
      return;
    }
    // Refuse rather than commit an empty index over one that is present but
    // unusable — matches openLibrary's own refuse-don't-clobber rule
    // (Finding 3). `available` only goes true once BOTH writes below
    // succeed — never unconditionally, which is what silently hid a failed
    // index commit behind a successful project write (Finding 1).
    const index = this.readIndexForWrite();
    if (!index) {
      this._available = false;
      return;
    }
    try {
      this.store.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
    } catch {
      // Quota exceeded, or private browsing. Never throw from an autosave —
      // the UI surfaces `available === false` as a banner instead.
      this._available = false;
      return;
    }
    const ok = this.writeIndex(touchEntry(index, id, doc.name, this.now()));
    if (ok) this._available = true;
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
   *
   * Adoption fires on exactly one condition: LIBRARY_KEY is ABSENT — tested
   * on the RAW `getItem` result, before any JSON.parse. A present-but-empty
   * string still counts as present: something wrote that key. A
   * present-but-unusable index (corrupt JSON, or a layout this build does
   * not recognise — in particular a NEWER one) must never be treated as an
   * absent one: doing so would silently clobber real project data with a
   * fresh single-entry index built from the stale legacy document. Refuse
   * instead, the same way the document layer refuses an unrecognised
   * `version` rather than guessing at it.
   */
  async openLibrary(): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const legacy = (await this.loadAutoSaved()) ?? createDocument();

    if (!this.store) return { activeId: '', doc: legacy, libraryAvailable: false };

    const rawLibrary = readRaw(this.store, LIBRARY_KEY);
    if (rawLibrary === null) {
      // The only route that adopts: the key is genuinely absent (or the
      // read itself failed, which this build treats the same way).
      return this.adopt(legacy);
    }

    // Present. Parse it through the same string->index path `readIndex`
    // uses, rather than going through readJSON, which collapses "present
    // but unparseable" into the same null as "absent" — exactly the
    // distinction this branch exists to preserve.
    const existing = this.parseIndexString(rawLibrary);
    if (!existing) {
      // Present but corrupt JSON, or a layout we don't understand. Do not
      // adopt over it — write nothing, degrade to a read-only legacy view.
      return { activeId: '', doc: legacy, libraryAvailable: false };
    }

    if (existing.projects.length === 0) {
      // Adoption already happened once (the index exists). Add a fresh
      // project rather than re-adopting the now-stale legacy document.
      return this.addUntitledProject(existing);
    }

    // Try the recorded active project first, then fall back to the most
    // recently saved loadable one. Never re-adopt here either.
    const ordered = [
      existing.activeId,
      ...sortEntries(existing.projects)
        .map((p) => p.id)
        .filter((id) => id !== existing.activeId),
    ];
    for (const id of ordered) {
      const doc = await this.loadProject(id);
      if (doc) return { activeId: id, doc, libraryAvailable: true };
    }

    // The index names projects but none of their keys are loadable. An
    // index exists, so adoption already happened and the legacy document is
    // stale by definition — the honest answer is the same as the
    // empty-projects case: add a fresh Untitled project, never re-adopt.
    return this.addUntitledProject(existing);
  }

  /**
   * Write a project's document and verify the round-trip before any caller
   * commits an index that points at it. THE single home for that ordering —
   * `adopt`, `addUntitledProject` and `createProject` all funnel through
   * here rather than each carrying their own copy. A safety rule written out
   * three times is a rule that holds in two places after the next edit
   * (R10). Throws rather than swallowing, so every caller shares one catch
   * block instead of re-deriving this order; callers must guarantee
   * `this.store` is non-null before calling.
   */
  private writeVerifiedProject(id: string, doc: SloydDocument): void {
    this.store!.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
    if (!this.store!.getItem(PROJECT_PREFIX + id)) throw new Error('project did not persist');
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
      this.writeVerifiedProject(id, doc);
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

  /**
   * Adds a fresh Untitled project to an already-existing index — NOT
   * necessarily empty: the "index names projects but none are loadable"
   * branch in `openLibrary` passes one with entries already in it.
   * Deliberately distinct from `adopt`: adoption has already happened once
   * by the time this runs, so the legacy key is stale and must not be
   * re-read. Same write-verify-then-commit shape as `adopt`, via
   * `writeVerifiedProject`.
   */
  private async addUntitledProject(
    index: LibraryIndex,
  ): Promise<{ activeId: string; doc: SloydDocument; libraryAvailable: boolean }> {
    const doc = createDocument();
    const id = nextId();
    const at = this.now();
    try {
      this.writeVerifiedProject(id, doc);
      const updated: LibraryIndex = {
        ...index,
        activeId: id,
        projects: [...index.projects, { id, name: doc.name, savedAt: at, createdAt: at }],
      };
      this.store!.setItem(LIBRARY_KEY, JSON.stringify(updated));
      this._available = true;
      return { activeId: id, doc, libraryAvailable: true };
    } catch {
      this._available = false;
      return { activeId: '', doc, libraryAvailable: false };
    }
  }

  /** Parse a raw string into a usable index, or null. The one place a raw
   * LIBRARY_KEY string becomes a `LibraryIndex` — `openLibrary` (which needs
   * to tell "absent" apart from "present but unparseable") and `readIndex`
   * (which doesn't care which, and defaults either way) both call this
   * rather than each re-deriving the JSON.parse + parseIndex pair (R1). */
  private parseIndexString(raw: string): LibraryIndex | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return parseIndex(parsed);
  }

  /**
   * Read the index for a READ, defaulting to empty. Never throws.
   *
   * Deliberately more forgiving than `readIndexForWrite`: `listProjects` is
   * the only caller, and a listing that comes back empty rather than
   * refusing is the graceful-degradation half of Finding 3's ruling —
   * "reads may keep degrading gracefully." Do not reach for this from a
   * mutating method; that was Finding 3's Critical/Important defect
   * (`setActiveProject` in particular could commit an empty index over one
   * `openLibrary` had refused to touch). Mutating methods use
   * `readIndexForWrite` instead.
   */
  private readIndex(): LibraryIndex {
    const empty: LibraryIndex = { layout: LAYOUT_VERSION, activeId: '', projects: [] };
    if (!this.store) return empty;
    const raw = readRaw(this.store, LIBRARY_KEY);
    if (raw === null) return empty;
    return this.parseIndexString(raw) ?? empty;
  }

  /**
   * Read the index for a MUTATION. Null means REFUSE — the caller must
   * write nothing and report `available = false` — and that happens
   * precisely when the key is PRESENT but unusable (corrupt JSON, or an
   * unrecognised layout): the same condition `openLibrary` refuses to adopt
   * over, for the same reason. Committing an empty index over that would
   * silently drop every real project row it named — the exact harm
   * `openLibrary`'s refusal exists to prevent, and this enforces it at the
   * seam itself rather than trusting every caller (App included) to check
   * `libraryAvailable` first (Finding 3).
   *
   * An ABSENT key still defaults to an empty index and returns it, not
   * null: nothing has been written yet, so there is nothing to protect —
   * the same distinction `openLibrary` draws between "absent" (proceed) and
   * "present but unparseable" (refuse).
   */
  private readIndexForWrite(): LibraryIndex | null {
    const empty: LibraryIndex = { layout: LAYOUT_VERSION, activeId: '', projects: [] };
    if (!this.store) return empty;
    const raw = readRaw(this.store, LIBRARY_KEY);
    if (raw === null) return empty;
    return this.parseIndexString(raw);
  }

  /** Write the index. Returns false on failure; never throws. */
  private writeIndex(index: LibraryIndex): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(LIBRARY_KEY, JSON.stringify(index));
      return true;
    } catch {
      this._available = false;
      return false;
    }
  }

  async listProjects(): Promise<ProjectEntry[]> {
    return sortEntries(this.readIndex().projects);
  }

  async createProject(doc: SloydDocument): Promise<string | null> {
    if (!this.store) return null;
    // Refuse before writing anything if the index is present but unusable
    // (Finding 3) — same rule as autoSave, stated once there.
    const index = this.readIndexForWrite();
    if (!index) {
      this._available = false;
      return null;
    }
    const id = nextId();
    const at = this.now();
    try {
      this.writeVerifiedProject(id, doc);
    } catch {
      this._available = false;
      return null;
    }
    const ok = this.writeIndex({
      ...index,
      activeId: id,
      projects: [...index.projects, { id, name: doc.name, savedAt: at, createdAt: at }],
    });
    if (!ok) {
      // The project key persisted but got no index row, and `touchEntry`
      // only ever updates a row that already exists — no later `autoSave`
      // could add one. Left alone, that key is a permanent, invisible
      // orphan (Finding 1). Best-effort clean it up rather than return an
      // id that looks real but names nothing `listProjects` will ever show.
      try {
        this.store.removeItem(PROJECT_PREFIX + id);
      } catch {
        // Nothing more to do — `available` below already reports failure.
      }
      return null;
    }
    this._available = true;
    return id;
  }

  async duplicateProject(id: string): Promise<string | null> {
    const doc = await this.loadProject(id);
    if (!doc) return null;
    // No uniqueness enforced across the library: projects are keyed by id,
    // and invariant 8 governs BOARD names inside a document, not project
    // names. A library that renamed your projects at you would be worse
    // than two rows alike.
    return this.createProject({ ...doc, name: `${doc.name} copy` });
  }

  async deleteProject(id: string): Promise<{ activeId: string; doc: SloydDocument }> {
    // Refuse before touching anything — including the project key itself —
    // if the index is present but unusable (Finding 3). A partial delete
    // (key gone, corrupt index left alone) would be worse than no delete.
    const index = this.readIndexForWrite();
    if (!index) {
      this._available = false;
      return { activeId: id, doc: (await this.loadProject(id)) ?? createDocument() };
    }

    try {
      this.store?.removeItem(PROJECT_PREFIX + id);
    } catch {
      this._available = false;
    }
    // Captured BEFORE removeEntry, which drops the row but never touches
    // `activeId` itself — this is the only source of truth for whether the
    // project being deleted was the one open (Finding 2).
    const wasActive = index.activeId === id;
    const remaining = removeEntry(index, id);

    // Never a no-project state: the last delete makes a fresh Untitled.
    if (remaining.projects.length === 0) {
      this.writeIndex(remaining);
      const doc = createDocument();
      const newId = await this.createProject(doc);
      return { activeId: newId ?? '', doc };
    }

    if (!wasActive) {
      // A background delete must not move the caret out from under
      // whatever the caller is currently looking at.
      this.writeIndex(remaining);
      return {
        activeId: index.activeId,
        doc: (await this.loadProject(index.activeId)) ?? createDocument(),
      };
    }

    const next = sortEntries(remaining.projects)[0];
    this.writeIndex({ ...remaining, activeId: next.id });
    return { activeId: next.id, doc: (await this.loadProject(next.id)) ?? createDocument(next.name) };
  }

  async setActiveProject(id: string): Promise<void> {
    const index = this.readIndexForWrite();
    if (!index) {
      this._available = false;
      return;
    }
    const ok = this.writeIndex({ ...index, activeId: id });
    if (ok) this._available = true;
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

/**
 * Raw `getItem`, with read errors folded into `null`. Distinct from
 * `readJSON` on purpose: `openLibrary` needs to know whether the key is
 * PRESENT (even as an unparseable or empty string) before it decides
 * whether to adopt, and `readJSON` cannot answer that — it already
 * collapses "present but corrupt" into the same null as "absent".
 */
function readRaw(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Read and JSON.parse a key. Null for absent, unreadable or corrupt. */
function readJSON(store: Storage, key: string): unknown {
  const raw = readRaw(store, key);
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
