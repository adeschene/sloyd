import { forwardRef, useImperativeHandle, useState } from 'react';
import { storage } from '../storage/browser';
import { useStore } from '../store/store';
import { DocumentError } from '../document/document';
import type { SloydDocument } from '../document/document';

interface Props {
  /**
   * Called with the imported document once `storage.importProject()`
   * resolves. Importing now creates a NEW library entry rather than
   * replacing what is on screen (that is App's `importIntoLibrary`) — the
   * old confirm dialog asked permission for something that no longer
   * happens, which is why it is gone rather than moved.
   */
  onImported: (doc: SloydDocument) => Promise<void>;
}

/**
 * The imperative surface `ProjectMenu`'s "Import…" row triggers. The import
 * flow's logic and error surface both stay owned by `FileMenu` — only the
 * button that starts it lives elsewhere now, so a ref is what lets a click
 * in a different subtree reach this component's local `error` state.
 */
export interface FileMenuHandle {
  importProjectIntoLibrary: () => Promise<void>;
}

export const FileMenu = forwardRef<FileMenuHandle, Props>(function FileMenu({ onImported }, ref) {
  const doc = useStore((s) => s.doc);
  const [error, setError] = useState<string | null>(null);

  const onExport = () => {
    setError(null);
    storage.exportProject(doc).catch((err) => {
      // exportProject() can reject if triggering the download itself throws
      // (sandboxed iframe, CSP) — the one recovery path StorageBanner
      // recommends when local save is unavailable must not fail silently.
      setError(err instanceof DocumentError ? err.message : 'Could not export the project.');
    });
  };

  const importProjectIntoLibrary = async () => {
    setError(null);
    try {
      // No confirm: importing creates a NEW library entry rather than
      // replacing what is on screen, so there is nothing to lose. The old
      // prompt asked permission for something that no longer happens.
      await onImported(await storage.importProject());
    } catch (err) {
      // importProject() rejects both when the user cancels the file picker
      // and when the chosen file is genuinely bad (corrupt JSON, wrong
      // version). A cancelled picker is not an error — the user just
      // changed their mind — so we stay silent, keyed off the typed
      // `cancelled` field rather than sniffing the message text (a rewording
      // of that prose must not turn a cancel into a red error banner, or
      // vice versa). Any other DocumentError is a real failure and gets
      // surfaced.
      if (err instanceof DocumentError) {
        if (!err.cancelled) setError(err.message);
      } else {
        setError('Could not open that file.');
      }
    }
  };

  useImperativeHandle(ref, () => ({ importProjectIntoLibrary }));

  return (
    <>
      <button onClick={onExport} title="Export project">⬇ Export</button>
      {error && <span role="alert" className="field-error">{error}</span>}
    </>
  );
});

export function SaveIndicator({ saving, available }: { saving: boolean; available: boolean }) {
  if (!available) return null;
  return <span className="save-indicator">{saving ? 'Saving…' : 'Saved locally'}</span>;
}

export function StorageBanner({ available }: { available: boolean }) {
  if (available) return null;
  return (
    <div role="alert" className="banner">
      Sloyd can’t save to this browser — your work exists only in this tab.
      Use <strong>Export</strong> before closing it.
    </div>
  );
}
