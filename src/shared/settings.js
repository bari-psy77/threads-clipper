export const DEFAULTS = Object.freeze({
  // 권장 기본값: 플러그인 HTTP 서버 (HTTPS 27124는 자체서명 인증서가 Chrome에서 차단되는 경우 많음)
  apiHost: 'http://127.0.0.1:27123',
  apiToken: '',
  folder: 'Thread',
  vaultName: '',
  bulkUsername: '',
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
