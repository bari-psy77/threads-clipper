# 01 — 아키텍처

## 전체 구성도

```
┌──────────────────────────────────────────────────────┐
│  Chrome Browser                                       │
│  ┌─────────────────────────────────────────┐         │
│  │ Threads.com 게시물 페이지               │         │
│  │  ┌───────────────────┐                  │         │
│  │  │ Content Script    │ ← DOM에 주입     │         │
│  │  │ (DOM 스크래핑)    │                  │         │
│  │  └─────────┬─────────┘                  │         │
│  └────────────│────────────────────────────┘         │
│               │ chrome.runtime.sendMessage           │
│               ▼                                       │
│  ┌─────────────────────────────────────────┐         │
│  │ Background Service Worker                │         │
│  │  - 아이콘 클릭 / 단축키 수신             │         │
│  │  - Content Script 호출                   │         │
│  │  - Obsidian API 호출                     │         │
│  │  - 알림 표시                             │         │
│  └─────────┬───────────────────────────────┘         │
│            │                                          │
│            │  HTTPS                                   │
│            ▼                                          │
│  ┌─────────────────────────────────────────┐         │
│  │ Options Page (설정 화면)                 │         │
│  │  - API URL / 토큰 / 폴더 설정            │         │
│  └─────────────────────────────────────────┘         │
└──────────────│───────────────────────────────────────┘
               │ HTTPS Request
               ▼
┌──────────────────────────────────────────────────────┐
│  Obsidian Desktop App                                 │
│  ┌─────────────────────────────────────────┐         │
│  │ Local REST API 플러그인                  │         │
│  │  https://127.0.0.1:27124                 │         │
│  └─────────┬───────────────────────────────┘         │
│            ▼                                          │
│  ┌─────────────────────────────────────────┐         │
│  │ Vault: Thread/2026-05-05 @user 첫줄/    │         │
│  │   ├── note.md                            │         │
│  │   ├── img1.jpg                           │         │
│  │   └── img2.jpg                           │         │
│  └─────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

## 구성 컴포넌트

| 컴포넌트 | 역할 | 파일 |
|---|---|---|
| **Content Script** | Threads 페이지에서 DOM 읽어 텍스트·이미지·메타데이터 추출 | `src/content/scrape.js` |
| **Background Service Worker** | 아이콘/단축키 이벤트 → content script 호출 → Obsidian API 호출 → 알림 | `src/background/service-worker.js` |
| **Options Page** | 설정 UI (API URL, 토큰, 폴더, 단축키 안내) | `src/options/options.html`, `src/options/options.js` |
| **Manifest** | 권한·진입점 선언 (MV3) | `manifest.json` |

## 책임 분리 원칙

- **Content Script**는 Threads DOM에만 의존. Obsidian이나 chrome.storage를 모름. 추출 결과를 message로 background에 넘김.
- **Background Service Worker**는 Threads DOM을 모름. content script가 준 추출물(JSON)과 chrome.storage의 설정으로 Obsidian API 호출만.
- **Options Page**는 chrome.storage에 설정 읽고/쓰기만. 다른 컴포넌트와 직접 통신 안 함.
- 이 분리 덕분에 Threads UI 변경 시 `scrape.js`만, Obsidian API 변경 시 `service-worker.js`만 수정.

## Manifest V3

Chrome 확장은 MV3 기반:
- `service_worker` (이벤트 기반, 비활성화 가능)
- `permissions`: `activeTab`, `storage`, `notifications`
- `host_permissions`: `https://www.threads.com/*`, `https://*/*` (이미지 다운로드용 — 좁혀질 수 있음)
- `commands`: 단축키 정의
