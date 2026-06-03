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

function appendProgress(text) {
  const el = $('bulkProgress');
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

function formatProgress(payload) {
  switch (payload.phase) {
    case 'collecting': return payload.message;
    case 'collected': return `수집 완료: ${payload.count}개`;
    case 'diffing': return payload.message;
    case 'diffed': return `Obsidian 기존: ${payload.existing}개`;
    case 'saving': return `[${payload.index}/${payload.total}] ${payload.overwrite ? '덮어쓰기' : '신규'} ${payload.url}`;
    case 'done': {
      const s = payload.summary;
      return `완료. 신규 ${s.saved}, 덮어쓰기 ${s.overwritten}, 실패 ${s.failed}` + (s.failures.length ? `\n실패 URL:\n${s.failures.join('\n')}` : '');
    }
    default: return JSON.stringify(payload);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'BULK_IMPORT_PROGRESS') {
    appendProgress(formatProgress(msg.payload));
  }
});

async function onBulkRun() {
  const username = $('bulkUsername').value.trim().replace(/^@/, '');
  if (!username) { appendProgress('사용자명을 입력하세요'); return; }
  const limit = $('bulkLimit').value;
  $('bulkProgress').textContent = '';
  appendProgress(`시작: @${username} (${limit === 'all' ? '전체' : `최근 ${limit}개`})`);
  $('bulkRun').disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'BULK_IMPORT_REPOSTS', username, limit });
    if (!res || !res.ok) appendProgress(`에러: ${res?.error || 'unknown'}`);
  } catch (e) {
    appendProgress(`에러: ${e.message}`);
  } finally {
    $('bulkRun').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  $('save').addEventListener('click', onSave);
  $('test').addEventListener('click', onTest);
  $('bulkRun').addEventListener('click', onBulkRun);
});
