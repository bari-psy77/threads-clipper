# 프로젝트 현황 (기준일: 2026-08-11)

## 개요

Threads 게시물(원작자가 이어 쓴 답글 포함)을 Obsidian vault에 마크다운 노트 + 본문 이미지·동영상으로 저장하는 Chrome MV3 확장프로그램. Obsidian Local REST API 플러그인으로 저장하며, 빌드 단계 없이 저장소 폴더를 그대로 "압축해제된 확장 프로그램 로드"로 사용한다(웹스토어 제출용 zip은 별도 스크립트로 생성).

## 현재까지 진행 사항

- **테스트 실측(2026-08-11, `npx vitest run`)**: **74개 전부 통과**(6개 파일 — settings, folder-name, markdown-builder, media, obsidian-client, scrape). jsdom + chrome mock(`tests/setup.js`) 기반.
- **CI 도입(신규)**: `.github/workflows/ci.yml` — `main` push / `main` 대상 PR에서 ubuntu-latest, Node 22(`actions/setup-node@v4`, npm 캐시) → `npm ci` → `npx vitest run`. cron 스케줄 없음(프라이빗 레포 무료 분 예산), 잡 상한 10분. **린트·빌드 단계는 없다**(이 레포에 린터가 설정돼 있지 않아 없는 스크립트를 부르지 않는다는 판단).
- **설계 & 계획 완료** (2026-05-05 전후 커밋 `aecaec6`~`5af4069`): `docs/design/00~04` 요건·아키텍처·데이터흐름·컴포넌트·테스트 전략 문서, `docs/superpowers/plans/2026-05-05-threads-clipper.md` 11단계 TDD 구현 계획.
- **단건 저장 플로우 완성** (커밋 `84ef104`~`1a351ce`): 계획의 Task 1~10 모두 구현됨.
  - `src/content/scrape.js` — IIFE content script. `[data-pressable-container]` 기사 단위로 원작자 세그먼트만 추출(타 사용자 답글 제외), 프로필 사진/헤더/액션바/UI 텍스트 필터, 이미지·동영상 URL 수집.
  - `src/background/service-worker.js` — 아이콘 클릭 / `Ctrl+Shift+S` 커맨드로 저장 플로우 조립(추출 → 폴더명 → 미디어 업로드 → 노트 PUT).
  - `src/background/obsidian-client.js` — Local REST API 클라이언트(PUT markdown/binary, 존재 확인, source frontmatter 읽기, 디렉터리 목록), 타입별 에러(Auth/Connection/Http).
  - `src/background/folder-name.js` — `YYYY-MM-DD 첫줄(30자)` 폴더명, Windows 금지문자 제거, 충돌 시 `(2)`,`(3)` suffix, source URL 비교로 동일 게시물 중복 저장 방지.
  - `src/background/markdown-builder.js` — frontmatter(source/author/posted_at/saved_at/tags), H1-본문 첫줄 dedup, 세그먼트 `---` 구분, `![[img]]` 임베드, 미디어 누락 코멘트.
  - `src/background/notify.js` — Chrome 알림 + 클릭 시 `obsidian://open` 노트 열기.
  - `src/options/` — 설정 UI(API 호스트/토큰/폴더/vault명) + 연결 테스트. `src/shared/settings.js` — `chrome.storage.sync` 래퍼.
- **리포스트 일괄 가져오기** (2026-06-01~03, 커밋 `25f42f9`~`e2e7ca1`): 사용자명 입력 → `/@{username}/reposts` 탭 자동 스크롤 수집 → 기존 노트 source URL과 diff → 신규 저장/덮어쓰기(항목당 재시도 3회). 가상 스크롤 대응(뷰포트 0.8배 점진 스크롤), 백그라운드 탭 진입 시 일시정지 + 오버레이 안내, 개수 제한 필터(전체/최근 10·20·30·60), MV3 메시지 채널 닫힘 대응(`BULK_IMPORT_PROGRESS` broadcast로 완료 판단).
- **영어 UI 필터 지원 완료**: `scrape.js`의 `PLACEHOLDER_RE`에 `^Reply to .+$|^No replies yet$`, `UI_PREFIXES`에 `View activity`·`Sort by`, 신규 `UI_EXACT = ['Top','Recent']`(`Top`은 접두사로 걸면 본문을 먹으므로 정확 일치로 분리), `PROFILE_ALT_RE = /프로필 사진|Profile photo/`. 영어 fixture(`tests/fixtures/post-sample-en.html`) + 전용 테스트 4건("UI 키워드로 시작할 뿐인 본문은 지킨다" 포함).
- **HTTP 호스트 권한·기본값 정합화 완료**(`fb450a0`): `manifest.json` host_permissions에 `http://127.0.0.1/*`·`https://127.0.0.1/*` 양쪽, `settings.js` 기본 apiHost `http://127.0.0.1:27123`, options 플레이스홀더·guide·README 전부 일치.
- **동영상 처리 구현 완료**(`ace25fb` — "플랫폼이 허용하는 데까지"): `scrape.js`가 세그먼트별 `{src, poster, duration, alt, streaming}` 수집. `videoSourceOf()`는 `blob:`·`data:`·`.m3u8`·`.mpd`를 제외하고 **평문 http(s)만** 후보로 삼는다. `src/background/media.js`가 저장 정책을 집행 — 평문 URL이면 `vidN.mp4`, 스트리밍 전용/다운로드 실패면 **poster를 `vidN-poster.jpg`로 폴백**, 둘 다 실패해도 `markdown-builder.js`가 `> [!info] 동영상 (mm:ss)` 콜아웃 + 원본 게시물 링크를 반드시 남긴다("조용히 사라지는 것이 최악"). 미디어 실패는 절대 throw하지 않아 노트는 항상 쓰인다. 중복 방지 2종(poster와 같은 `img`는 이미지에서 제외, 동영상 래퍼 안의 `0:42` 시간 배지는 본문에서 제외). 매니페스트 권한 변경 없음.
- **웹스토어용 패키징 스크립트 완료**(`cd8d499`): `npm run package` → `scripts/package.js`(+ 의존성 없는 자체 zip 라이터 `scripts/zip.js`, `node:zlib`만 사용) → `dist/threads-clipper-v{version}.zip`. 현재 산출물 `dist/threads-clipper-v0.1.0.zip`(23,873 B) 생성 확인됨(dist는 gitignore). 안전장치: **빌드 전에 vitest를 직접 돌려 실패하면 zip을 만들지 않고**(우회 플래그 없음), manifest 버전 형식 검증, manifest가 참조하는 파일이 zip에 다 들어갔는지 대조, 고정 타임스탬프 + 경로 정렬로 **재현 가능**, sha256 출력. 경고(빌드는 계속): description 길이, 아이콘 누락, **LICENSE 파일 없음**.

