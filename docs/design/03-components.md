# 03 — 컴포넌트 상세 & DOM 스크래핑 전략

[01-architecture.md](01-architecture.md)의 4-컴포넌트를 파일 단위로 풀어서 정리. 각 컴포넌트의 책임·인터페이스·외부 의존성을 명시.

## 디렉토리 구조

```
threads-clipper/
├── manifest.json                  ← MV3 진입점
├── src/
│   ├── content/
│   │   └── scrape.js              ← Threads DOM 추출
│   ├── background/
│   │   ├── service-worker.js      ← 진입점, 메시지 라우팅
│   │   ├── obsidian-client.js     ← Local REST API 호출
│   │   ├── media.js               ← 이미지·동영상 다운로드 + vault 업로드
│   │   ├── markdown-builder.js    ← 추출 결과 → 마크다운
│   │   ├── folder-name.js         ← 폴더명 생성·sanitize·충돌 처리
│   │   └── notify.js              ← Chrome notifications 래퍼
│   ├── options/
│   │   ├── options.html
│   │   └── options.js
│   └── shared/
│       └── settings.js            ← chrome.storage 래퍼 (background/options 공용)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── docs/
│   └── design/
└── README.md
```

## 컴포넌트별 상세

### `manifest.json` (MV3)

```json
{
  "manifest_version": 3,
  "name": "Threads Clipper",
  "version": "0.1.0",
  "description": "Save Threads reposts to Obsidian",
  "permissions": ["activeTab", "storage", "notifications", "scripting"],
  "host_permissions": [
    "https://www.threads.com/*",
    "https://*.cdninstagram.com/*",
    "https://127.0.0.1/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Save to Obsidian"
  },
  "content_scripts": [
    {
      "matches": ["https://www.threads.com/@*/post/*"],
      "js": ["src/content/scrape.js"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "src/options/options.html",
    "open_in_tab": true
  },
  "commands": {
    "save-current-post": {
      "suggested_key": { "default": "Ctrl+Shift+S" },
      "description": "Save current Threads post to Obsidian"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**주요 권한 근거:**
- `activeTab` — 현재 탭 정보 읽기
- `storage` — 설정 저장 (API URL/토큰/폴더)
- `notifications` — 결과 토스트
- `scripting` — content script 동적 주입 (manifest의 declarative content_scripts와 함께 fallback용)
- `host_permissions` Threads — 메시지 송수신
- `host_permissions` cdninstagram / fbcdn — Threads 미디어 CDN (이미지·동영상·썸네일 fetch에 필요. 동영상은 같은 CDN을 쓰므로 **추가 권한 불필요**)
- `host_permissions` 127.0.0.1 — Local REST API 호출

---

### `src/content/scrape.js` — Content Script

**책임:** 현재 Threads 게시물 페이지의 DOM에서 데이터 추출. 추출만 한다, 저장 안 함.

**인터페이스 (Message API):**

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EXTRACT_POST') {
    extractPost()
      .then(post => sendResponse({ ok: true, post }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // 비동기 응답
  }
});
```

**`extractPost()` 출력:** [02-data-flow.md](02-data-flow.md) §④의 JSON 형식.

**의존성:** 없음 (DOM API만 사용)

---

### `src/background/service-worker.js`

**책임:** 진입점. 아이콘/단축키 이벤트 수신 → URL 검증 → content script 호출 → obsidian-client로 위임 → 알림.

**핵심 함수:**

```javascript
chrome.action.onClicked.addListener(handleSave);
chrome.commands.onCommand.addListener(cmd => {
  if (cmd === 'save-current-post') handleSave();
});

async function handleSave() {
  const tab = await getCurrentTab();
  if (!isPostPage(tab.url)) return notify.warn('개별 게시물 페이지에서만 동작');
  
  const post = await scrapeTab(tab.id);
  if (!post.ok) return notify.error('페이지 새로고침 후 재시도');

  const settings = await loadSettings();
  if (!settings.apiToken) return notify.error('설정에서 API 토큰 입력');

  await saveToObsidian(post.post, settings);
}
```

**의존성:** `obsidian-client.js`, `markdown-builder.js`, `folder-name.js`, `notify.js`, `shared/settings.js`

---

### `src/background/obsidian-client.js`

**책임:** Local REST API와의 모든 HTTP 통신. URL 조립·헤더·에러 처리 캡슐화.

