# 프로젝트 현황 (기준일: 2026-08-10)

## 개요

Threads 게시물(원작자가 이어 쓴 답글 포함)을 Obsidian vault에 마크다운 노트 + 본문 이미지로 저장하는 Chrome MV3 확장프로그램. Obsidian Local REST API 플러그인으로 저장하며, 빌드 단계 없이 저장소 폴더를 그대로 "압축해제된 확장 프로그램 로드"로 사용한다.

## 현재까지 진행 사항

- **설계 & 계획 완료** (2026-05-05 전후 커밋 `aecaec6`~`5af4069`): `docs/design/00~04` 요건·아키텍처·데이터흐름·컴포넌트·테스트 전략 문서, `docs/superpowers/plans/2026-05-05-threads-clipper.md` 11단계 TDD 구현 계획.
- **단건 저장 플로우 완성** (커밋 `84ef104`~`1a351ce`): 계획의 Task 1~10 모두 구현됨.
  - `src/content/scrape.js` — IIFE content script. `[data-pressable-container]` 기사 단위로 원작자 세그먼트만 추출(타 사용자 답글 제외), 프로필 사진/헤더/액션바/UI 텍스트 필터, 이미지 URL 수집.
  - `src/background/service-worker.js` — 아이콘 클릭 / `Ctrl+Shift+S` 커맨드로 저장 플로우 조립(추출 → 폴더명 → 이미지 업로드 → 노트 PUT).
  - `src/background/obsidian-client.js` — Local REST API 클라이언트(PUT markdown/binary, 존재 확인, source frontmatter 읽기, 디렉터리 목록), 타입별 에러(Auth/Connection/Http).
  - `src/background/folder-name.js` — `YYYY-MM-DD 첫줄(30자)` 폴더명, Windows 금지문자 제거, 충돌 시 `(2)`,`(3)` suffix, source URL 비교로 동일 게시물 중복 저장 방지.
  - `src/background/markdown-builder.js` — frontmatter(source/author/posted_at/saved_at/tags), H1-본문 첫줄 dedup, 세그먼트 `---` 구분, `![[img]]` 임베드, 이미지 누락 코멘트.
  - `src/background/notify.js` — Chrome 알림 + 클릭 시 `obsidian://open` 노트 열기.
  - `src/options/` — 설정 UI(API 호스트/토큰/폴더/vault명) + 연결 테스트. `src/shared/settings.js` — `chrome.storage.sync` 래퍼.
- **품질 개선 커밋**: 단축 표시 링크를 전체 href로 확장 + Threads 리다이렉트 언랩(`df28b66`), 노트 파일명을 `note.md` → `{폴더명}.md`로 변경(`9095829`), 셀렉터 갱신 및 노이즈 필터 강화(`10f9930`), 아이콘 리디자인(`2df481b`), README/guide 문서화(`ab0c99e`, `ab896b9`).
- **리포스트 일괄 가져오기** (2026-06-01~03, 커밋 `25f42f9`~`e2e7ca1` — 마지막 작업 구간):
  - 옵션 페이지에서 사용자명 입력 → `/@{username}/reposts` 탭을 열어 자동 스크롤 수집 → 기존 노트 source URL과 diff → 신규 저장/덮어쓰기(항목당 재시도 3회, 3초 간격).
  - 가상 스크롤 리스트 대응(뷰포트 0.8배 점진 스크롤로 언마운트 누락 방지), 탭이 백그라운드로 가면 일시정지 + 화면 오버레이 안내.
  - 리포스트 시점 timestamp가 DOM에 없어 날짜 필터를 개수 제한(전체/최근 10·20·30·60개)으로 대체.
  - MV3 서비스워커 메시지 채널 닫힘 문제 대응: 응답 대기 대신 `BULK_IMPORT_PROGRESS` broadcast의 done/error로 완료 판단. 사용자명 저장(persist).
- **동영상 처리** (2026-08-10): `scrape.js`가 `<video>`를 세그먼트별로 수집(`{src, poster, duration, alt, streaming}`), `src/background/media.js`가 이미지·동영상 업로드를 담당(서비스워커에서 분리), `markdown-builder.js`가 저장 성공 시 `![[vidN.mp4]]`·실패 시 참조 콜아웃을 렌더. 매니페스트 권한 변경 없음(동영상도 기존 cdninstagram/fbcdn 호스트).
- **테스트**: vitest + jsdom 단위 테스트 6개 파일(`tests/` — settings, folder-name, markdown-builder, media, obsidian-client, scrape) + chrome mock(`tests/setup.js`). 총 74개 통과.

