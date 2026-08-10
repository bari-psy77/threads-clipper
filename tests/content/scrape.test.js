import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '../fixtures/post-sample.html'), 'utf8');
const fixtureEnHtml = readFileSync(resolve(__dirname, '../fixtures/post-sample-en.html'), 'utf8');
const fixtureVideoHtml = readFileSync(resolve(__dirname, '../fixtures/post-video-sample.html'), 'utf8');
const scrapeCode = readFileSync(resolve(__dirname, '../../src/content/scrape.js'), 'utf8');

let extractPost;

beforeAll(() => {
  // Evaluate the IIFE to attach extractPost to globalThis for testing.
  new Function(scrapeCode)();
  extractPost = globalThis.__threadsClipperExtractPost;
});

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

  it('gives every segment an empty videos array when there is no video', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/abc123');
    for (const seg of post.segments) expect(seg.videos).toEqual([]);
  });
});

describe('extractPost (video post)', () => {
  const VIDEO_URL = 'https://www.threads.com/@testuser/post/vid123';

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureVideoHtml;
  });

  it('detects a video in the original post segment', () => {
    const post = extractPost(VIDEO_URL);
    expect(post.segments[0].videos.length).toBe(1);
  });

  it('marks a blob: source as streaming-only and exposes no downloadable src', () => {
    const post = extractPost(VIDEO_URL);
    const video = post.segments[0].videos[0];
    expect(video.src).toBe(null);
    expect(video.streaming).toBe(true);
  });

  it('captures the poster URL of a streaming-only video', () => {
    const post = extractPost(VIDEO_URL);
    expect(post.segments[0].videos[0].poster).toBe(
      'https://scontent.cdninstagram.com/v/t51.71878-15/poster1.jpg?stp=dst-jpg_e15'
    );
  });

  it('captures duration badge text and aria-label as metadata', () => {
    const post = extractPost(VIDEO_URL);
    const video = post.segments[0].videos[0];
    expect(video.duration).toBe('0:42');
    expect(video.alt).toBe('바닷가에서 찍은 영상');
  });

  it('does not collect the video cover image as a separate image', () => {
    const post = extractPost(VIDEO_URL);
    expect(post.segments[0].images).toEqual([]);
  });

  it('does not leak the duration badge into the body text', () => {
    const post = extractPost(VIDEO_URL);
    expect(post.segments[0].text).toBe('동영상 게시물 본문입니다.');
  });

  it('captures a plain progressive src as downloadable', () => {
    const post = extractPost(VIDEO_URL);
    const video = post.segments[1].videos[0];
    expect(video.src).toBe('https://scontent.cdninstagram.com/o1/v/t2/f2/m86/clip2.mp4?efg=abcdef');
    expect(video.streaming).toBe(false);
    expect(video.poster).toBe('https://scontent.cdninstagram.com/v/t51.71878-15/poster2.jpg');
  });

  it('reads src from a <source> child when video[src] is absent', () => {
    const post = extractPost(VIDEO_URL);
    const video = post.segments[2].videos[0];
    expect(video.src).toBe('https://scontent.cdninstagram.com/o1/v/t2/f2/m86/clip4.mp4');
    expect(video.streaming).toBe(false);
    expect(video.poster).toBe(null);
    expect(video.duration).toBe(null);
  });

  it('treats an HLS playlist as streaming-only', () => {
    const post = extractPost(VIDEO_URL);
    const video = post.segments[2].videos[1];
    expect(video.src).toBe(null);
    expect(video.streaming).toBe(true);
  });

  it('collects multiple videos of one segment in DOM order', () => {
    const post = extractPost(VIDEO_URL);
    expect(post.segments[2].videos.length).toBe(2);
  });

  it('ignores videos posted by other users', () => {
    const post = extractPost(VIDEO_URL);
    const allSrc = post.segments.flatMap((s) => s.videos).map((v) => v.src).join(' ');
    expect(allSrc).not.toContain('other.mp4');
    expect(post.segments.length).toBe(3);
  });
});

describe('extractPost (English UI)', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fixtureEnHtml;
  });

  it('returns segments only from original author', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/xyz789');
    expect(post.segments.length).toBe(2);
    const allText = post.segments.map(s => s.text).join('\n');
    expect(allText).not.toContain("Another user's reply");
  });

  it('extracts only body text, excluding English UI noise', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/xyz789');
    expect(post.segments[0].text).toBe('First post body in English.');
  });

  it('filters English placeholders and UI keywords', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/xyz789');
    const allText = post.segments.map(s => s.text).join('\n');
    expect(allText).not.toContain('Reply to testuser');
    expect(allText).not.toContain('No replies yet');
    expect(allText).not.toContain('View activity');
    expect(allText).not.toContain('Sort by');
    expect(allText).not.toContain('Like');
    expect(allText).not.toMatch(/^Top$/m);
    expect(allText).not.toMatch(/^Recent$/m);
  });

  it('keeps body text that merely starts with a UI keyword', () => {
    const post = extractPost('https://www.threads.com/@testuser/post/xyz789');
    expect(post.segments[1].text).toBe('Top 10 tips — follow-up reply in English.');
  });
});