**공개 함수:**

```javascript
class ObsidianClient {
  constructor({ apiHost, apiToken })
  async getNote(vaultPath)              // GET, 없으면 null
  async putBinary(vaultPath, blob, mime) // PUT 이미지
  async putMarkdown(vaultPath, text)     // PUT note.md
  async listFolder(folderPath)           // GET, 폴더 내 항목 목록
}
```

**의존성:** Web API의 `fetch`만. chrome API 의존 없음 → 단위 테스트 가능.

---

### `src/background/media.js`

**책임:** 세그먼트의 이미지·동영상을 내려받아 vault에 올리고, 마크다운 조립에 필요한 파일명 매핑을 돌려줌.

**공개 함수:**

```javascript
async function uploadMedia({ client, folderPath, segments, fetchImpl })
  → { imageMap, missingImages, videoMap, posterMap, missingVideos }
```

- `fetchImpl`은 테스트 주입용(기본값은 전역 `fetch` 래퍼).
- 동영상 정책: 평문 `src`만 `vidN.{ext}`로 저장, 스트리밍 전용(blob:/m3u8/mpd)은 **fetch 시도 없이**
  `poster`만 `vidN-poster.{ext}`로 저장. 둘 다 실패하면 번호를 `missingVideos`에 남긴다.
- 개별 미디어 실패는 throw하지 않는다 — 노트 저장 자체는 계속 진행되어야 한다.

**의존성:** `obsidian-client.js`(주입) + `fetch`. chrome API 의존 없음 → 단위 테스트 가능.

---

### `src/background/markdown-builder.js`

**책임:** 추출 결과 JSON + 미디어 파일명 매핑 → 마크다운 문자열.

**공개 함수:**

```javascript
function buildMarkdown({ post, imageMap, missingImages, videoMap, posterMap, missingVideos }) → string
```

`imageMap`/`videoMap`/`posterMap`은 `{ originalUrl: localFilename }`. `missingImages`/`missingVideos`는 인덱스 배열.
동영상은 `videoMap`에 있으면 `![[vidN.mp4]]`, 없으면 참조 콜아웃(썸네일·재생 길이·설명·원본 게시물 링크)으로 렌더한다.

**의존성:** 없음. 순수 함수 → 단위 테스트 쉬움.

---

### `src/background/folder-name.js`

**책임:** 폴더명 생성·sanitize·충돌 처리.

**공개 함수:**

```javascript
function buildFolderName({ postedAt, author, firstLine }) → string
function sanitizeFolderName(name) → string  // Windows 금지문자 제거
async function resolveCollision(client, baseName) → string  // 존재 시 (2), (3) suffix
```

**의존성:** `obsidian-client.js` (충돌 검사 시).

---

### `src/background/notify.js`

**책임:** Chrome notifications 래퍼. 성공/실패 패턴 통일.

**공개 함수:**

```javascript
notify.success(message, { onClick })
notify.warn(message)
notify.error(message)
notify.duplicate({ existingPath, onOpen })
```

**의존성:** `chrome.notifications`.

---

### `src/options/options.html` + `options.js`

**책임:** 사용자 설정 입력 UI.

