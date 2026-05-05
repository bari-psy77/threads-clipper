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
    const post = extraction.post;

    const settings = await loadSettings();
    if (!settings.apiToken) {
      notify.error('설정에서 API 토큰을 입력하세요');
      chrome.runtime.openOptionsPage();
      return;
    }

    const client = new ObsidianClient(settings);

    const baseName = buildFolderName({
      postedAt: post.posted_at,
      author: post.author,
      firstLine: post.segments[0]?.text || '',
    });

    const collision = await resolveCollision(client, settings.folder, baseName, post.url);
    if (collision.duplicate) {
      const folderName = collision.folderName;
      notify.duplicate({
        folderName,
        onOpen: () => openInObsidian(settings.vaultName, settings.folder, folderName),
      });
      return;
    }

    const folderName = collision.folderName;
    const folderPath = `${settings.folder}/${folderName}`;

    const { imageMap, missingImages } = await uploadImages(client, folderPath, post.segments);

    const md = buildMarkdown({ post, imageMap, missingImages });
    await client.putMarkdown(`${folderPath}/note.md`, md);

    notify.success(folderName, {
      onClick: () => openInObsidian(settings.vaultName, settings.folder, folderName),
    });
  } catch (e) {
    if (e instanceof ObsidianAuthError) notify.error(e.message);
    else if (e instanceof ObsidianConnectionError) notify.error(e.message);
    else notify.error(`저장 실패: ${e.message}`);
    console.error('[threads-clipper]', e);
  }
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

function openInObsidian(vaultName, folder, folderName) {
  if (!vaultName) {
    notify.warn('vault 이름을 옵션 페이지에서 설정하세요');
    return;
  }
  const file = encodeURIComponent(`${folder}/${folderName}/note.md`);
  const vault = encodeURIComponent(vaultName);
  chrome.tabs.create({ url: `obsidian://open?vault=${vault}&file=${file}` });
}
