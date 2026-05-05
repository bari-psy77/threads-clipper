export const DEFAULTS = Object.freeze({
  apiHost: 'https://127.0.0.1:27124',
  apiToken: '',
  folder: 'Thread',
  vaultName: '',
});

const KEYS = Object.keys(DEFAULTS);

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(KEYS);
  const out = {};
  for (const k of KEYS) {
    out[k] = (k in stored) ? stored[k] : DEFAULTS[k];
  }
  return out;
}

export async function saveSettings(partial) {
  const allowed = {};
  for (const k of KEYS) {
    if (k in partial) allowed[k] = partial[k];
  }
  await chrome.storage.sync.set(allowed);
}