## 미완성 / 필요 사항

- **실서비스 검증이 한 번도 기록되지 않았다 — 현재 가장 큰 공백**: 프로젝트가 스스로 설계한 수동 검증 절차(구현 계획 Task 11의 9단계, `docs/design/04-testing.md`의 21개 체크리스트)는 **체크박스가 하나도 채워져 있지 않다**. 저장소 어디에도 스모크 로그·실사이트 HTML 캡처·스크린샷이 없다. 74개 테스트는 순수 로직·fixture 스크래핑·mock fetch만 덮는다.
- **Threads DOM 의존 취약성(여전히 유효)**: `[data-pressable-container]`·`span[dir="auto"]` 등 의미 계약이 없는 난독화 속성 기반이고, 여기에 휴리스틱이 겹쳐 있다 — 아바타를 40px 이하로 판정, "첫 `<time>`이 헤더의 끝"이라는 가정, 동영상 래퍼 탐색 3단계, 기사 시각 탐색 12단계 상향. DOM이 바뀌면 조용히 오작동한다.
- **동영상은 구현 완료·실측 미검증**: 실제 Threads 페이지에서 `video[src]`가 `blob:`인지 평문 mp4인지, `poster` 속성이 실제로 붙는지, 시간 배지 셀렉터가 맞는지 **아무도 확인한 적이 없다**. fixture(`tests/fixtures/post-video-sample.html`)는 손으로 작성한 것이고, "짧은 클립에서만 progressive mp4가 노출된다"는 코드 주석의 전제도 출처가 없다. poster 중복 제거가 URL 문자열 완전 일치라 쿼리스트링만 달라도 커버가 두 번 저장된다. 필요한 스모크: 실제 동영상 게시물에서 `document.querySelectorAll('video')`의 `src`·`poster`를 콘솔로 찍어 fixture와 대조.
- **Obsidian Local REST API 실호출 미검증**: `obsidian-client.js` 테스트는 `globalThis.fetch`를 mock으로 갈아끼운다 — 검증된 것은 "우리가 어떤 요청을 만드는가"이고 "플러그인이 그걸 받아주는가"가 아니다. 특히 미확인: 중간 디렉터리 자동 생성 여부(코드는 폴더를 만들지 않는다), `listDir` 응답이 정말 `{files:[...]}` 형태인지(일괄 가져오기 diff 전체가 여기 걸려 있다), MV3 서비스워커에서 `Blob`을 fetch body로 PUT하는 것, `obsidian://open` 딥링크.
- **자동 테스트가 없는 모듈**: `src/background/service-worker.js`(전체 오케스트레이션 + 일괄 가져오기 루프), `src/background/notify.js`, `src/options/options.js`, `Ctrl+Shift+S` 커맨드 배선.
- **일괄 가져오기 제약(변함없음)**: 수집 중 탭을 전면에 유지해야 함, 리포스트 시점 기준 필터 불가, 대량 실행 시 MV3 서비스워커 수명 리스크. 또한 **기존 노트를 항상 덮어쓴다** — 저장 후 손으로 고친 내용은 사라진다.
- **웹스토어 제출은 아직**: zip은 나오지만 제출물은 없다 — 개발자 계정, 스크린샷·상세 설명 등 리스팅 자산, 개인정보 탭 문구(단일 목적 진술 + 권한별 정당화), 개인정보 처리방침 URL 전부 미작성(`docs/packaging.md` §4).
- **라이선스 미정**: `LICENSE` 파일 없음, `package.json`에 `license` 필드 없음 — `npm run package`가 매번 경고를 낸다. 후보 정리는 `docs/packaging.md` §5에 있으나 결정은 소유자 몫.
- **문서 정합**: 구현 계획(`docs/superpowers/plans/…`)이 실행 이후 갱신되지 않아 경로(`D:\project\psy\obsi`)·파일명(`note.md`)이 옛 값 그대로다.

