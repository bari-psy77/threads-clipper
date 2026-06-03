import { loadSettings } from '../shared/settings.js';
import { ObsidianClient, ObsidianAuthError, ObsidianConnectionError } from './obsidian-client.js';
import { buildFolderName, resolveCollision } from './folder-name.js';
import { buildMarkdown } from './markdown-builder.js';
import { notify } from './notify.js';

const POST_URL_RE = /^https:\/\/www\.threads\.com\/@[^\/]+\/post\/[^\/?#]+/;

chrome.action.onClicked.addListener(handleSave);
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'save-current-post') handleSave();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'BULK_IMPORT_REPOSTS') {
    runBulkImport(msg.username, normalizeLimit(msg.limit))
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// 리포스트 시점 timestamp가 DOM에 없어 날짜 필터 불가. 개수 제한으로 대체.
// 'all' 또는 falsy → null(전체), 그 외 양의 정수 → 최근 N개.
function normalizeLimit(limit) {
  if (limit === 'all' || limit == null || limit === '') return null;
  const n = parseInt(limit, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function handleSave() {
  try {
    const tab = await getActiveTab();
    if (!tab || !POST_URL_RE.test(tab.url)) {
      notify.warn('개별 게시물 페이지에서만 동작합니다');
      return;
    }

    const extraction = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_POST' })
      .catch(() => ({ ok: false, error: 'no_response' }));
    if (!extraction || !extraction.ok) {
      notify.error('페이지 새로고침 후 다시 시도하세요');
      return;
    }

    const settings = await loadSettings();
    if (!settings.apiToken) {
      notify.error('설정에서 API 토큰을 입력하세요');
      chrome.runtime.openOptionsPage();
      return;
    }

    const client = new ObsidianClient(settings);
    const result = await savePost(client, settings, extraction.post, { overwrite: false });

    if (result.duplicate) {
      notify.duplicate({
        folderName: result.folderName,
        onOpen: () => openInObsidian(settings.vaultName, settings.folder, result.folderName),
      });
    } else {
      notify.success(result.folderName, {
        onClick: () => openInObsidian(settings.vaultName, settings.folder, result.folderName),
      });
    }
  } catch (e) {
    if (e instanceof ObsidianAuthError) notify.error(e.message);
    else if (e instanceof ObsidianConnectionError) notify.error(e.message);
    else notify.error(`저장 실패: ${e.message}`);
    console.error('[threads-clipper]', e);
  }
}

async function savePost(client, settings, post, { overwrite, existingPath } = {}) {
  const baseName = buildFolderName({
    postedAt: post.posted_at,
    firstLine: post.segments[0]?.text || '',
  });

  let folderName;
  let folderPath;

  if (overwrite && existingPath) {
    folderPath = existingPath.replace(/\/[^\/]+\.md$/, '');
    folderName = folderPath.split('/').pop();
  } else {
    const collision = await resolveCollision(client, settings.folder, baseName, post.url);
    if (collision.duplicate && !overwrite) {
      return { duplicate: true, folderName: collision.folderName };
    }
    folderName = collision.folderName;
    folderPath = `${settings.folder}/${folderName}`;
  }

  const { imageMap, missingImages } = await uploadImages(client, folderPath, post.segments);
  const md = buildMarkdown({ post, imageMap, missingImages });
  await client.putMarkdown(`${folderPath}/${folderName}.md`, md);

  return { duplicate: false, folderName, folderPath };
}

async function runBulkImport(username, maxPosts) {
  if (!username) throw new Error('username required');

  const settings = await loadSettings();
  if (!settings.apiToken) throw new Error('API 토큰을 설정하세요');

  const client = new ObsidianClient(settings);
  const label = maxPosts ? `최근 ${maxPosts}개` : '전체';

  broadcastProgress({ phase: 'collecting', message: `리포스트 수집 중… (${label})` });
  const entries = await collectFromRepostsTab(username, maxPosts);
  const collectedUrls = entries.map((e) => e.url);
  broadcastProgress({ phase: 'collected', count: collectedUrls.length, message: `${collectedUrls.length}개 URL 수집 (${label})` });

  broadcastProgress({ phase: 'diffing', message: '기존 노트 조회 중…' });
  const existing = await client.listExistingSources(settings.folder);
  broadcastProgress({ phase: 'diffed', existing: existing.size, message: `기존 ${existing.size}개` });

  const summary = { total: collectedUrls.length, saved: 0, overwritten: 0, failed: 0, failures: [] };

  for (let i = 0; i < collectedUrls.length; i++) {
    const url = collectedUrls[i];
    const existingPath = existing.get(url);
    const overwrite = !!existingPath;
    broadcastProgress({
      phase: 'saving',
      index: i + 1,
      total: collectedUrls.length,
      url,
      overwrite,
      message: `${i + 1}/${collectedUrls.length} ${overwrite ? '덮어쓰기' : '신규'}`,
    });

    const ok = await savePostByUrl(client, settings, url, { overwrite, existingPath, attempts: 3 });
    if (ok) {
      if (overwrite) summary.overwritten++; else summary.saved++;
    } else {
      summary.failed++;
      summary.failures.push(url);
    }

    if (i < collectedUrls.length - 1) await sleep(3000);
  }

  broadcastProgress({ phase: 'done', summary });
  notify.success(`일괄 가져오기 완료: 신규 ${summary.saved}, 덮어쓰기 ${summary.overwritten}, 실패 ${summary.failed}`);
  return summary;
}

async function collectFromRepostsTab(username, maxPosts) {
  const handle = username.startsWith('@') ? username : `@${username}`;
  const url = `https://www.threads.com/${handle}/reposts`;
  const [prevTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = await chrome.tabs.create({ url, active: true });
  try {
    await waitForTabComplete(tab.id);
    await sleep(2500);
    const finalTab = await chrome.tabs.get(tab.id);
    console.log('[threads-clipper] reposts tab final URL:', finalTab.url);
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'COLLECT_REPOST_ENTRIES',
      options: { maxScrolls: 600, stableRounds: 6, scrollDelayMs: 1500, maxPosts },
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res || !res.ok) throw new Error(`리포스트 페이지 수집 실패 (URL=${finalTab.url}): ${res?.error || 'no response'}`);
    return res.entries;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
    if (prevTab) chrome.tabs.update(prevTab.id, { active: true }).catch(() => {});
  }
}

async function savePostByUrl(client, settings, url, { overwrite, existingPath, attempts }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const post = await extractPostByUrl(url);
      await savePost(client, settings, post, { overwrite, existingPath });
      return true;
    } catch (e) {
      console.warn(`[threads-clipper] attempt ${attempt}/${attempts} failed for ${url}:`, e);
      if (attempt < attempts) await sleep(2000);
    }
  }
  return false;
}

async function extractPostByUrl(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    await sleep(1200);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_POST' });
    if (!res || !res.ok) throw new Error(res?.error || 'extract failed');
    return res.post;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout'));
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

function broadcastProgress(payload) {
  chrome.runtime.sendMessage({ type: 'BULK_IMPORT_PROGRESS', payload }).catch(() => {});
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function uploadImages(client, folderPath, segments) {
  const imageMap = {};
  const missingImages = [];
  let counter = 1;

  for (const seg of segments) {
    for (const url of seg.images || []) {
      const filename = `img${counter}.${guessExt(url)}`;
      try {
        const blob = await fetchAsBlob(url);
        await client.putBinary(`${folderPath}/${filename}`, blob, blob.type || 'image/jpeg');
        imageMap[url] = filename;
      } catch (e) {
        missingImages.push(counter);
        console.warn('[threads-clipper] image failed', url, e);
      }
      counter++;
    }
  }

  return { imageMap, missingImages };
}

function guessExt(url) {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function fetchAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function openInObsidian(vaultName, folder, folderName) {
  if (!vaultName) {
    notify.warn('vault 이름을 옵션 페이지에서 설정하세요');
    return;
  }
  const file = encodeURIComponent(`${folder}/${folderName}/${folderName}.md`);
  const vault = encodeURIComponent(vaultName);
  chrome.tabs.create({ url: `obsidian://open?vault=${vault}&file=${file}` });
}
