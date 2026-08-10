# Threads Clipper

Threads 게시물을 Obsidian vault에 노트로 저장하는 Chrome MV3 확장프로그램.

원작자가 이어 쓴 답글까지 한 노트에 합쳐 저장하고, 본문 이미지·동영상을 vault 안에 함께 업로드해 `![[…]]` 임베드로 연결합니다.

## 주요 기능

- 단축키 `Ctrl+Shift+S` 또는 확장 아이콘으로 한 번에 저장
- 원작자의 본문 + 이어 답글을 하나의 노트로 통합
- 본문 이미지 자동 다운로드 후 vault 안에 저장 (CDN 의존 X)
- 동영상 게시물도 놓치지 않음 — 파일로 받을 수 있으면 `vidN.mp4`로 저장, 받을 수 없으면 썸네일(`vidN-poster.jpg`)·재생 길이·원본 링크를 남김 ([아래](#동영상은-어디까지-저장되나) 참고)
- Threads 헤더(작성자/시간/카테고리), 액션바(좋아요·댓글·리포·공유), UI 텍스트 자동 제외
- 프로필 사진은 노트에서 자동 제외 (본문 이미지만 남김)
- 폴더 충돌 시 source URL 비교 → 동일 게시물이면 중복 저장 방지, 다른 게시물이면 `(2)`, `(3)` 자동 추가

## 빠른 시작

1. **Obsidian Local REST API 플러그인** 설치 + 활성화 (Settings → Community plugins)
2. **이 저장소를 클론**
   ```powershell
   git clone <repo-url> threads-clipper
   ```
3. Chrome → `chrome://extensions/` → **개발자 모드 ON** → **압축해제된 확장 프로그램 로드** → 클론한 폴더 선택
4. 확장 옵션 페이지에서 **API Host / API Token / Vault 이름 / 폴더** 입력 → **Test connection** 통과
5. Threads에서 게시물(`threads.com/@user/post/...`) 열고 **`Ctrl+Shift+S`**

자세한 단계는 [guide.md](guide.md) 참고.

## 저장되는 노트 형식

```
Thread/
└── 2026-05-04 [사업하는 스친이들 주목]/
    ├── 2026-05-04 [사업하는 스친이들 주목].md
    ├── img1.jpg
    ├── img2.jpg
    ├── vid1-poster.jpg   ← 스트리밍 전용 동영상의 썸네일
    └── vid2.mp4          ← 파일 URL이 노출된 동영상
```

노트 파일명은 폴더명과 동일하게 저장됩니다 (Obsidian 그래프 뷰에서 구분 가능).

마크다운 예:
```markdown
---
source: https://www.threads.com/@user/post/...
author: "@user"
posted_at: 2026-05-04T15:27:48.000Z
saved_at: 2026-05-05T10:23:30.869Z
tags: [threads]
---

# [사업하는 스친이들 주목]

며칠전에 클로드 크레딧 1만달러 받았어.
준비물, 링크는 댓글에!

![[img1.jpg]]

> [!info] 동영상 (0:42)
> ![[vid1-poster.jpg]]
> 스트리밍 전용(blob:/HLS)이라 동영상 파일을 저장하지 못했습니다 — [원본에서 보기](https://www.threads.com/@user/post/...)

---

![[vid2.mp4]]
```

## 동영상은 어디까지 저장되나

Threads 플레이어는 대부분 **MediaSource(DASH 조각 재조립)** 로 재생합니다. 이때 `<video>`의 `src`는
`blob:https://www.threads.com/…` 형태이고, 이 blob URL은 실제 파일이 아니라 메모리 버퍼 핸들이라
`fetch()`로 다시 받을 수 없습니다(확장 프로그램이든 페이지 스크립트든 동일). 즉 **동영상 원본을 항상
파일로 저장하는 것은 불가능**합니다.

그래서 이 확장은 얻을 수 있는 것만, 대신 반드시 남깁니다.

| 페이지가 노출한 것 | 노트에 저장되는 것 |
|---|---|
| `video[src]` 또는 `<source src>`가 평문 `https://…mp4` | 동영상 파일 다운로드 → `vidN.mp4` + `![[vidN.mp4]]` 임베드 |
| `blob:` / `.m3u8` / `.mpd` (스트리밍 전용) | `poster` 썸네일 → `vidN-poster.jpg` + 재생 길이·설명·**원본 게시물 링크** 콜아웃 |
| 썸네일조차 없음 | 재생 길이·**원본 게시물 링크** 콜아웃 (동영상 존재 사실은 항상 기록) |

동영상이 있었는데 노트에는 아무 흔적도 없는 상황은 발생하지 않습니다. 파일로 저장하지 못한 개수는
노트 끝에 `<!-- 동영상 N개 파일 저장 실패 — 링크만 기록 -->` 주석으로 요약됩니다.

DRM 해제, 스트림 조각 재조립, 로그인·인증 우회는 하지 않습니다. 페이지가 이미 불러온 URL만 사용합니다.

## 폴더 구조

```
threads-clipper/
├── manifest.json              # MV3 매니페스트
├── icons/                     # 확장 아이콘 (16/48/128)
├── src/
│   ├── background/            # service worker, Obsidian 클라이언트, 미디어 업로더, 노트 빌더
│   ├── content/scrape.js      # Threads 페이지 DOM 추출 (IIFE)
│   ├── options/               # 설정 페이지
│   └── shared/settings.js     # 설정 저장소 (chrome.storage.sync)
├── docs/
│   ├── design/                # 디자인 문서 (요건/아키텍처/데이터흐름/구성요소/테스트)
│   └── superpowers/plans/     # 구현 계획
├── guide.md                   # 사용자 가이드 (상세)
└── README.md
```

## 개발

테스트:
```powershell
npm install
npm test           # vitest run
npm run test:watch
```

빌드 단계는 없음 — 파일을 그대로 Chrome에 압축해제 로드.

## 알려진 제한

- **동영상 원본 파일은 대부분 저장 불가** — 스트리밍(blob:/HLS/DASH) 재생분은 썸네일 + 원본 링크만 남음 (위 [동영상은 어디까지 저장되나](#동영상은-어디까지-저장되나) 참고)
- 동영상 자막·오디오 트랙·재생목록 품질 선택은 수집하지 않음. 재생 길이는 화면의 `mm:ss` 배지 또는 로드된 메타데이터가 있을 때만 기록
- 이미지·동영상 CDN URL은 서명이 붙어 만료됨 → 노트에 남는 원본 미디어 URL은 시간이 지나면 열리지 않음(원본 게시물 링크는 유효)
- UI 텍스트 필터는 한국어(`인기순`, `활동 보기`, `님에게 답글 남기기`)·영어(`Top`, `View activity`, `Reply to …`) 키워드 기준 → 다른 언어 UI에서는 추가 필터 필요
- `[data-pressable-container]` 셀렉터에 의존 → Threads DOM 변경 시 [src/content/scrape.js](src/content/scrape.js) 셀렉터 업데이트 필요
- 자체서명 인증서(HTTPS 27124)는 Chrome service worker에서 막히는 경우가 있음 → 보통 HTTP 27123 권장 (자세한 내용 [guide.md](guide.md))

## 문서

- [guide.md](guide.md) — 사용자 가이드 (설치/설정/사용/트러블슈팅)
- [docs/design/](docs/design/) — 디자인 문서

## 라이선스

미정 (개인 용도)
