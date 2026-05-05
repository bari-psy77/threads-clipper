# Threads Clipper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Threads 개별 게시물 페이지에서 본인 리포스트를 클릭/단축키로 Obsidian vault의 `Thread/` 폴더에 노트 1개 + 폴더 1개로 저장하는 Chrome MV3 확장프로그램.

**Architecture:** 4-컴포넌트 (manifest, content script, background service worker, options page). 책임 분리: 추출은 content script, 저장은 background, 설정은 options. Obsidian Local REST API로 백그라운드 저장.

**Tech Stack:** Vanilla JavaScript ES modules (번들러 없음), Chrome Manifest V3, Vitest (테스트), Obsidian Local REST API 플러그인.

**Spec:** [docs/design/](../../design/) (00-requirements, 01-architecture, 02-data-flow, 03-components, 04-testing)

---

## File Structure (Map)

| 경로 | 책임 | Task |
|---|---|---|
| `package.json` | npm metadata, vitest 스크립트 | 1 |
| `vitest.config.js` | vitest 설정 (jsdom 환경) | 1 |
| `tests/setup.js` | chrome API mock 주입 | 1 |
| `src/shared/settings.js` | chrome.storage.sync 래퍼 | 2 |
| `tests/shared/settings.test.js` | settings 단위 테스트 | 2 |
| `src/background/folder-name.js` | 폴더명 생성·sanitize·충돌 처리 | 3 |
| `tests/background/folder-name.test.js` | folder-name 단위 테스트 | 3 |
| `src/background/markdown-builder.js` | 추출 결과 → 마크다운 | 4 |
| `tests/background/markdown-builder.test.js` | markdown-builder 단위 테스트 | 4 |
| `src/background/obsidian-client.js` | Local REST API HTTP 클라이언트 | 5 |
| `tests/background/obsidian-client.test.js` | fetch mock 통합 테스트 | 5 |
| `src/background/notify.js` | chrome.notifications 래퍼 | 6 |
| `src/content/scrape.js` | Threads DOM 추출 | 7 |
| `tests/content/scrape.test.js` | HTML fixture로 추출 검증 | 7 |
| `tests/fixtures/post-sample.html` | 추출 테스트용 HTML | 7 |
| `src/background/service-worker.js` | 진입점, 메시지 라우팅, 흐름 조립 | 8 |
| `src/options/options.html` | 설정 UI 마크업 | 9 |
| `src/options/options.js` | 설정 UI 동작 | 9 |
| `manifest.json` | MV3 매니페스트 | 10 |
| `icons/icon16.png` `icon48.png` `icon128.png` | 확장 아이콘 | 10 |

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`

- [ ] **Step 1: Create package.json**

Write `package.json`:

```json
{
  "name": "threads-clipper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 3: Create vitest.config.js**

Write `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: false,
  },
});
```

- [ ] **Step 4: Create tests/setup.js with chrome mocks**

Write `tests/setup.js`:

```javascript
import { vi, beforeEach } from 'vitest';

const storageData = {};

globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn(async (keys) => {
        if (Array.isArray(keys)) {
          const out = {};
          for (const k of keys) if (k in storageData) out[k] = storageData[k];
          return out;
        }
        return { ...storageData };
      }),
      set: vi.fn(async (items) => {
        Object.assign(storageData, items);
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(storageData)) delete storageData[k];
      }),
    },
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  action: { onClicked: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } },
};

beforeEach(async () => {
  await chrome.storage.sync.clear();
  vi.clearAllMocks();
});
```

- [ ] **Step 5: Verify vitest runs (with no tests yet)**

Run: `npx vitest run`
Expected: "No test files found" — that's fine. Confirms setup is loadable.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/setup.js
git commit -m "chore: project setup with vitest + chrome mocks"
git push origin main
```

---

## Task 2: Settings Module

**Files:**
- Create: `src/shared/settings.js`
- Create: `tests/shared/settings.test.js`

- [ ] **Step 1: Write the failing test**

Write `tests/shared/settings.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULTS } from '../../src/shared/settings.js';

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const s = await loadSettings();
    expect(s.apiHost).toBe(DEFAULTS.apiHost);
    expect(s.apiToken).toBe('');
    expect(s.folder).toBe('Thread');
    expect(s.vaultName).toBe('');
  });

  it('saves and loads settings', async () => {
    await saveSettings({ apiToken: 'abc', vaultName: 'MyVault' });
    const s = await loadSettings();
    expect(s.apiToken).toBe('abc');
    expect(s.vaultName).toBe('MyVault');
    expect(s.apiHost).toBe(DEFAULTS.apiHost); // 미저장 항목은 기본값
  });

  it('overrides defaults when stored value exists', async () => {
    await saveSettings({ apiHost: 'https://example.com:1234' });
    const s = await loadSettings();
    expect(s.apiHost).toBe('https://example.com:1234');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/settings.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Write `src/shared/settings.js`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/settings.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/settings.js tests/shared/settings.test.js
git commit -m "feat: settings module with chrome.storage wrapper"
git push origin main
```

---

## Task 3: Folder Name Module

**Files:**
- Create: `src/background/folder-name.js`
- Create: `tests/background/folder-name.test.js`

- [ ] **Step 1: Write the failing tests for sanitize and build**

Write `tests/background/folder-name.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeFolderName,
  buildFolderName,
  resolveCollision,
  MAX_FIRST_LINE,
} from '../../src/background/folder-name.js';

describe('sanitizeFolderName', () => {
  it('removes Windows-forbidden characters', () => {
    expect(sanitizeFolderName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeFolderName('hello   world')).toBe('hello world');
  });

  it('trims leading/trailing whitespace and dots', () => {
    expect(sanitizeFolderName('  hello.  ')).toBe('hello');
  });

  it('returns "untitled" for empty input', () => {
    expect(sanitizeFolderName('')).toBe('untitled');
    expect(sanitizeFolderName('   ')).toBe('untitled');
  });
});

describe('buildFolderName', () => {
  it('formats date + author + first line', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T10:00:00Z',
      author: '@user',
      firstLine: '안녕 세상',
    });
    expect(r).toBe('2026-05-04 @user 안녕 세상');
  });

  it('truncates first line to MAX_FIRST_LINE chars', () => {
    const long = 'a'.repeat(MAX_FIRST_LINE + 20);
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      author: '@u',
      firstLine: long,
    });
    expect(r).toBe(`2026-05-04 @u ${'a'.repeat(MAX_FIRST_LINE)}`);
  });

  it('uses only the first line when text contains newlines', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      author: '@u',
      firstLine: 'first\nsecond\nthird',
    });
    expect(r).toBe('2026-05-04 @u first');
  });

  it('sanitizes forbidden chars in author and first line', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      author: '@a/b',
      firstLine: 'x:y',
    });
    expect(r).toBe('2026-05-04 @a b x y');
  });

  it('falls back to untitled when first line is empty', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      author: '@u',
      firstLine: '',
    });
    expect(r).toBe('2026-05-04 @u untitled');
  });
});

