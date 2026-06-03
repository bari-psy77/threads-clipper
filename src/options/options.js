import { loadSettings, saveSettings, DEFAULTS } from '../shared/settings.js';
import { ObsidianClient } from '../background/obsidian-client.js';

const $ = (id) => document.getElementById(id);

async function init() {
  const s = await loadSettings();
  $('apiHost').value = s.apiHost || DEFAULTS.apiHost;
  $('apiToken').value = s.apiToken || '';
  $('folder').value = s.folder || DEFAULTS.folder;
  $('vaultName').value = s.vaultName || '';
  $('bulkUsername').value = s.bulkUsername || '';
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
    case 'error': return `에러: ${payload.message}`;
    default: return JSON.stringify(payload);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'BULK_IMPORT_PROGRESS') {
    appendProgress(formatProgress(msg.payload));
    if (msg.payload.phase === 'done' || msg.payload.phase === 'error') {
      $('bulkRun').disabled = false;
    }
  }
});

async function onBulkRun() {
  const username = $('bulkUsername').value.trim().replace(/^@/, '');
  if (!username) { appendProgress('사용자명을 입력하세요'); return; }
  await saveSettings({ bulkUsername: username }); // 다음 실행 시 자동 채움
  const limit = $('bulkLimit').value;
  $('bulkProgress').textContent = '';
  appendProgress(`시작: @${username} (${limit === 'all' ? '전체' : `최근 ${limit}개`})`);
  $('bulkRun').disabled = true;
  // 수집·저장은 수 분 걸려 MV3 서비스워커 메시지 채널이 응답 전에 닫힐 수 있음
  // ("message channel closed" 에러). 응답은 기다리지 않고 완료/에러는
  // BULK_IMPORT_PROGRESS의 'done'/'error' 단계로 판단한다.
  chrome.runtime.sendMessage({ type: 'BULK_IMPORT_REPOSTS', username, limit }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  $('save').addEventListener('click', onSave);
  $('test').addEventListener('click', onTest);
  $('bulkRun').addEventListener('click', onBulkRun);
});
