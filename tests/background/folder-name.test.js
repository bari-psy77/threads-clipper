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
