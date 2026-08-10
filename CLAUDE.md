# Threads Clipper

Chrome extension. Threads 게시물을 Obsidian Local REST API로 마크다운 저장.

## Git

- 커밋 author: `bari-psy77 <sebal1690@gmail.com>` (개인 계정, 변경 금지 — `msdev1.ocube@gmail.com`은 회사 계정이라 사용 X)
- 푸시 대상: `origin/main` (https://github.com/bari-psy77/threads-clipper.git)

## Build/Test

- 테스트: `npx vitest run`
- 빌드 단계 없음 (vanilla MV3 확장, `src/` 직접 로드)

## Layout

- `src/content/scrape.js` — Threads DOM 추출 (IIFE, content script). 이미지 + 동영상(`{src, poster, duration, alt, streaming}`)
- `src/background/` — service worker, obsidian-client, media(이미지·동영상 업로드), markdown-builder, notify, folder-name
- `src/options/` — 옵션 페이지 (API host/token/folder/vaultName)
- `src/shared/settings.js` — chrome.storage.sync 래퍼
- `tests/fixtures/` — scrape fixture (`post-sample.html` 한국어 UI, `post-sample-en.html` 영어 UI, `post-video-sample.html` 동영상)

## 동영상 정책

blob:(MediaSource)·HLS·DASH는 파일로 못 받으므로 **시도하지 않는다**. 평문 `https://…mp4`만 저장하고,
나머지는 poster 썸네일 + 원본 게시물 링크로 남긴다. 동영상이 노트에서 흔적 없이 사라지면 안 된다.
