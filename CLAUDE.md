# Threads Clipper

Chrome extension. Threads 게시물을 Obsidian Local REST API로 마크다운 저장.

## Git

- 커밋 author: `bari-psy77 <msdev1.ocube@gmail.com>` (현재 로컬 config 그대로 사용, 변경 금지)
- 푸시 대상: `origin/main` (https://github.com/bari-psy77/threads-clipper.git)

## Build/Test

- 테스트: `npx vitest run`
- 빌드 단계 없음 (vanilla MV3 확장, `src/` 직접 로드)

## Layout

- `src/content/scrape.js` — Threads DOM 추출 (IIFE, content script)
- `src/background/` — service worker, obsidian-client, markdown-builder, notify, folder-name
- `src/options/` — 옵션 페이지 (API host/token/folder/vaultName)
- `src/shared/settings.js` — chrome.storage.sync 래퍼
- `tests/fixtures/post-sample.html` — scrape fixture (셀렉터와 mismatch, 1개 테스트 기존 실패)
