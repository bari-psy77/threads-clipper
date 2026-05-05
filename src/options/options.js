import { loadSettings, saveSettings, DEFAULTS } from '../shared/settings.js';
import { ObsidianClient } from '../background/obsidian-client.js';

const $ = (id) => document.getElementById(id);

async function init() {
  const s = await loadSettings();
  $('apiHost').value = s.apiHost || DEFAULTS.apiHost;
  $('apiToken').value = s.apiToken || '';
  $('folder').value = s.folder || DEFAULTS.folder;
  $('vaultName').value = s.vaultName || '';
}

function setStatus(msg, isOk) {
  const el = $('status');
  el.textContent = msg;
  el.className = isOk ? 'ok' : 'err';
}

async function onSave() {
  await saveSettings({
    apiHost: $('apiHost').value.trim() || DEFAULTS.apiHost,
    apiToken: $('apiToken').value.trim(),
    folder: $('folder').value.trim() || DEFAULTS.folder,
    vaultName: $('vaultName').value.trim(),
  });
  setStatus('저장됨', true);
}

async function onTest() {
  const apiHost = $('apiHost').value.trim() || DEFAULTS.apiHost;
  const apiToken = $('apiToken').value.trim();
  if (!apiToken) {
    setStatus('API 토큰을 먼저 입력하세요', false);
    return;
  }
  const client = new ObsidianClient({ apiHost, apiToken });
  try {
    await client.noteExists('___connection_test___.md');
    setStatus('연결 OK', true);
  } catch (e) {
    setStatus(`연결 실패: ${e.message}`, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  $('save').addEventListener('click', onSave);
  $('test').addEventListener('click', onTest);
});
