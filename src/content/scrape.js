(function () {
  'use strict';

  const SELECTORS = {
    article: '[data-pressable-container]',
    authorLink: 'a[href^="/@"]',
    textSpan: 'span[dir="auto"]',
    image: 'img[src]',
    time: 'time[datetime]',
  };

  const URL_RE = /^https?:\/\/[^\/]+\/(@[^\/]+)\/post\/[^\/]+/;
  const PLACEHOLDER_RE = /님에게 답글 남기기|아직 답글이 없습니다/;
  const UI_PREFIXES = ['인기순', '활동 보기'];
  const PROFILE_ALT_RE = /프로필 사진|Profile photo/;
  const AVATAR_MAX_PX = 40;

  function isBodyTextSpan(span) {
    const authorLink = span.closest('a[href^="/@"]');
    if (authorLink && !(authorLink.getAttribute('href') || '').includes('/post/')) return false;
    if (span.closest('time')) return false;
    if (span.closest('[role="button"]')) return false;
    return true;
  }

  function isExternalHref(href) {
    return /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?threads\.(net|com)\//.test(href);
  }

  function stripInvisibles(s) {
    return s.replace(/[​-‍⁠﻿]+/g, '');
  }

  function unwrapThreadsRedirect(href) {
    try {
      const u = new URL(href);
      if (/(^|\.)threads\.(com|net)$/.test(u.hostname) && u.searchParams.has('u')) {
        const target = u.searchParams.get('u');
        if (target && /^https?:\/\//.test(target)) return stripInvisibles(target);
      }
    } catch (_) {}
    return stripInvisibles(href);
  }

  function expandSpanText(span) {
    const parentAnchor = span.closest('a[href]');
    if (parentAnchor) {
      const href = parentAnchor.getAttribute('href') || '';
      if (isExternalHref(href)) return unwrapThreadsRedirect(href);
    }
    function walk(node) {
      let out = '';
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.nodeValue;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'A' && isExternalHref(child.getAttribute('href') || '')) {
            out += unwrapThreadsRedirect(child.getAttribute('href'));
          } else {
            out += walk(child);
          }
        }
      }
      return out;
    }
    return walk(span);
  }

  function authorOfArticle(article) {
    const link = article.querySelector(SELECTORS.authorLink);
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    const m = href.match(/^\/(@[^\/?#]+)/);
    return m ? m[1] : null;
  }

  function textOfArticle(article) {
    const elements = article.querySelectorAll(`time, ${SELECTORS.textSpan}`);
    const parts = [];
    let pastHeader = false;
    for (const el of elements) {
      if (el.tagName === 'TIME') { pastHeader = true; continue; }
      if (!pastHeader) continue;
      if (!isBodyTextSpan(el)) continue;
      const t = expandSpanText(el).trim();
      if (!t) continue;
      if (PLACEHOLDER_RE.test(t)) continue;
      if (UI_PREFIXES.some(k => t.startsWith(k))) continue;
      if (parts.includes(t)) continue;
      parts.push(t);
    }
    return parts.join('\n');
  }

  function imagesOfArticle(article) {
    const imgs = article.querySelectorAll(SELECTORS.image);
    const urls = [];
    for (const img of imgs) {
      const alt = img.getAttribute('alt') || '';
      if (PROFILE_ALT_RE.test(alt)) continue;
      const w = parseInt(img.getAttribute('width'), 10) || img.naturalWidth || 0;
      const h = parseInt(img.getAttribute('height'), 10) || img.naturalHeight || 0;
      if (w > 0 && w <= AVATAR_MAX_PX) continue;
      if (h > 0 && h <= AVATAR_MAX_PX) continue;
      const src = img.getAttribute('src');
      if (src) urls.push(src);
    }
    return urls;
  }

  function postedAtOfArticle(article) {
    const t = article.querySelector(SELECTORS.time);
    return t ? t.getAttribute('datetime') : null;
  }

  function extractPost(currentUrl) {
    const m = currentUrl.match(URL_RE);
    if (!m) throw new Error('Not a Threads post page');
    const originalAuthor = m[1];

    const articles = Array.from(document.querySelectorAll(SELECTORS.article));
    if (articles.length === 0) throw new Error('No article elements found');

    const segments = [];
    let postedAt = null;

    for (const art of articles) {
      const author = authorOfArticle(art);
      if (author !== originalAuthor) continue;
      if (!postedAt) postedAt = postedAtOfArticle(art);
      segments.push({
        text: textOfArticle(art),
        images: imagesOfArticle(art),
      });
    }

    if (segments.length === 0) throw new Error('No segments by original author found');

    return {
      url: currentUrl,
      author: originalAuthor,
      posted_at: postedAt || new Date().toISOString(),
      segments,
    };
  }

  const POST_HREF_RE = /^\/(@[^\/?#]+)\/post\/([^\/?#]+)/;

  function findNearestArticleTime(anchor) {
    let node = anchor;
    for (let depth = 0; depth < 12 && node; depth++) {
      const t = node.querySelector && node.querySelector('time[datetime]');
      if (t) return t.getAttribute('datetime');
      node = node.parentElement;
    }
    return null;
  }

  function collectPostEntriesOnPage() {
    const anchors = document.querySelectorAll('a[href*="/post/"]');
    const map = new Map();
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = href.match(POST_HREF_RE);
      if (!m) continue;
      const url = `https://www.threads.com/${m[1]}/post/${m[2]}`;
      if (map.has(url)) continue;
      const postedAt = findNearestArticleTime(a);
      map.set(url, { url, postedAt });
    }
    return map;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // 진행 상황 오버레이 (수집 탭에 직접 표시 — 백그라운드 탭 경고용)
  function getOverlay() {
    let el = document.getElementById('__tc_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '__tc_overlay';
      el.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:2147483647;background:#111;color:#fff;' +
        'padding:10px 14px;border-radius:8px;font:13px/1.45 -apple-system,sans-serif;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.45);max-width:280px;pointer-events:none';
      document.documentElement.appendChild(el);
    }
    return el;
  }

  // 백그라운드/가려진 탭은 Chrome이 렌더링을 멈춰 가상 리스트가 새 항목을 mount하지
  // 않음 → 수집이 초기 화면분에서 멈춤. 탭이 hidden이면 일시정지하고 다시 보이면 재개.
  async function waitVisible(overlay) {
    if (!document.hidden) return;
    overlay.textContent = '⏸ 수집 일시정지 — 이 탭을 화면 앞에 두세요. 백그라운드에서는 Threads가 글을 더 불러오지 않습니다.';
    await new Promise((res) => {
      const onShow = () => {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', onShow);
          res();
        }
      };
      document.addEventListener('visibilitychange', onShow);
    });
  }

  // 리포스트 페이지는 "리포스트한 순서(최신 먼저)"로 정렬됨. DOM에 리포스트 시점
  // timestamp는 없고 원본 게시일(time[datetime])만 있으므로 날짜 기반 컷오프는 불가능.
  // 대신 피드 순서(=리포스트 최신순)를 그대로 신뢰하고 maxPosts개까지 위에서부터 수집.
  // 가상 스크롤(virtualized list) 때문에 풀높이 점프하면 지나친 카드가 언마운트되어
  // 영구 누락됨 → 뷰포트보다 작은 보폭으로 점진 스크롤하며 매 스텝 수집.
  async function collectRepostEntries({ maxScrolls = 600, stableRounds = 6, scrollDelayMs = 1500, maxPosts = null } = {}) {
    const seen = new Map();
    let unchangedRounds = 0;
    let lastHeight = 0;
    const overlay = getOverlay();
    for (let i = 0; i < maxScrolls; i++) {
      await waitVisible(overlay);
      const before = seen.size;
      const newest = collectPostEntriesOnPage();
      for (const [url, entry] of newest) if (!seen.has(url)) seen.set(url, entry);
      const after = seen.size;
      overlay.textContent = `리포스트 수집 중… ${after}개 (스크롤 ${i + 1})\n이 탭을 닫거나 가리지 마세요.`;

      if (maxPosts && after >= maxPosts) {
        console.log(`[threads-clipper] reached maxPosts=${maxPosts} at scroll ${i + 1}`);
        break;
      }

      const height = document.body.scrollHeight;
      const atBottom = window.innerHeight + window.scrollY >= height - 50;
      const heightChanged = height !== lastHeight;
      lastHeight = height;
      // 끝에 닿았고 새 글도 안 들어오고 높이도 안 변하면 진짜 바닥
      if (after === before && atBottom && !heightChanged) unchangedRounds++; else unchangedRounds = 0;

      console.log(`[threads-clipper] scroll ${i + 1}: seen=${after}, height=${height}, atBottom=${atBottom}, unchanged=${unchangedRounds}`);
      if (unchangedRounds >= stableRounds) break;
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      await sleep(scrollDelayMs);
    }
    overlay.textContent = `수집 완료: ${seen.size}개`;
    setTimeout(() => overlay.remove(), 3000);
    // Map 삽입 순서 = DOM 위→아래 = 리포스트 최신순. 최근 N개 = 앞에서 slice.
    const all = Array.from(seen.values());
    return maxPosts ? all.slice(0, maxPosts) : all;
  }

  async function collectRepostUrls(opts) {
    const entries = await collectRepostEntries(opts);
    return entries.map((e) => e.url);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'EXTRACT_POST') {
        try {
          const post = extractPost(window.location.href);
          sendResponse({ ok: true, post });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return true;
      }
      if (msg && msg.type === 'COLLECT_REPOST_URLS') {
        collectRepostUrls(msg.options || {})
          .then((urls) => sendResponse({ ok: true, urls }))
          .catch((e) => sendResponse({ ok: false, error: e.message }));
        return true;
      }
      if (msg && msg.type === 'COLLECT_REPOST_ENTRIES') {
        collectRepostEntries(msg.options || {})
          .then((entries) => sendResponse({ ok: true, entries }))
          .catch((e) => sendResponse({ ok: false, error: e.message }));
        return true;
      }
    });
    console.log('[threads-clipper] content script ready');
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__threadsClipperExtractPost = extractPost;
    globalThis.__threadsClipperCollectRepostUrls = collectRepostUrls;
  }
})();
