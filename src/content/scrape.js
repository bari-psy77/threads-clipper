const SELECTORS = {
  article: '[role="article"]',
  authorLink: 'a[href^="/@"]',
  textSpan: 'span',
  image: 'img[src]',
  time: 'time[datetime]',
};

const URL_RE = /^https?:\/\/[^\/]+\/(@[^\/]+)\/post\/[^\/]+/;

function authorOfArticle(article) {
  const link = article.querySelector(SELECTORS.authorLink);
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const m = href.match(/^\/(@[^\/?#]+)/);
  return m ? m[1] : null;
}

function textOfArticle(article) {
  const spans = article.querySelectorAll(SELECTORS.textSpan);
  const parts = [];
  for (const s of spans) {
    const t = (s.textContent || '').trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return parts.join('\n');
}

function imagesOfArticle(article) {
  const imgs = article.querySelectorAll(SELECTORS.image);
  const urls = [];
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (src) urls.push(src);
  }
  return urls;
}

function postedAtOfArticle(article) {
  const t = article.querySelector(SELECTORS.time);
  return t ? t.getAttribute('datetime') : null;
}

export function extractPost(currentUrl) {
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

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
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
}
