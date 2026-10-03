import { useEffect, useRef, useState } from 'react';
import { CLAUDE_MODELS, DEFAULT_MODEL } from '../llm/anthropic';
import type { KeyCheck } from '../llm/anthropic';
import type { LlmSettings } from '../storage/types';

interface Props {
  settings: LlmSettings | null;
  onSave: (s: LlmSettings) => Promise<boolean>;
  onForget: () => Promise<void>;
  onClose: () => void;
  /** One free API call that says whether a key works (App passes checkAnthropicKey). */
  checkKey: (apiKey: string) => Promise<KeyCheck>;
}

/**
 * A key is one unbroken run of printable ASCII (fu 174). Pastes that picked up
 * spaces, tabs or non-ASCII characters were saved and then rejected, one paid
 * call each. Deliberately NO PREFIX CHECK: a working key was seen that does
 * not start with `sk-ant-api`, so a prefix rule would refuse a valid key.
 */
const NOT_A_KEY = /[^\x21-\x7e]/;

/**
 * The bring-your-own-key settings. The CutList modal pattern: App makes
 * `.app-shell` inert while this is open, this takes focus on mount, and its
 * own Escape listener closes it.
 */
export function SettingsDialog({ settings, onSave, onForget, onClose, checkKey }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const known = CLAUDE_MODELS.some((m) => m.id === settings?.model);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(known ? settings!.model : DEFAULT_MODEL);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const typed = apiKey.trim();
  const key = typed || settings?.apiKey || '';
  const save = async () => {
    setError(null);
    setNote(null);
    // Only a NEWLY TYPED key is shape-checked and verified; changing just the
    // model keeps the stored key as it is.
    let check: KeyCheck = { status: 'valid' };
    if (typed) {
      if (NOT_A_KEY.test(typed)) {
        setError('That doesn’t look like an API key — it contains spaces or unusual characters. Paste the key again.');
        return;
      }
      setChecking(true);
      check = await checkKey(typed);
      setChecking(false);
      if (check.status === 'rejected') {
        setError(`The API rejected this key: ${check.reason}`);
        return;
      }
    }
    const ok = await onSave({ provider: 'anthropic', apiKey: key, model });
    if (!ok) setError('Could not save — browser storage is unavailable.');
    // Saved but unverified stays open, so the person sees the caveat.
    else if (check.status === 'unchecked') setNote('Saved, but couldn’t check it with the API right now.');
    else onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Settings</h2>
        <div className="field">
          <label htmlFor="llm-provider">Provider</label>
          <select id="llm-provider" className="input" value="anthropic" disabled>
            <option value="anthropic">Claude (Anthropic)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="llm-key">API key</label>
          <input
            id="llm-key"
            className="input"
            type="password"
            autoComplete="off"
            placeholder={settings ? 'Saved — type to replace' : 'sk-ant-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="llm-model">Model</label>
          <select id="llm-model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <p className="modal-note">Stored in this browser only. Anyone with access to this browser profile can read it.</p>
        {error && <p className="field-error" role="status">{error}</p>}
        {note && <p className="modal-note" role="status">{note}</p>}
        <div className="modal-actions">
          {settings && <button onClick={() => void onForget()}>Forget key</button>}
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!key || checking} onClick={() => void save()}>
            {checking ? 'Checking…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
