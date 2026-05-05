# Threads Clipper

Threads 게시물을 Obsidian vault에 노트로 저장하는 Chrome MV3 확장프로그램.

원작자가 이어 쓴 답글까지 한 노트에 합쳐 저장하고, 본문 이미지를 vault 안에 함께 업로드해 `![[…]]` 임베드로 연결합니다.

## 주요 기능

- 단축키 `Ctrl+Shift+S` 또는 확장 아이콘으로 한 번에 저장
- 원작자의 본문 + 이어 답글을 하나의 노트로 통합
- 본문 이미지 자동 다운로드 후 vault 안에 저장 (CDN 의존 X)
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
    └── img2.jpg
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
```

## 폴더 구조

```
threads-clipper/
├── manifest.json              # MV3 매니페스트
├── icons/                     # 확장 아이콘 (16/48/128)
├── src/
│   ├── background/            # service worker, Obsidian 클라이언트, 노트 빌더
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

- Threads의 한국어 UI 키워드(`인기순`, `활동 보기`, `님에게 답글 남기기`)에 의존하는 필터 일부 → 영어 UI에서는 추가 필터 필요
- `[data-pressable-container]` 셀렉터에 의존 → Threads DOM 변경 시 [src/content/scrape.js](src/content/scrape.js) 셀렉터 업데이트 필요
- 자체서명 인증서(HTTPS 27124)는 Chrome service worker에서 막히는 경우가 있음 → 보통 HTTP 27123 권장 (자세한 내용 [guide.md](guide.md))

## 문서

- [guide.md](guide.md) — 사용자 가이드 (설치/설정/사용/트러블슈팅)
- [docs/design/](docs/design/) — 디자인 문서

## 라이선스

미정 (개인 용도)
