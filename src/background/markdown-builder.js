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

function stripFirstLine(text) {
  if (!text) return '';
  const idx = text.indexOf('\n');
  return idx === -1 ? '' : text.slice(idx + 1).replace(/^\s+/, '');
}

function renderSegment(segment, imageMap, stripFirst = false) {
  const lines = [];
  if (segment.text) {
    const text = stripFirst ? stripFirstLine(segment.text) : segment.text;
    if (text) lines.push(text);
  }
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
      parts.push(renderSegment(seg, imageMap, true));
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