## 차단 요소 (사용자 조치 필요)

1. **Obsidian Local REST API 토큰(`apiToken`)** — 옵션 페이지 필수값. 없으면 저장이 "설정에서 API 토큰을 입력하세요"로 중단된다. 확장의 유일한 기능이 여기서 막힌다.
2. **Obsidian 플러그인의 HTTP 서버 활성화(포트 27123)** — 플러그인 설정에서 "Enable Non-encrypted (HTTP) Server"를 켜야 한다. HTTPS 27124는 자체 서명 인증서라 Chrome이 자주 막는다(guide §2).
3. **`vaultName` 설정** — 비어 있으면 알림 클릭 시 노트 열기(`obsidian://open`)가 동작하지 않는다. 저장 자체는 되므로 부분 차단.
4. **실서비스 검증 1회 실행(소유자만 가능)** — 로그인 세션이 필요해 자동화로 대신할 수 없다. threads.com에서 ① 단건 저장 ② 동영상 게시물의 `video` src/poster 콘솔 확인 ③ Obsidian 종료 상태·잘못된 토큰 에러 문구 ④ 저장 폴더 이동 후 이미지 표시 확인. **이게 없으면 나머지 우선순위를 어디서부터 손댈지 정할 수 없다.**
5. **라이선스 결정** — 공개 배포(웹스토어 등록·저장소 공개) 자체를 막는 항목. MIT / Apache-2.0 / MPL-2.0 / GPL-3.0 / 독점 / 비공개 유지 중 택일.
6. **Chrome 웹스토어 개발자 계정(1회 5 USD, 이메일 인증 + 2FA)** — 등록할 경우에만. 아울러 개인정보 처리방침을 올릴 URL이 필요하고, 그 문서에는 **`chrome.storage.sync`를 쓰므로 API 토큰이 사용자 Google 계정으로 동기화된다**는 사실이 반드시 들어가야 한다.
7. **(판단 필요) Threads 콘텐츠 스크래핑·저장이 플랫폼 약관과 충돌하는지** — 웹스토어 심사에서 문제가 될 수 있고, localhost 호스트 권한도 심사관의 추가 확인을 부른다(`docs/packaging.md`가 제기만 하고 답하지 않은 항목).

## 다음 개발 우선순위

1. **실서비스 동작 검증 + 셀렉터 보수 (반나절 — 차단 요소 1·2·4 필요)**: threads.com에서 단건 저장(`Ctrl+Shift+S`)과 일괄 가져오기를 실제로 돌린다. 깨졌으면 `src/content/scrape.js`의 SELECTORS·필터를 갱신하고 fixture를 동기화. **다른 모든 항목이 이 결과에 의존한다** — 3개월 가까이 미검증 상태라 셀렉터가 살아 있는지부터가 미지수다.
2. **동영상 실측 대조 + fixture 교정 (반나절 — 1번과 같은 세션에서 수행)**: 실제 동영상 게시물에서 `src`가 blob인지 mp4인지, poster가 붙는지, 시간 배지가 3단계 안에 있는지 확인하고 `tests/fixtures/post-video-sample.html`을 실측 DOM으로 바꾼다. poster 중복 제거를 URL 정규화(쿼리스트링 무시) 기준으로 바꿀지도 이때 판단.
3. **Obsidian 실호출 스모크 (1시간 — 차단 요소 1·2 필요)**: 실제 vault에 ① 중간 디렉터리 자동 생성 여부 ② `listDir` 응답 형태 ③ Blob PUT ④ 잘못된 토큰/서버 종료 에러 분기를 확인. 실제 응답과 다르면 `obsidian-client.js`를 고치고 mock 픽스처를 실응답으로 교체.
4. **오케스트레이션 계층 테스트 보강 (1일, 차단 없음)**: `service-worker.js`의 저장 플로우와 일괄 가져오기 루프에 단위 테스트를 붙인다(현재 0건). 1~3번에서 드러난 실동작을 그대로 회귀 테스트로 고정하는 것이 목적이므로 그 뒤에 하는 편이 낫다.
5. **라이선스 결정 + LICENSE 추가 (30분 — 차단 요소 5)**: 결정만 나오면 파일 추가와 `package.json` `license` 필드는 즉시. 패키징 경고도 함께 사라진다.
6. **웹스토어 제출 준비 (반나절~1일 — 차단 요소 5·6·7)**: 스크린샷·상세 설명 작성, 개인정보 탭 문구, 개인정보 처리방침 게시, 32px 아이콘 추가 검토. zip 빌드는 이미 준비돼 있으므로 남은 건 전부 문서·계정 작업이다.
