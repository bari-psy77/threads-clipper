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

  it('builds fine for segments that have no videos field', () => {
    const md = buildMarkdown({ post: basePost, imageMap: {}, missingImages: [], now: fixedNow });
    expect(md).toContain('안녕 세상');
  });
});

describe('buildMarkdown — videos', () => {
  function postWithVideo(video) {
    return { ...basePost, segments: [{ text: '동영상 있음', images: [], videos: [video] }] };
  }

  it('embeds a downloaded video file as a wikilink', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: 'https://cdn/clip.mp4', poster: null, duration: '0:10', alt: null, streaming: false }),
      imageMap: {},
      missingImages: [],
      videoMap: { 'https://cdn/clip.mp4': 'vid1.mp4' },
      posterMap: {},
      missingVideos: [],
      now: fixedNow,
    });
    expect(md).toContain('![[vid1.mp4]]');
  });

  it('renders a reference block with poster and source link for a streaming-only video', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: null, poster: 'https://cdn/p.jpg', duration: '0:42', alt: null, streaming: true }),
      imageMap: {},
      missingImages: [],
      videoMap: {},
      posterMap: { 'https://cdn/p.jpg': 'vid1-poster.jpg' },
      missingVideos: [1],
      now: fixedNow,
    });
    expect(md).toContain('> [!info] 동영상 (0:42)');
    expect(md).toContain('> ![[vid1-poster.jpg]]');
    expect(md).toContain(`[원본에서 보기](${basePost.url})`);
  });

  it('still records the video when neither file nor poster exists', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: null, poster: null, duration: null, alt: null, streaming: true }),
      imageMap: {},
      missingImages: [],
      videoMap: {},
      posterMap: {},
      missingVideos: [1],
      now: fixedNow,
    });
    expect(md).toContain('> [!info] 동영상');
    expect(md).toContain(`[원본에서 보기](${basePost.url})`);
  });

  it('includes the video alt text when present', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: null, poster: null, duration: null, alt: '바닷가에서 찍은 영상', streaming: true }),
      imageMap: {},
      missingImages: [],
      videoMap: {},
      posterMap: {},
      missingVideos: [1],
      now: fixedNow,
    });
    expect(md).toContain('> 바닷가에서 찍은 영상');
  });

  it('keeps the original video URL when a plain src existed but the download failed', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: 'https://cdn/clip.mp4', poster: null, duration: null, alt: null, streaming: false }),
      imageMap: {},
      missingImages: [],
      videoMap: {},
      posterMap: {},
      missingVideos: [1],
      now: fixedNow,
    });
    expect(md).toContain('https://cdn/clip.mp4');
    expect(md).toContain('> [!info] 동영상');
  });

  it('appends a footer comment counting videos saved by reference only', () => {
    const md = buildMarkdown({
      post: postWithVideo({ src: null, poster: null, duration: null, alt: null, streaming: true }),
      imageMap: {},
      missingImages: [],
      videoMap: {},
      posterMap: {},
      missingVideos: [1, 2],
      now: fixedNow,
    });
    expect(md).toContain('<!-- 동영상 2개 파일 저장 실패 — 링크만 기록 -->');
  });

  it('renders a video attached to a follow-up segment after the divider', () => {
    const post = {
      ...basePost,
      segments: [
        { text: '첫 글', images: [], videos: [] },
        { text: '이어쓴 답글', images: [], videos: [{ src: 'https://cdn/c.mp4', poster: null, duration: null, alt: null, streaming: false }] },
      ],
    };
    const md = buildMarkdown({
      post,
      imageMap: {},
      missingImages: [],
      videoMap: { 'https://cdn/c.mp4': 'vid1.mp4' },
      posterMap: {},
      missingVideos: [],
      now: fixedNow,
    });
    expect(md.indexOf('---\n\n이어쓴 답글')).toBeGreaterThan(-1);
    expect(md.indexOf('![[vid1.mp4]]')).toBeGreaterThan(md.indexOf('이어쓴 답글'));
  });
});