**입력 필드:**
- API 호스트 (기본 `http://127.0.0.1:27123`)
- API 토큰 (마스킹 input)
- 저장 폴더 (기본 `Thread`)
- vault 이름 (obsidian:// URI에 필요)
- "연결 테스트" 버튼: 실제 GET / 호출 → 응답 표시
- "저장" 버튼: chrome.storage.sync에 저장

**의존성:** `shared/settings.js`.

---

### `src/shared/settings.js`

**책임:** chrome.storage.sync 래퍼. background와 options 둘 다 사용.

```javascript
export async function loadSettings() → { apiHost, apiToken, folder, vaultName }
export async function saveSettings(settings) → void
```

기본값은 이 모듈에서 상수로 관리.

---

## DOM 스크래핑 전략

Threads는 SPA(React). DOM 구조가 자주 바뀜. **selector를 한 곳에 모으고, 의미 기반(data-*, aria-*) 우선, 시각 위치(nth-child) 회피.**

### Selector 우선순위

1. **의미 속성**: `[role="article"]`, `[aria-label]`, `[data-pressable-container]` 같은 안정적 속성
2. **링크 패턴**: `a[href*="/post/"]`로 게시물 컨테이너 찾기
3. **클래스명**: 최후 수단 (Threads는 난독화된 CSS 클래스를 씀, 자주 변경)

### 한 게시물 페이지의 구조 추정

```
threads.com/@user/post/abc123 페이지:

[원 게시물 article]
  - 작성자 정보 (header)
  - 본문 텍스트
  - 이미지들
  - 액션 바 (좋아요 등)

[답글 영역]
  - 답글 1 (작성자: @user 또는 다른 사람)
  - 답글 2
  - ...
```

### 추출 알고리즘

1. **원 작성자 식별:** URL에서 `@username` 추출 (`/^https:\/\/www\.threads\.com\/(@[^\/]+)\/post/`)
2. **모든 article 노드 수집:** `[role="article"]` 또는 동등 selector
3. **각 article에 대해:**
   - 작성자 핸들 추출 (header 영역의 첫 `a[href^="/@"]`)
   - 작성자가 원 작성자와 같으면 keep, 다르면 skip
4. **첫 article (= 원 게시물)부터 순서대로:**
   - 본문 텍스트 (가장 긴 텍스트 블록 또는 특정 구조)
   - 이미지 src 목록 (`img[src*="cdninstagram"]` 같은 패턴)
   - 작성일 (`time[datetime]` 속성)
5. **2번째 이후 같은 작성자 article**은 segment로 추가

### Selector 모듈화

`scrape.js` 내에 selector 상수를 별도 객체로:

```javascript
const SELECTORS = {
  article: '[role="article"]',
  authorLink: 'a[href^="/@"]',
  postBody: '[data-pressable-container] > div > div > span',  // 예시
  image: 'img[src*="cdninstagram.com"]',
  time: 'time[datetime]',
};
```

→ Threads UI 변경 시 이 상수만 고치면 됨.

### 무한 스크롤 / 지연 로딩 대응

개별 게시물 페이지는 보통 댓글이 짧지만, 일부 답글이 lazy-load될 수 있음:

- `document_idle`에서 추출 시작
- DOM이 안정될 때까지 짧게 대기 (300ms 후 추출 또는 MutationObserver로 안정화 감지)
- 답글 모두 펼쳐져 있는지 확인 (필요 시 "Show more" 버튼 클릭)

### 이미지 URL 처리

- Threads 이미지는 `cdninstagram.com` 또는 비슷한 CDN
- `srcset`이 있으면 가장 큰 해상도 선택
- `<img>`의 `src`가 placeholder일 수 있음 → `data-src` 또는 `srcset` 우선 확인

### 동영상 처리 (2026-08 추가)

셀렉터는 `video` 하나. 요소마다 다음을 읽는다.

| 항목 | 출처 | 비고 |
|---|---|---|
| `src` | `video[src]` → `<source src>` 순 | 평문 http(s)만 채택. `blob:`/`data:`/`.m3u8`/`.mpd`는 `null` |
| `streaming` | 위에서 평문 URL을 못 찾았는지 | `true`면 파일 저장 불가 → 참조만 |
| `poster` | `video[poster]` | 스트리밍 전용일 때 유일하게 받을 수 있는 실제 파일 |
| `duration` | `video.duration` → 래퍼(≤3단계) 안의 `mm:ss` 배지 | `preload="none"`이면 duration이 NaN |
| `alt` | `aria-label` → `alt` → `title` | |

부가 규칙:
- `poster`와 같은 URL의 `<img>`(커버가 이미지로 한 번 더 깔린 경우)는 이미지 목록에서 제외 — 중복 저장 방지
- 플레이어 래퍼 안의 `mm:ss` 배지 span은 본문 텍스트에서 제외

**하지 않는 것:** MediaSource 버퍼 가로채기, DASH/HLS 조각 재조립, `dash_manifest` 같은 내부 JSON 채굴,
DRM/인증 우회. 페이지가 DOM에 이미 노출한 URL만 사용한다.

### 폴백 전략

1. 1차: 위 selector 기반 추출
2. 실패 시: `JSON.parse` 가능한 inline JSON-LD 또는 `__NEXT_DATA__` 같은 SSR 데이터 탐색
3. 모두 실패 → 알림 "페이지 새로고침 후 재시도"

이 selector·전략은 구현 단계에서 실제 페이지 인스펙트로 확정. 본 문서는 **구조와 우선순위 원칙만** 정함.