## 미완성 / 필요 사항

- ~~테스트 실행 불가 상태~~ (2026-08-10 해소): `npm install` 후 `npx vitest run` 74개 전부 통과.
- ~~알려진 테스트 실패 1건~~ (해소): `tests/fixtures/post-sample.html`은 이미 현재 셀렉터(`time` + `span[dir="auto"]`)에 맞게 갱신되어 있음.
- **영어 UI 미지원**: 노이즈 필터가 한국어 키워드(`님에게 답글 남기기`, `인기순`, `활동 보기`)에 하드코딩 — 영어 UI에서는 UI 텍스트가 본문에 섞여 들어감.
- **HTTP 호스트 권한/기본값 불일치**: guide는 HTTP `127.0.0.1:27123`을 권장하지만 `manifest.json` host_permissions에는 `https://127.0.0.1/*`만 있고, `settings.js` 기본값도 `https://127.0.0.1:27124`.
- **Threads DOM 의존 취약성**: `[data-pressable-container]` 등 셀렉터 기반 — 마지막 검증이 2026-06-03이라 2개월 경과, 실서비스 동작 재확인 필요.
- **동영상 원본 파일 저장은 부분적**: Threads 플레이어가 MediaSource(blob:)로 재생하는 경우 blob URL은 fetch 불가라 원본을 파일로 받을 수 없음. 이때는 `poster` 썸네일 + 재생 길이 + 원본 게시물 링크만 노트에 남는다(동영상 존재는 항상 기록). 평문 `https://…mp4`가 노출된 경우에만 `vidN.mp4`로 저장. 실제 Threads 페이지에서 어느 쪽이 얼마나 나오는지는 **미검증**(fixture 기반 테스트만 존재).
- **일괄 가져오기 제약**: 수집 중 탭을 전면에 유지해야 함(백그라운드 탭 렌더링 정지), 리포스트 시점 기준 필터 불가, 대량 실행 시 MV3 서비스워커 수명 리스크(현재는 progress broadcast로 연명).
- **배포 미비**: zip 패키징/웹스토어 배포 없음(개발자 모드 로드만), 라이선스 미정, CI 없음.

## 다음 개발 우선순위

1. **개발 환경 복구 + 테스트 그린** (소, 1시간 미만): Node.js 설치 → `npm install` → `npx vitest run`. `tests/fixtures/post-sample.html`을 현재 셀렉터에 맞게 갱신(각 article에 `<time datetime>` 을 본문 span 앞에 배치, span에 `dir="auto"` 추가)해 기존 실패 해소.
2. **실서비스 동작 재검증 + 셀렉터 보수** (소~중, 반나절): 2개월 공백 후 threads.com에서 단건 저장(`Ctrl+Shift+S`)과 일괄 가져오기를 실제 실행. 깨졌으면 `src/content/scrape.js`의 SELECTORS/필터 갱신 + fixture 동기화.
3. **영어 UI 지원** (중, 반나절): `scrape.js`의 `PLACEHOLDER_RE`/`UI_PREFIXES`에 영어 키워드(`Reply to`, `Top`, `View activity` 등) 추가 또는 role/구조 기반 필터로 전환, 영어 fixture 테스트 추가.
4. **HTTP 권한·기본값 정리** (소, 1시간): `manifest.json` host_permissions에 `http://127.0.0.1/*` 추가, `settings.js` 기본 apiHost를 권장값 `http://127.0.0.1:27123`으로 변경 검토, README/guide와 일치화.
5. **동영상 처리 실측 검증** (소~중, 반나절): 구현은 완료(2026-08-10). 실제 동영상 게시물에서 ① `video[src]`가 blob인지 mp4인지 ② poster 속성이 실제로 존재하는지 ③ 재생 길이 배지 셀렉터가 맞는지 확인하고 fixture를 실측 DOM에 맞춰 갱신. 필요하면 srcset/썸네일 폴백 추가.
6. **배포 준비** (소, 반나절): zip 패키징 스크립트 추가, 라이선스 결정, (선택) 웹스토어 등록 검토.
