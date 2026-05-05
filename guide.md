# Threads Clipper 사용자 가이드

설치부터 사용, 트러블슈팅까지 차례대로 따라 하면 됩니다.

## 1. 사전 준비

- **Obsidian 데스크톱 앱** (개인 사용 무료)
- **Chrome / Edge / Brave** 등 Chromium 기반 브라우저 (MV3 호환)
- 이 저장소 클론 또는 ZIP 다운로드

## 2. Obsidian Local REST API 플러그인 설치

1. Obsidian 실행 → **Settings (⚙️) → Community plugins**
2. **Restricted mode**가 켜져 있으면 → **Turn on community plugins** 클릭
3. **Browse** → 검색창에 `Local REST API` → **Install** → **Enable**
4. 좌측 사이드바 **Community plugins → Local REST API**의 톱니바퀴 클릭

### 플러그인 설정 (중요)

- **API Key**: 자동 생성된 키를 복사 (확장 옵션에 붙여넣기 위해 필요)
- **HTTPS Server (port 27124)**: 자체서명 인증서 사용 → **Chrome에서 차단되는 경우가 많음**
- **Non-encrypted (HTTP) Server**: 추천 — `Enable Non-encrypted (HTTP) Server` 체크 → 기본 포트 `27123`

> **추천 설정**: 로컬에서만 동작하므로 HTTP `27123`로 충분합니다. HTTPS를 고집하면 Chrome에서 자체서명 인증서를 신뢰해야 합니다 (트러블슈팅 섹션 참고).

플러그인 설정 화면에 **Server status: Running**이 표시되는지 확인.

## 3. 확장 설치 (개발자 모드)

1. 저장소 클론
   ```powershell
   git clone <repo-url> threads-clipper
   ```
2. Chrome 주소창 → `chrome://extensions/`
3. 우측 상단 **개발자 모드(Developer mode) ON**
4. **압축해제된 확장 프로그램 로드(Load unpacked)** → 클론한 `threads-clipper` 폴더 선택
5. 카드에 **Threads Clipper**가 나타나면 성공
6. 확장 ID 확인 (필요 시 디버깅용)

### 확장 핀 고정 (선택)

브라우저 툴바 우측 퍼즐 아이콘(🧩) → **Threads Clipper** 옆 핀 아이콘 클릭 → 툴바에 고정.

## 4. 옵션 페이지 설정

확장 카드 → **세부정보 → 확장 프로그램 옵션** (또는 확장 아이콘 우클릭 → 옵션)

| 필드 | 설명 | 예시 |
|---|---|---|
| API 호스트 | Local REST API 주소 | `http://127.0.0.1:27123` (HTTP 권장) |
| API 토큰 | 플러그인의 API Key | 플러그인 설정에서 복사 |
| 저장 폴더 | vault 내부 폴더명 | `Thread` |
| Vault 이름 | 알림 클릭 시 노트를 열기 위한 vault 이름 | `MyVault` |

**저장** 버튼 → **연결 테스트** 클릭 → 초록색 OK 메시지가 뜨면 정상.

## 5. 사용법

1. Threads 게시물 페이지 열기 — URL이 `https://www.threads.com/@user/post/...` 형태여야 합니다 (피드 페이지 X)
2. 다음 중 하나로 저장:
   - **단축키 `Ctrl+Shift+S`**
   - 툴바의 확장 아이콘 클릭
3. 데스크톱 알림이 표시되면 성공 → 알림 클릭 시 Obsidian에서 노트 열림
4. vault 안 `Thread/2026-MM-DD [본문 첫 줄]/2026-MM-DD [본문 첫 줄].md` 위치에 저장됨 (파일명은 폴더명과 동일하게 — 그래프 뷰에서 식별 가능)

### 단축키 변경

`chrome://extensions/shortcuts` → **Save current Threads post to Obsidian**의 단축키 수정.

### 동일 게시물 재저장 / 충돌 처리

- 같은 URL로 다시 저장하면 → 알림: "이미 저장됨" + 폴더 열기 옵션
- 다른 URL이지만 같은 폴더명 후보 → `(2)`, `(3)` 자동 추가

## 6. 저장 결과

```
Thread/
└── 2026-05-04 [사업하는 스친이들 주목]/
    ├── 2026-05-04 [사업하는 스친이들 주목].md
    ├── img1.jpg
    └── img2.jpg
```

