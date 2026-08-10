import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULTS } from '../../src/shared/settings.js';

describe('settings', () => {
  it('defaults apiHost to the documented recommended host (HTTP 27123)', () => {
    // guide.md/README recommend the plugin's non-encrypted HTTP server —
    // the HTTPS 27124 self-signed cert is commonly blocked by Chrome.
    expect(DEFAULTS.apiHost).toBe('http://127.0.0.1:27123');
  });

  it('returns defaults when nothing is stored', async () => {
    const s = await loadSettings();
    expect(s.apiHost).toBe(DEFAULTS.apiHost);
    expect(s.apiToken).toBe('');
    expect(s.folder).toBe('Thread');
    expect(s.vaultName).toBe('');
  });

  it('saves and loads settings', async () => {
    await saveSettings({ apiToken: 'abc', vaultName: 'MyVault' });
    const s = await loadSettings();
    expect(s.apiToken).toBe('abc');
    expect(s.vaultName).toBe('MyVault');
    expect(s.apiHost).toBe(DEFAULTS.apiHost); // 미저장 항목은 기본값
  });

  it('overrides defaults when stored value exists', async () => {
    await saveSettings({ apiHost: 'https://example.com:1234' });
    const s = await loadSettings();
    expect(s.apiHost).toBe('https://example.com:1234');
  });
});
