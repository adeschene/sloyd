import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './SettingsDialog';

const saved = { provider: 'anthropic' as const, apiKey: 'sk-ant-abc', model: 'claude-sonnet-5-5' };

describe('SettingsDialog', () => {
  it('saves a key and model', async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={onSave} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), ' sk-ant-new ');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-sonnet-5-5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-new', model: 'claude-sonnet-5-5' });
    expect(onClose).toHaveBeenCalled();
  });

  it('defaults the model to Opus 5.5 and masks the key', () => {
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('shows the stored model, and maps an unknown stored model to the default', () => {
    const { unmount } = render(<SettingsDialog settings={saved} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-sonnet-5-5');
    unmount();
    render(<SettingsDialog settings={{ ...saved, model: 'gone' }} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
  });

  it('will not save a blank key', async () => {
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports a failed save inline and stays open', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={vi.fn(async () => false)} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), 'k');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('forgets the key', async () => {
    const onForget = vi.fn(async () => {});
    render(<SettingsDialog settings={saved} onSave={vi.fn()} onForget={onForget} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(onForget).toHaveBeenCalled();
  });

  it('closes on Escape and says where the key is stored', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={onClose} />);
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