describe('resolveCollision', () => {
  it('returns base name when not present', async () => {
    const client = {
      noteExists: vi.fn(async () => false),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.folderName).toBe('base');
    expect(r.duplicate).toBe(false);
  });

  it('returns duplicate=true when same URL exists', async () => {
    const client = {
      noteExists: vi.fn(async (path) => path === 'Thread/base/note.md'),
      readNoteSource: vi.fn(async () => 'https://x/post/1'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.duplicate).toBe(true);
    expect(r.folderName).toBe('base');
  });

  it('appends (2) when different URL collides', async () => {
    const client = {
      noteExists: vi.fn(async (path) => path === 'Thread/base/note.md'),
      readNoteSource: vi.fn(async () => 'https://x/post/different'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.duplicate).toBe(false);
    expect(r.folderName).toBe('base (2)');
  });

  it('appends (3) when (2) also exists with different URL', async () => {
    const client = {
      noteExists: vi.fn(async (path) =>
        path === 'Thread/base/note.md' || path === 'Thread/base (2)/note.md'
      ),
      readNoteSource: vi.fn(async () => 'https://x/post/other'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.folderName).toBe('base (3)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/background/folder-name.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Write `src/background/folder-name.js`:

```javascript
export const MAX_FIRST_LINE = 30;
const FORBIDDEN = /[\\/:*?"<>|]/g;

export function sanitizeFolderName(name) {
  if (!name) return 'untitled';
  let s = String(name).replace(FORBIDDEN, ' ');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/^[\s.]+|[\s.]+$/g, '');
  return s || 'untitled';
}

function isoDate(iso) {
  if (!iso) return '0000-00-00';
  return new Date(iso).toISOString().slice(0, 10);
}

function firstLineTruncated(text) {
  if (!text) return '';
  const line = String(text).split(/\r?\n/)[0] || '';
  return line.length > MAX_FIRST_LINE ? line.slice(0, MAX_FIRST_LINE) : line;
}

export function buildFolderName({ postedAt, author, firstLine }) {
  const date = isoDate(postedAt);
  const safeAuthor = sanitizeFolderName(author);
  const truncated = firstLineTruncated(firstLine);
  const safeLine = sanitizeFolderName(truncated);
  return `${date} ${safeAuthor} ${safeLine}`;
}

export async function resolveCollision(client, baseFolder, candidateName, currentUrl) {
  const tryPath = (name) => `${baseFolder}/${name}/note.md`;

  if (!(await client.noteExists(tryPath(candidateName)))) {
    return { folderName: candidateName, duplicate: false };
  }

  const existingSource = await client.readNoteSource(tryPath(candidateName));
  if (existingSource === currentUrl) {
    return { folderName: candidateName, duplicate: true };
  }

  for (let i = 2; i < 100; i++) {
    const next = `${candidateName} (${i})`;
    if (!(await client.noteExists(tryPath(next)))) {
      return { folderName: next, duplicate: false };
    }
    const src = await client.readNoteSource(tryPath(next));
    if (src === currentUrl) {
      return { folderName: next, duplicate: true };
    }
  }
  throw new Error('Too many folder collisions');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/background/folder-name.test.js`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/background/folder-name.js tests/background/folder-name.test.js
git commit -m "feat: folder-name with sanitize, build, collision resolution"
git push origin main
```

---

## Task 4: Markdown Builder

**Files:**
- Create: `src/background/markdown-builder.js`
- Create: `tests/background/markdown-builder.test.js`

- [ ] **Step 1: Write failing tests**

Write `tests/background/markdown-builder.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildMarkdown } from '../../src/background/markdown-builder.js';

const basePost = {
  url: 'https://www.threads.com/@user/post/abc',
  author: '@user',
  posted_at: '2026-05-04T18:23:00Z',
  segments: [{ text: '안녕 세상', images: [] }],
};

const fixedNow = '2026-05-05T10:30:00Z';

describe('buildMarkdown', () => {
  it('produces frontmatter with all required fields', () => {
    const md = buildMarkdown({ post: basePost, imageMap: {}, missingImages: [], now: fixedNow });
    expect(md).toContain('---\n');
    expect(md).toContain('source: https://www.threads.com/@user/post/abc');
    expect(md).toContain('author: "@user"');
    expect(md).toContain('posted_at: 2026-05-04T18:23:00Z');
    expect(md).toContain(`saved_at: ${fixedNow}`);
    expect(md).toContain('tags: [threads]');
  });

  it('emits first line as H1 heading', () => {
    const md = buildMarkdown({ post: basePost, imageMap: {}, missingImages: [], now: fixedNow });
    expect(md).toContain('\n# 안녕 세상\n');
  });

  it('keeps markdown special chars in heading verbatim (no escape)', () => {
    const post = { ...basePost, segments: [{ text: '# Hello', images: [] }] };
    const md = buildMarkdown({ post, imageMap: {}, missingImages: [], now: fixedNow });
    expect(md).toContain('\n# # Hello\n');
  });

  it('embeds image with relative wikilink', () => {
    const post = {
      ...basePost,
      segments: [{ text: 'caption', images: ['https://cdn/x.jpg'] }],
    };
    const md = buildMarkdown({
      post,
      imageMap: { 'https://cdn/x.jpg': 'img1.jpg' },
      missingImages: [],
      now: fixedNow,
    });
    expect(md).toContain('![[img1.jpg]]');
  });

  it('separates multiple segments with --- divider', () => {
    const post = {
      ...basePost,
      segments: [
        { text: 'first', images: [] },
        { text: 'second', images: [] },
        { text: 'third', images: [] },
      ],
    };
    const md = buildMarkdown({ post, imageMap: {}, missingImages: [], now: fixedNow });
    const dividers = md.match(/^---$/gm) || [];
    // 1 frontmatter open, 1 frontmatter close, 2 segment dividers
    expect(dividers.length).toBe(4);
    expect(md.indexOf('first')).toBeLessThan(md.indexOf('second'));
    expect(md.indexOf('second')).toBeLessThan(md.indexOf('third'));
  });

  it('appends missing-images comment when missingImages is non-empty', () => {
    const md = buildMarkdown({
      post: basePost,
      imageMap: {},
      missingImages: [0, 2],
      now: fixedNow,
    });
    expect(md).toContain('<!-- 이미지 2개 누락 -->');
  });

  it('falls back to "Untitled" heading when first segment is empty', () => {
    const post = { ...basePost, segments: [{ text: '', images: [] }] };
    const md = buildMarkdown({ post, imageMap: {}, missingImages: [], now: fixedNow });
    expect(md).toContain('\n# Untitled\n');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/background/markdown-builder.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Write `src/background/markdown-builder.js`:

```javascript
function frontmatter(post, savedAt) {
  return [
    '---',
    `source: ${post.url}`,
    `author: "${post.author}"`,
    `posted_at: ${post.posted_at}`,
    `saved_at: ${savedAt}`,
    'tags: [threads]',
    '---',
    '',
  ].join('\n');
}

function firstLineHeading(segments) {
  const text = segments[0]?.text ?? '';
  const line = text.split(/\r?\n/)[0].trim();
  return line || 'Untitled';
}

function renderSegment(segment, imageMap) {
  const lines = [];
  if (segment.text) lines.push(segment.text);
  for (const url of segment.images || []) {
    const local = imageMap[url];
    if (local) {
      if (lines.length) lines.push('');
      lines.push(`![[${local}]]`);
    }
  }
  return lines.join('\n');
}

export function buildMarkdown({ post, imageMap, missingImages, now }) {
  const savedAt = now || new Date().toISOString();
  const fm = frontmatter(post, savedAt);
  const heading = `# ${firstLineHeading(post.segments)}`;

  const parts = [fm, heading, ''];
  post.segments.forEach((seg, idx) => {
    if (idx === 0) {
      parts.push(renderSegment(seg, imageMap));
    } else {
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(renderSegment(seg, imageMap));
    }
  });

  if (missingImages && missingImages.length > 0) {
    parts.push('');
    parts.push(`<!-- 이미지 ${missingImages.length}개 누락 -->`);
  }

  return parts.join('\n') + '\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/background/markdown-builder.test.js`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/background/markdown-builder.js tests/background/markdown-builder.test.js
git commit -m "feat: markdown-builder with frontmatter, segments, divider, missing-image comment"
git push origin main
```

---

## Task 5: Obsidian REST API Client

**Files:**
- Create: `src/background/obsidian-client.js`
- Create: `tests/background/obsidian-client.test.js`

- [ ] **Step 1: Write failing tests with fetch mock**

Write `tests/background/obsidian-client.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObsidianClient } from '../../src/background/obsidian-client.js';

function mockFetch(response) {
  globalThis.fetch = vi.fn(async () => response);
}

function makeResponse({ status = 200, body = '', json = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => json,
  };
}

describe('ObsidianClient', () => {
  const opts = { apiHost: 'https://127.0.0.1:27124', apiToken: 'tok' };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('putMarkdown PUTs text/markdown with auth header', async () => {
    mockFetch(makeResponse({ status: 204 }));
    const c = new ObsidianClient(opts);
    await c.putMarkdown('Thread/foo/note.md', '# hi');

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://127.0.0.1:27124/vault/Thread/foo/note.md');
    expect(init.method).toBe('PUT');
    expect(init.headers['Authorization']).toBe('Bearer tok');
    expect(init.headers['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('# hi');
  });

  it('putBinary PUTs blob with image content-type', async () => {
    mockFetch(makeResponse({ status: 204 }));
    const c = new ObsidianClient(opts);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await c.putBinary('Thread/foo/img1.jpg', blob, 'image/jpeg');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://127.0.0.1:27124/vault/Thread/foo/img1.jpg');
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('image/jpeg');
    expect(init.body).toBe(blob);
  });

  it('noteExists returns true for 200', async () => {
    mockFetch(makeResponse({ status: 200, body: 'content' }));
    const c = new ObsidianClient(opts);
    expect(await c.noteExists('Thread/foo/note.md')).toBe(true);
  });

  it('noteExists returns false for 404', async () => {
    mockFetch(makeResponse({ status: 404 }));
    const c = new ObsidianClient(opts);
    expect(await c.noteExists('Thread/foo/note.md')).toBe(false);
  });

  it('readNoteSource extracts frontmatter source field', async () => {
    const md = '---\nsource: https://x/post/1\nauthor: "@u"\n---\n\n# hi\n';
    mockFetch(makeResponse({ status: 200, body: md }));
    const c = new ObsidianClient(opts);
    expect(await c.readNoteSource('Thread/foo/note.md')).toBe('https://x/post/1');
  });

  it('readNoteSource returns null when no frontmatter', async () => {
    mockFetch(makeResponse({ status: 200, body: '# hi\n' }));
    const c = new ObsidianClient(opts);
    expect(await c.readNoteSource('Thread/foo/note.md')).toBe(null);
  });

  it('throws AuthError on 401', async () => {
    mockFetch(makeResponse({ status: 401, body: 'unauthorized' }));
    const c = new ObsidianClient(opts);
    await expect(c.putMarkdown('x', 'y')).rejects.toThrow(/token/i);
  });

  it('throws ConnectionError when fetch rejects', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const c = new ObsidianClient(opts);
    await expect(c.putMarkdown('x', 'y')).rejects.toThrow(/Obsidian/);
  });

  it('strips trailing slash on apiHost', async () => {
    mockFetch(makeResponse({ status: 204 }));
    const c = new ObsidianClient({ apiHost: 'https://127.0.0.1:27124/', apiToken: 't' });
    await c.putMarkdown('a/b.md', 'x');
    expect(fetch.mock.calls[0][0]).toBe('https://127.0.0.1:27124/vault/a/b.md');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/background/obsidian-client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Write `src/background/obsidian-client.js`:

```javascript
export class ObsidianAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'ObsidianAuthError'; }
}
export class ObsidianConnectionError extends Error {
  constructor(msg) { super(msg); this.name = 'ObsidianConnectionError'; }
}
export class ObsidianHttpError extends Error {
  constructor(msg, status) { super(msg); this.name = 'ObsidianHttpError'; this.status = status; }
}

const SOURCE_RE = /^source:\s*(.+?)\s*$/m;

export class ObsidianClient {
  constructor({ apiHost, apiToken }) {
    this.apiHost = String(apiHost).replace(/\/+$/, '');
    this.apiToken = apiToken;
  }

  _url(vaultPath) {
    const cleaned = vaultPath.replace(/^\/+/, '');
    return `${this.apiHost}/vault/${cleaned}`;
  }

  _headers(extra = {}) {
    return { Authorization: `Bearer ${this.apiToken}`, ...extra };
  }

  async _do(req) {
    let res;
    try {
      res = await fetch(req.url, req.init);
    } catch (e) {
      throw new ObsidianConnectionError('Obsidian이 실행 중이고 Local REST API 플러그인이 켜져 있는지 확인하세요');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ObsidianAuthError('API 토큰이 잘못되었거나 누락되었습니다');
    }
    return res;
  }

  async putMarkdown(vaultPath, text) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': 'text/markdown' }),
        body: text,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`PUT ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
  }

  async putBinary(vaultPath, blob, mime) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': mime || 'application/octet-stream' }),
        body: blob,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`PUT ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
  }

  async noteExists(vaultPath) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: { method: 'GET', headers: this._headers() },
    });
    if (res.status === 404) return false;
    if (res.ok) return true;
    const body = await res.text();
    throw new ObsidianHttpError(`GET ${vaultPath} failed: ${res.status} ${body}`, res.status);
  }

  async readNoteSource(vaultPath) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: { method: 'GET', headers: this._headers() },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`GET ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
    const text = await res.text();
    const m = text.match(SOURCE_RE);
    return m ? m[1] : null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/background/obsidian-client.test.js`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/background/obsidian-client.js tests/background/obsidian-client.test.js
git commit -m "feat: obsidian Local REST API client with typed errors"
git push origin main
```

---

## Task 6: Notify Wrapper

**Files:**
- Create: `src/background/notify.js`

No tests — this is a thin wrapper around `chrome.notifications.create`. Tested manually via E2E.

- [ ] **Step 1: Write the wrapper**

Write `src/background/notify.js`:

```javascript
const NOTIF_PREFIX = 'threads-clipper-';
const clickHandlers = new Map();

chrome.notifications.onClicked.addListener((id) => {
  const handler = clickHandlers.get(id);
  if (handler) {
    handler();
    clickHandlers.delete(id);
    chrome.notifications.clear(id);
  }
});

function show({ title, message, onClick }) {
  const id = NOTIF_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    requireInteraction: !!onClick,
  });
  if (onClick) clickHandlers.set(id, onClick);
}

export const notify = {
  success(message, opts = {}) {
    show({ title: 'Obsidian에 저장됨', message, onClick: opts.onClick });
  },
  warn(message) {
    show({ title: 'Threads Clipper', message });
  },
  error(message) {
    show({ title: '저장 실패', message });
  },
  duplicate({ folderName, onOpen }) {
    show({
      title: '이미 저장됨',
      message: `${folderName} (클릭하여 열기)`,
      onClick: onOpen,
    });
  },
};
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check src/background/notify.js`
Expected: no output (valid syntax). If error, fix and retry.

- [ ] **Step 3: Commit**

```bash
git add src/background/notify.js
git commit -m "feat: chrome.notifications wrapper with click handlers"
git push origin main
```

---

## Task 7: Content Script (DOM Scraper)

**Files:**
- Create: `src/content/scrape.js`
- Create: `tests/content/scrape.test.js`
- Create: `tests/fixtures/post-sample.html`

Note: `scrape.js` is a content script (loaded into the Threads page). For testability, it exports its core function via a `window.__threadsClipper` global, and the message listener is registered separately.

- [ ] **Step 1: Create test fixture HTML**

Write `tests/fixtures/post-sample.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Test post</title></head>
<body>
<main>
  <article role="article" data-pressable-container>
    <header>
      <a href="/@testuser">testuser</a>
    </header>
    <div>
      <span>첫 번째 게시물 본문입니다.</span>
    </div>
    <img src="https://cdn.example.com/img1.jpg" />
    <time datetime="2026-05-04T18:23:00Z"></time>
  </article>

  <article role="article" data-pressable-container>
    <header>
      <a href="/@testuser">testuser</a>
    </header>
    <div>
      <span>이어쓴 답글 1</span>
    </div>
    <img src="https://cdn.example.com/img2.jpg" />
  </article>

  <article role="article" data-pressable-container>
    <header>
      <a href="/@otheruser">otheruser</a>
    </header>
    <div>
      <span>다른 사람의 답글 — 무시되어야 함</span>
    </div>
  </article>

  <article role="article" data-pressable-container>
    <header>
      <a href="/@testuser">testuser</a>
    </header>
    <div>
      <span>이어쓴 답글 2</span>
    </div>
  </article>
</main>
</body>
</html>
```

- [ ] **Step 2: Write the failing tests**

Write `tests/content/scrape.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPost } from '../../src/content/scrape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '../fixtures/post-sample.html'), 'utf8');

describe('extractPost', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
  });

  it('returns post URL from window.location', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    expect(post.url).toBe('https://www.threads.com/@testuser/post/abc123');
  });

  it('extracts author handle from URL', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    expect(post.author).toBe('@testuser');
  });

  it('extracts posted_at from time element', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    expect(post.posted_at).toBe('2026-05-04T18:23:00Z');
  });

  it('returns segments only from original author', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    expect(post.segments.length).toBe(3);
    expect(post.segments[0].text).toContain('첫 번째 게시물');
    expect(post.segments[1].text).toContain('이어쓴 답글 1');
    expect(post.segments[2].text).toContain('이어쓴 답글 2');
  });

  it('skips other users replies', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    const allText = post.segments.map(s => s.text).join('\n');
    expect(allText).not.toContain('다른 사람의 답글');
  });

  it('extracts images attached to each segment', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    expect(post.segments[0].images).toEqual(['https://cdn.example.com/img1.jpg']);
    expect(post.segments[1].images).toEqual(['https://cdn.example.com/img2.jpg']);
    expect(post.segments[2].images).toEqual([]);
  });

  it('throws when URL has no /@handle/ segment', () => {
    expect(() => extractPost('https://www.threads.com/some-other-page')).toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/content/scrape.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Write `src/content/scrape.js`:

```javascript
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/content/scrape.test.js`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add src/content/scrape.js tests/content/scrape.test.js tests/fixtures/post-sample.html
git commit -m "feat: content script DOM scraper with author-filtered segments"
git push origin main
```

---

## Task 8: Background Service Worker (entry + flow assembly)

**Files:**
- Create: `src/background/service-worker.js`

This module wires everything together. Tested via manual E2E in Task 11.

- [ ] **Step 1: Write the service worker**

Write `src/background/service-worker.js`:

```javascript
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
```

- [ ] **Step 2: Verify file syntax**

Run: `node --check src/background/service-worker.js`
Expected: no output. If error, fix and retry.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: background service worker assembling end-to-end save flow"
git push origin main
```

---

## Task 9: Options Page

**Files:**
- Create: `src/options/options.html`
- Create: `src/options/options.js`

- [ ] **Step 1: Write options.html**

Write `src/options/options.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Threads Clipper 설정</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input[type="text"], input[type="password"] {
    width: 100%; padding: 0.5rem; margin-top: 0.25rem;
    border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;
  }
  small { color: #666; }
  button { margin-top: 1.5rem; padding: 0.5rem 1rem; cursor: pointer; }
  #status { margin-top: 1rem; padding: 0.5rem; border-radius: 4px; }
  .ok { background: #d4edda; color: #155724; }
  .err { background: #f8d7da; color: #721c24; }
  hr { margin: 2rem 0; }
</style>
</head>
<body>
<h1>Threads Clipper 설정</h1>

<label>API 호스트
  <input type="text" id="apiHost" placeholder="https://127.0.0.1:27124">
  <small>Obsidian Local REST API 플러그인의 주소. 기본값을 거의 그대로 쓰세요.</small>
</label>

<label>API 토큰 *
  <input type="password" id="apiToken">
  <small>Obsidian Settings → Local REST API 플러그인에서 발급받아 붙여넣으세요.</small>
</label>

<label>저장 폴더
  <input type="text" id="folder" placeholder="Thread">
  <small>vault 안에서 노트가 저장될 폴더.</small>
</label>

<label>Vault 이름 *
  <input type="text" id="vaultName">
  <small>알림 클릭 시 노트를 열기 위해 필요. Obsidian의 vault 이름.</small>
</label>

<button id="save">저장</button>
<button id="test">연결 테스트</button>

<div id="status"></div>

<hr>
<p><small>단축키 변경: <code>chrome://extensions/shortcuts</code></small></p>

<script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write options.js**

Write `src/options/options.js`:

```javascript
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
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/options/options.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/options/options.html src/options/options.js
git commit -m "feat: options page (settings UI + connection test)"
git push origin main
```

---

## Task 10: Manifest + Icons

**Files:**
- Create: `manifest.json`
- Create: `icons/icon16.png`
- Create: `icons/icon48.png`
- Create: `icons/icon128.png`

- [ ] **Step 1: Write manifest.json**

Write `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Threads Clipper",
  "version": "0.1.0",
  "description": "Save Threads reposts to Obsidian via Local REST API",
  "permissions": ["activeTab", "storage", "notifications"],
  "host_permissions": [
    "https://www.threads.com/*",
    "https://*.cdninstagram.com/*",
    "https://*.fbcdn.net/*",
    "https://127.0.0.1/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Save current Threads post to Obsidian",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://www.threads.com/@*/post/*"],
      "js": ["src/content/scrape.js"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "src/options/options.html",
    "open_in_tab": true
  },
  "commands": {
    "save-current-post": {
      "suggested_key": { "default": "Ctrl+Shift+S" },
      "description": "Save current Threads post to Obsidian"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Generate placeholder icons**

Use any tool to create simple solid-color PNG icons. From bash:

```bash
mkdir -p icons
# Create three sizes using ImageMagick if available:
which magick || which convert
```

If ImageMagick is available, run:
```bash
for size in 16 48 128; do
  magick -size ${size}x${size} canvas:'#3b82f6' icons/icon${size}.png 2>/dev/null \
    || convert -size ${size}x${size} canvas:'#3b82f6' icons/icon${size}.png
done
```

If not available, manually create three PNG files (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`) — any small PNG will work for development. A 1×1 PNG resized via Chrome's DevTools is acceptable as a placeholder. Real icon design is out of scope for v0.1.

- [ ] **Step 3: Verify manifest syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add manifest.json icons/
git commit -m "feat: MV3 manifest with permissions, action, content_script, command"
git push origin main
```

---

## Task 11: Manual E2E Verification

**Files:** none

This is a manual verification pass. No automated tests can replace it for an extension this size.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests across Tasks 2-7 pass.

- [ ] **Step 2: Load extension into Chrome**

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the project root (`D:\project\psy\obsi`)
5. Verify the extension appears with no errors. If errors show, click **Errors** and fix.

- [ ] **Step 3: Configure settings**

1. Click the extension's **Details** → **Extension options**
2. Open Obsidian → Settings → Community plugins → Local REST API → copy the API key
3. Paste the API key into "API 토큰" field
4. Enter your Obsidian vault name into "Vault 이름"
5. Leave API host and folder as defaults
6. Click **저장**, then **연결 테스트**
7. Expected: "연결 OK" message

- [ ] **Step 4: Golden path — save a post with images**

1. Open a Threads post page in your browser (one of your reposts that has images and self-reply continuation)
2. Click the extension icon (or press `Ctrl+Shift+S`)
3. Wait for the success notification
4. Open Obsidian, navigate to `Thread/<saved folder>/`
5. Verify:
   - [ ] `note.md` exists with frontmatter (source, author, posted_at, saved_at, tags)
   - [ ] First line is the H1 heading
   - [ ] Self-reply segments are separated by `---`
   - [ ] Images render via `![[img1.jpg]]` etc.
   - [ ] Other users' replies are NOT included

- [ ] **Step 5: Edge cases**

- [ ] Save a post with 0 images → no `![[...]]` lines, no missing-image comment
- [ ] Save a post with no self-reply continuation → only 1 segment, no `---` divider
- [ ] Open the same post URL again and try to save → "이미 저장됨" notification, click opens existing note in Obsidian
- [ ] Try saving from Threads feed page (not a `/post/` URL) → "개별 게시물 페이지에서만 동작합니다"

- [ ] **Step 6: Error cases**

- [ ] Quit Obsidian, try to save → "Obsidian이 실행 중인지..." error notification
- [ ] Restart Obsidian, change API token in options to "wrong", try to save → "API 토큰" error notification
- [ ] Restore correct token, try saving with empty vault name → notification asks to set vault name

- [ ] **Step 7: Folder portability check (the key Q5 requirement)**

1. After saving a post, locate the saved folder in your vault on disk
2. Move the folder to a different location within the vault (e.g., `Thread/{name}` → `Archive/{name}`)
3. Open the moved `note.md` in Obsidian
4. Verify all images still render correctly (relative `![[imgN.jpg]]` resolves within the same folder)

- [ ] **Step 8: Document any issues**

If any step above failed, file an issue describing:
- Which step
- Expected vs actual
- Browser console output (chrome://extensions → Service worker "Errors")

If everything passed, proceed.

- [ ] **Step 9: Final commit (if any docs/changelog updates)**

```bash
git status
# Commit any leftover changes (e.g., README updates documenting how to install for users)
```

---

## Summary

After all tasks complete, the deliverables are:

- Working Chrome MV3 extension loadable via `chrome://extensions`
- 4 automated test suites (settings, folder-name, markdown-builder, obsidian-client, scrape) — ~38 unit/integration tests
- Manual E2E verification passed
- All code, tests, and design docs committed to `main` branch on GitHub

Future work (out of scope for v0.1):
- Better DOM selectors (revisit after seeing real Threads HTML structure during Step 4 of Task 11)
- Polished icons
- Per-image alt text from `<img alt="...">`
- Quote-post / linked-thread handling
- Web Store packaging (`zip` of the directory minus `node_modules/`, `tests/`, `docs/`)
