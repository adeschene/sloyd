import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './SettingsDialog';

const saved = { provider: 'anthropic' as const, apiKey: 'sk-ant-abc', model: 'claude-sonnet-5-5' };
/** A fresh key check per use — a shared mock would carry call counts between tests. */
const mkValid = () => vi.fn(async () => ({ status: 'valid' as const }));
const valid = mkValid();

describe('SettingsDialog', () => {
  it('saves a key and model', async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<SettingsDialog checkKey={valid} settings={null} onSave={onSave} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), ' sk-ant-new ');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-sonnet-5-5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-new', model: 'claude-sonnet-5-5' });
    expect(onClose).toHaveBeenCalled();
  });

  it('defaults the model to Opus 5.5 and masks the key', () => {
    render(<SettingsDialog checkKey={valid} settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('shows the stored model, and maps an unknown stored model to the default', () => {
    const { unmount } = render(<SettingsDialog checkKey={valid} settings={saved} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-sonnet-5-5');
    unmount();
    render(<SettingsDialog checkKey={valid} settings={{ ...saved, model: 'gone' }} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
  });

  it('will not save a blank key', async () => {
    render(<SettingsDialog checkKey={valid} settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports a failed save inline and stays open', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog checkKey={valid} settings={null} onSave={vi.fn(async () => false)} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), 'k');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('forgets the key', async () => {
    const onForget = vi.fn(async () => {});
    render(<SettingsDialog checkKey={valid} settings={saved} onSave={vi.fn()} onForget={onForget} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(onForget).toHaveBeenCalled();
  });

  it('closes on Escape and says where the key is stored', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog checkKey={valid} settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={onClose} />);
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  describe('the key is checked before it is stored (fu 174)', () => {
    const setup = (checkKey: Parameters<typeof SettingsDialog>[0]['checkKey'], settings: typeof saved | null = null) => {
      const onSave = vi.fn(async () => true);
      const onClose = vi.fn();
      render(<SettingsDialog checkKey={checkKey} settings={settings} onSave={onSave} onForget={vi.fn()} onClose={onClose} />);
      return { onSave, onClose };
    };

    it.each([
      ['a space inside it', 'sk-ant abc'],
      // Not a line break: a single-line field strips LF/CR itself, so one never reaches the code.
      ['a tab inside it', 'sk-ant\tabc'],
      ['a non-ASCII character', 'sk-ant-ab\u00e7'],
    ])('refuses a key with %s, without calling the API', async (_n, bad) => {
      const checkKey = mkValid();
      const { onSave } = setup(checkKey);
      await userEvent.click(screen.getByLabelText('API key'));
      await userEvent.paste(bad);
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('status')).toHaveTextContent(/doesn.t look like an API key/i);
      expect(checkKey).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('does NOT check a prefix: a well-formed key without sk-ant-api is checked, not refused', async () => {
      const checkKey = mkValid();
      const { onSave } = setup(checkKey);
      await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-oth3r-Key_9');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(checkKey).toHaveBeenCalledWith('sk-ant-oth3r-Key_9');
      expect(onSave).toHaveBeenCalled();
    });

    it('refuses a key the API rejects, showing the API\'s reason, and stays open', async () => {
      const { onSave, onClose } = setup(vi.fn(async () => ({ status: 'rejected' as const, reason: 'API key is invalid.' })));
      await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-bad');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('status')).toHaveTextContent('The API rejected this key: API key is invalid.');
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('says "Checking…" and disables Save while the check is out', async () => {
      let release!: (v: { status: 'valid' }) => void;
      const { onClose } = setup(vi.fn(() => new Promise<{ status: 'valid' }>((r) => { release = r; })));
      await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-ok');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
      release({ status: 'valid' });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('saves anyway when the API cannot be reached, says so, and stays open to show it', async () => {
      const { onSave, onClose } = setup(vi.fn(async () => ({ status: 'unchecked' as const })));
      await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-ok');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('status')).toHaveTextContent(/saved, but couldn.t check it/i);
      expect(onSave).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-ok', model: 'claude-opus-5-5' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('changing only the model does not check the stored key', async () => {
      const checkKey = mkValid();
      const { onSave } = setup(checkKey, saved);
      await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-opus-5-5');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(checkKey).not.toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledWith({ ...saved, model: 'claude-opus-5-5' });
    });
  });
});
