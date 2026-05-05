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
