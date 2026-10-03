import { useEffect, useRef, useState } from 'react';
import { CLAUDE_MODELS, DEFAULT_MODEL } from '../llm/anthropic';
import type { LlmSettings } from '../storage/types';

interface Props {
  settings: LlmSettings | null;
  onSave: (s: LlmSettings) => Promise<boolean>;
  onForget: () => Promise<void>;
  onClose: () => void;
}

/**
 * The bring-your-own-key settings. The CutList modal pattern: App makes
 * `.app-shell` inert while this is open, this takes focus on mount, and its
 * own Escape listener closes it.
 */
export function SettingsDialog({ settings, onSave, onForget, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const known = CLAUDE_MODELS.some((m) => m.id === settings?.model);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(known ? settings!.model : DEFAULT_MODEL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const key = apiKey.trim() || settings?.apiKey || '';
  const save = async () => {
    const ok = await onSave({ provider: 'anthropic', apiKey: key, model });
    if (ok) onClose();
    else setError('Could not save — browser storage is unavailable.');
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
        <div className="modal-actions">
          {settings && <button onClick={() => void onForget()}>Forget key</button>}
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!key} onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
