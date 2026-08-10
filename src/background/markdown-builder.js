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

// 동영상 본편을 vault에 저장하지 못한 경우에도 "여기에 동영상이 있었다"는 사실과
// 되돌아갈 경로(원본 게시물 링크)를 반드시 남긴다 — 조용히 사라지는 것이 최악.
function renderVideoReference(video, ctx) {
  const title = video.duration ? `동영상 (${video.duration})` : '동영상';
  const lines = [`> [!info] ${title}`];

  const posterFile = video.poster ? ctx.posterMap[video.poster] : null;
  if (posterFile) lines.push(`> ![[${posterFile}]]`);
  if (video.alt) lines.push(`> ${video.alt}`);

  const reason = video.streaming
    ? '스트리밍 전용(blob:/HLS)이라 동영상 파일을 저장하지 못했습니다'
    : '동영상 파일을 내려받지 못했습니다';
  lines.push(`> ${reason} — [원본에서 보기](${ctx.sourceUrl})`);
  // 서명된 CDN URL은 곧 만료되지만, 바로 다시 시도할 때는 쓸 수 있어 함께 남긴다
  if (video.src) lines.push(`> 원본 동영상 URL(만료될 수 있음): ${video.src}`);

  return lines.join('\n');
}

function renderVideo(video, ctx) {
  const localFile = video.src ? ctx.videoMap[video.src] : null;
  if (localFile) return `![[${localFile}]]`;
  return renderVideoReference(video, ctx);
}

function renderSegment(segment, ctx, stripFirst = false) {
  const lines = [];
  if (segment.text) {
    const text = stripFirst ? stripFirstLine(segment.text) : segment.text;
    if (text) lines.push(text);
  }
  for (const url of segment.images || []) {
    const local = ctx.imageMap[url];
    if (local) {
      if (lines.length) lines.push('');
      lines.push(`![[${local}]]`);
    }
  }
  for (const video of segment.videos || []) {
    if (lines.length) lines.push('');
    lines.push(renderVideo(video, ctx));
  }
  return lines.join('\n');
}

export function buildMarkdown({ post, imageMap, missingImages, videoMap, posterMap, missingVideos, now }) {
  const savedAt = now || new Date().toISOString();
  const fm = frontmatter(post, savedAt);
  const heading = `# ${firstLineHeading(post.segments)}`;
  const ctx = {
    imageMap: imageMap || {},
    videoMap: videoMap || {},
    posterMap: posterMap || {},
    sourceUrl: post.url,
  };

  const parts = [fm, heading, ''];
  post.segments.forEach((seg, idx) => {
    if (idx === 0) {
      parts.push(renderSegment(seg, ctx, true));
    } else {
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(renderSegment(seg, ctx));
    }
  });

  if (missingImages && missingImages.length > 0) {
    parts.push('');
    parts.push(`<!-- 이미지 ${missingImages.length}개 누락 -->`);
  }

  if (missingVideos && missingVideos.length > 0) {
    parts.push('');
    parts.push(`<!-- 동영상 ${missingVideos.length}개 파일 저장 실패 — 링크만 기록 -->`);
  }

  return parts.join('\n') + '\n';
}
