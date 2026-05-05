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
