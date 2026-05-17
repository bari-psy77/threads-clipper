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

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'EXTRACT_POST') {
        try {
          const post = extractPost(window.location.href);
          sendResponse({ ok: true, post });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return true;
      }
    });
    console.log('[threads-clipper] content script ready');
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__threadsClipperExtractPost = extractPost;
  }
})();
