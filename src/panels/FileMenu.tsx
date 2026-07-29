import { useState } from 'react';
import { storage } from '../storage/browser';
import { useStore } from '../store/store';
import { DocumentError } from '../document/document';

export function FileMenu() {
  const doc = useStore((s) => s.doc);
  const replaceDocument = useStore((s) => s.replaceDocument);
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

  const onImport = async () => {
    setError(null);
    const dirty = doc.boards.length > 0;
    if (dirty && !window.confirm('Opening a project replaces what is on screen. Continue?')) {
      return;
    }
    try {
      replaceDocument(await storage.importProject());
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

  return (
    <>
      <button onClick={onExport} title="Export project">⬇ Export</button>
      <button onClick={onImport} title="Import project">⬆ Import</button>
      {error && <span role="alert" className="field-error">{error}</span>}
    </>
  );
}

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
