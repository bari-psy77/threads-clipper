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