노트 마크다운 예시:
```markdown
---
source: https://www.threads.com/@user/post/abc123
author: "@user"
posted_at: 2026-05-04T15:27:48.000Z
saved_at: 2026-05-05T10:23:30.869Z
tags: [threads]
---

# [사업하는 스친이들 주목]

며칠전에 클로드 크레딧 1만달러 받았어.
준비물, 링크는 댓글에!
Repost 해두고 나중에꺼내방 1/2

![[img1.jpg]]
```

## 7. 트러블슈팅

### "Obsidian이 실행 중이고 Local REST API 플러그인이 켜져 있는지 확인하세요"

`fetch()` 자체가 실패할 때 표시. 다음 순서로 확인:

1. Obsidian 실행 중인가?
2. 플러그인 활성화? (Settings → Community plugins → Local REST API 토글)
3. 플러그인 화면의 **Server status: Running** 표시?
4. **자체서명 인증서 차단** — 가장 흔한 원인
   - 옵션 (a, 권장): 옵션 페이지의 API 호스트를 `http://127.0.0.1:27123`로 변경 (플러그인 HTTP 옵션 켜야 함)
   - 옵션 (b): 새 탭에서 `https://127.0.0.1:27124/` 직접 방문 → "고급 → 안전하지 않음으로 이동"으로 인증서 신뢰 → 다시 시도

### "API token이 잘못되었거나 누락되었습니다"

- 플러그인의 **API Key**를 다시 복사하여 옵션 페이지 **API 토큰** 필드에 정확히 붙여넣기
- 토큰 앞뒤 공백 제거
- 플러그인에서 키 재생성 후 적용

### "개별 게시물 페이지에서만 동작합니다"

URL이 `https://www.threads.com/@user/post/...` 형태여야 함. 피드 페이지(`/@user`)나 검색 페이지에서는 동작 안 함.

### "페이지 새로고침 후 다시 시도하세요"

content script가 페이지에 주입되지 않은 상태. 보통:
- 확장을 새로 로드한 직후, 이전에 열어둔 페이지 — `F5`로 새로고침
- 또는 [`manifest.json`](manifest.json)의 `matches` 패턴이 현재 URL과 안 맞음

### Threads UI 변경으로 본문/이미지 추출이 깨졌을 때

[src/content/scrape.js](src/content/scrape.js)의 셀렉터를 업데이트해야 합니다.

1. Threads 게시물 페이지에서 F12 → Console
2. 다음 명령으로 컨테이너 셀렉터 검증:
   ```js
   document.querySelectorAll('[data-pressable-container]').length
   ```
3. 0이 나오면 Threads가 셀렉터를 바꾼 것 → DOM 검사로 새 wrapper attribute 식별
4. [src/content/scrape.js:5](src/content/scrape.js#L5)의 `SELECTORS.article` 업데이트

본문 추출 필터(`isBodyTextSpan`, `PLACEHOLDER_RE`, `UI_PREFIXES`, `PROFILE_ALT_RE`)는 한국어 UI 기준입니다. 영어/다른 언어에서는 패턴 추가 필요.

### Service Worker 디버깅

`chrome://extensions/` → Threads Clipper 카드의 **service worker** 링크 클릭 → DevTools 열림 → Console 탭에서 에러 확인.

## 8. 개발

```powershell
npm install
npm test           # vitest run
npm run test:watch # 파일 변경 시 재실행
```

빌드 없음. `manifest.json` + `src/`를 그대로 Chrome에 로드합니다.

### 디자인 문서

- [docs/design/00-requirements.md](docs/design/00-requirements.md) — 요구사항
- [docs/design/01-architecture.md](docs/design/01-architecture.md) — 아키텍처
- [docs/design/02-data-flow.md](docs/design/02-data-flow.md) — 데이터 흐름
- [docs/design/03-components.md](docs/design/03-components.md) — 구성요소
- [docs/design/04-testing.md](docs/design/04-testing.md) — 테스트 전략

## 9. 알려진 제한

- **본문 wrapper 의존**: `[data-pressable-container]` 속성이 사라지면 셀렉터 업데이트 필요
- **답글 분리**: 원작자가 이어 단 답글까지 본문에 통합. 다른 사용자의 댓글은 제외
- **이미지 CDN 인증**: 일부 시점에서 Instagram CDN이 인증을 요구하면 이미지 다운로드가 실패할 수 있음 → 노트 하단에 `<!-- 이미지 N개 누락 -->` 주석으로 표기
- **HTTPS 자체서명 인증서**: Chrome service worker fetch에서 막히는 경우가 흔함 → HTTP 27123 사용 권장
