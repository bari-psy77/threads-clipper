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

export function buildFolderName({ postedAt, firstLine }) {
  const date = isoDate(postedAt);
  const truncated = firstLineTruncated(firstLine);
  const safeLine = sanitizeFolderName(truncated);
  return `${date} ${safeLine}`;
}

export async function resolveCollision(client, baseFolder, candidateName, currentUrl) {
  const tryPath = (name) => `${baseFolder}/${name}/${name}.md`;

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
