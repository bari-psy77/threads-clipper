import { describe, it, expect, vi } from 'vitest';
import { uploadMedia } from '../../src/background/media.js';

function makeClient() {
  return { putBinary: vi.fn(async () => {}) };
}

function okFetch(type = 'application/octet-stream') {
  return vi.fn(async () => ({ ok: true, blob: async () => new Blob(['data'], { type }) }));
}

const FOLDER = 'Thread/2026-05-04 sample';

describe('uploadMedia — images', () => {
  it('uploads images with continuous numbering across segments', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [
        { images: ['https://cdn/a.jpg'], videos: [] },
        { images: ['https://cdn/b.png'], videos: [] },
      ],
      fetchImpl: okFetch('image/jpeg'),
    });

    expect(client.putBinary).toHaveBeenCalledTimes(2);
    expect(client.putBinary.mock.calls[0][0]).toBe(`${FOLDER}/img1.jpg`);
    expect(client.putBinary.mock.calls[1][0]).toBe(`${FOLDER}/img2.png`);
    expect(result.imageMap).toEqual({
      'https://cdn/a.jpg': 'img1.jpg',
      'https://cdn/b.png': 'img2.png',
    });
    expect(result.missingImages).toEqual([]);
  });

  it('records a missing image instead of throwing when the download fails', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: ['https://cdn/broken.jpg'], videos: [] }],
      fetchImpl: vi.fn(async () => ({ ok: false, status: 404 })),
    });

    expect(result.missingImages).toEqual([1]);
    expect(result.imageMap).toEqual({});
  });

  it('tolerates segments without a videos field', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], text: 'no media' }],
      fetchImpl: okFetch(),
    });
    expect(result.videoMap).toEqual({});
    expect(result.missingVideos).toEqual([]);
  });
});

describe('uploadMedia — videos', () => {
  it('downloads a video that exposes a plain src and maps it to vidN.mp4', async () => {
    const client = makeClient();
    const fetchImpl = okFetch('video/mp4');
    const src = 'https://cdn/o1/v/clip.mp4?efg=abc';
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src, poster: 'https://cdn/p.jpg', duration: '0:10', streaming: false }] }],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(src);
    expect(client.putBinary).toHaveBeenCalledWith(`${FOLDER}/vid1.mp4`, expect.anything(), 'video/mp4');
    expect(result.videoMap).toEqual({ [src]: 'vid1.mp4' });
    expect(result.missingVideos).toEqual([]);
  });

  it('skips the poster when the video file itself was saved', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src: 'https://cdn/clip.mp4', poster: 'https://cdn/p.jpg', streaming: false }] }],
      fetchImpl: okFetch('video/mp4'),
    });

    expect(client.putBinary).toHaveBeenCalledTimes(1);
    expect(result.posterMap).toEqual({});
  });

  it('never fetches a streaming-only video and saves its poster instead', async () => {
    const client = makeClient();
    const fetchImpl = okFetch('image/jpeg');
    const poster = 'https://cdn/p1.jpg?stp=dst-jpg';
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src: null, poster, duration: '0:42', streaming: true }] }],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(poster);
    expect(client.putBinary).toHaveBeenCalledWith(`${FOLDER}/vid1-poster.jpg`, expect.anything(), 'image/jpeg');
    expect(result.posterMap).toEqual({ [poster]: 'vid1-poster.jpg' });
    expect(result.videoMap).toEqual({});
    // 파일로 저장하지 못한 동영상은 반드시 기록 — 노트에서 참조 블록으로 표시된다
    expect(result.missingVideos).toEqual([1]);
  });

  it('falls back to the poster when the video download fails', async () => {
    const client = makeClient();
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith('.mp4')) throw new Error('network');
      return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) };
    });
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src: 'https://cdn/clip.mp4', poster: 'https://cdn/p.jpg', streaming: false }] }],
      fetchImpl,
    });

    expect(result.videoMap).toEqual({});
    expect(result.posterMap).toEqual({ 'https://cdn/p.jpg': 'vid1-poster.jpg' });
    expect(result.missingVideos).toEqual([1]);
  });

  it('records the video even when neither file nor poster can be saved', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src: null, poster: null, streaming: true }] }],
      fetchImpl: okFetch(),
    });

    expect(client.putBinary).not.toHaveBeenCalled();
    expect(result.missingVideos).toEqual([1]);
  });

  it('numbers videos independently of images and continuously across segments', async () => {
    const client = makeClient();
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [
        { images: ['https://cdn/a.jpg'], videos: [{ src: 'https://cdn/one.mp4', poster: null, streaming: false }] },
        { images: [], videos: [{ src: null, poster: 'https://cdn/p2.jpg', streaming: true }] },
      ],
      fetchImpl: okFetch(),
    });

    expect(result.imageMap).toEqual({ 'https://cdn/a.jpg': 'img1.jpg' });
    expect(result.videoMap).toEqual({ 'https://cdn/one.mp4': 'vid1.mp4' });
    expect(result.posterMap).toEqual({ 'https://cdn/p2.jpg': 'vid2-poster.jpg' });
    expect(result.missingVideos).toEqual([2]);
  });

  it('keeps going when the poster upload also fails', async () => {
    const client = { putBinary: vi.fn(async () => { throw new Error('obsidian down'); }) };
    const result = await uploadMedia({
      client,
      folderPath: FOLDER,
      segments: [{ images: [], videos: [{ src: null, poster: 'https://cdn/p.jpg', streaming: true }] }],
      fetchImpl: okFetch(),
    });

    expect(result.posterMap).toEqual({});
    expect(result.missingVideos).toEqual([1]);
  });
});
