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
  it('formats date + first line', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T10:00:00Z',
      firstLine: '안녕 세상',
    });
    expect(r).toBe('2026-05-04 안녕 세상');
  });

  it('truncates first line to MAX_FIRST_LINE chars', () => {
    const long = 'a'.repeat(MAX_FIRST_LINE + 20);
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      firstLine: long,
    });
    expect(r).toBe(`2026-05-04 ${'a'.repeat(MAX_FIRST_LINE)}`);
  });

  it('uses only the first line when text contains newlines', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      firstLine: 'first\nsecond\nthird',
    });
    expect(r).toBe('2026-05-04 first');
  });

  it('sanitizes forbidden chars in first line', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      firstLine: 'x:y',
    });
    expect(r).toBe('2026-05-04 x y');
  });

  it('falls back to untitled when first line is empty', () => {
    const r = buildFolderName({
      postedAt: '2026-05-04T00:00:00Z',
      firstLine: '',
    });
    expect(r).toBe('2026-05-04 untitled');
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
      noteExists: vi.fn(async (path) => path === 'Thread/base/base.md'),
      readNoteSource: vi.fn(async () => 'https://x/post/1'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.duplicate).toBe(true);
    expect(r.folderName).toBe('base');
  });

  it('appends (2) when different URL collides', async () => {
    const client = {
      noteExists: vi.fn(async (path) => path === 'Thread/base/base.md'),
      readNoteSource: vi.fn(async () => 'https://x/post/different'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.duplicate).toBe(false);
    expect(r.folderName).toBe('base (2)');
  });

  it('appends (3) when (2) also exists with different URL', async () => {
    const client = {
      noteExists: vi.fn(async (path) =>
        path === 'Thread/base/base.md' || path === 'Thread/base (2)/base (2).md'
      ),
      readNoteSource: vi.fn(async () => 'https://x/post/other'),
    };
    const r = await resolveCollision(client, 'Thread', 'base', 'https://x/post/1');
    expect(r.folderName).toBe('base (3)');
  });
});
