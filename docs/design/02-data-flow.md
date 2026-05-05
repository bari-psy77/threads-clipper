# 02 — 데이터 흐름

사용자가 단축키 누른 순간부터 Obsidian vault에 파일이 생성되기까지의 단계별 흐름.

## Sequence Diagram

```
User           Background SW       Content Script     Obsidian API       Threads CDN
 │                  │                    │                  │                 │
 │  Ctrl+Shift+S    │                    │                  │                 │
 ├─────────────────▶│                    │                  │                 │
 │                  │                    │                  │                 │
 │                  │ ① URL 검증         │                  │                 │
 │                  │ (post 페이지인가?)  │                  │                 │
 │                  │                    │                  │                 │
 │                  │ ② extract 명령     │                  │                 │
 │                  ├───────────────────▶│                  │                 │
 │                  │                    │ ③ DOM 파싱       │                 │
 │                  │                    │ (텍스트, 이미지   │                 │
 │                  │                    │   URL, 메타)      │                 │
 │                  │ ④ 추출 결과 JSON   │                  │                 │
 │                  │◀───────────────────┤                  │                 │
 │                  │                    │                  │                 │
 │                  │ ⑤ 설정 로드        │                  │                 │
 │                  │ (chrome.storage)    │                  │                 │
 │                  │                    │                  │                 │
 │                  │ ⑥ 중복 검사        │                  │                 │
 │                  ├──────────────────────────────────────▶│                 │
 │                  │ GET 폴더 목록      │                  │                 │
 │                  │◀──────────────────────────────────────┤                 │
 │                  │                    │                  │                 │
 │                  │ ⑦ 폴더명 생성      │                  │                 │
 │                  │ (sanitize, 충돌 회피)│                 │                 │
 │                  │                    │                  │                 │
 │                  │ ⑧ 이미지 다운로드  │                  │                 │
 │                  ├────────────────────────────────────────────────────────▶│
 │                  │◀────────────────────────────────────────────────────────┤
 │                  │                    │                  │                 │
 │                  │ ⑨ 폴더 생성        │                  │                 │
 │                  ├──────────────────────────────────────▶│                 │
 │                  │ ⑩ 이미지 업로드    │                  │                 │
 │                  ├──────────────────────────────────────▶│                 │
 │                  │ ⑪ note.md 생성/업로드                  │                 │
 │                  ├──────────────────────────────────────▶│                 │
 │                  │                    │                  │                 │
 │  ⑫ 성공 알림     │                    │                  │                 │
 │◀─────────────────┤                    │                  │                 │
 │                  │                    │                  │                 │
 │  ⑬ 알림 클릭     │                    │                  │                 │
 ├─────────────────▶│                    │                  │                 │
 │                  │  obsidian://open?vault=...&file=...    │                 │
 │                  │  (Obsidian이 노트를 띄움)               │                 │
```

## 단계별 상세

### ① URL 검증
- `chrome.tabs.query({active: true, currentWindow: true})`로 현재 탭 URL 획득
- 정규식 `^https://www\.threads\.com/@[^/]+/post/[^/]+/?$`로 게시물 페이지인지 확인
- 매칭 안 되면 → 알림 "개별 게시물 페이지에서만 작동합니다" → 종료

### ② extract 명령
- `chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_POST' })`
- 응답 timeout: 10초

### ③ DOM 파싱 (Content Script)
- 원 게시물 article 요소 찾기 (selector는 [04-scraping.md] 참조)
- 다음을 추출:
  - 작성자 핸들 (`@username`)
  - 게시일 (ISO 8601)
  - 본문 텍스트
  - 본문 이미지 URL 목록
- 작성자가 자기 자신에게 단 답글들 순서대로 수집:
  - 각 답글의 작성자 핸들이 원 게시물 작성자와 같은지 비교
  - 본문 + 이미지 URL 목록 추출
- 다른 사람의 답글은 무시

### ④ 추출 결과 JSON
Content Script → Background로 보내는 데이터 형식:

```json
{
  "ok": true,
  "post": {
    "url": "https://www.threads.com/@user/post/abc123",
    "author": "@user",
    "posted_at": "2026-05-04T18:23:00Z",
    "segments": [
      {
        "text": "원 게시물 본문...",
        "images": ["https://cdn.threads.com/.../img1.jpg"]
      },
      {
        "text": "이어쓴 댓글 1...",
        "images": ["https://cdn.threads.com/.../img2.jpg"]
      },
      {
        "text": "이어쓴 댓글 2...",
        "images": []
      }
    ]
  }
}
```

추출 실패 시:
```json
{ "ok": false, "error": "post_not_found" }
```

### ⑤ 설정 로드
- `chrome.storage.sync.get(['apiHost', 'apiToken', 'folder'])`
- `apiToken` 비어있으면 → 알림 "설정에서 API 토큰을 입력하세요" → 종료

### ⑥ 중복 검사
- 폴더명을 먼저 생성 (⑦ 미리 수행)
- `GET {apiHost}/vault/{folder}/` 로 기존 폴더 목록 조회
- 같은 게시물 URL을 frontmatter `source`로 가진 노트가 있는지 확인:
  - 단순화: **폴더명이 이미 존재하면** 그 안의 `note.md`의 frontmatter `source`를 확인
  - 같으면 → 알림 "이미 저장됨" + 클릭 시 기존 노트 열기 → 종료
  - 다르면 (드물지만 동일 폴더명 충돌) → ⑦에서 suffix 추가

### ⑦ 폴더명 생성
- 형식: `{YYYY-MM-DD} {@username} {첫줄 최대 30자}`
- 첫 segment의 첫 줄을 30자로 자르기 (단어 경계 우선)
- Windows 금지문자 `\ / : * ? " < > |` 제거
- 폴더명 충돌 시 ` (2)`, ` (3)` 자동 suffix

### ⑧ 이미지 다운로드
- 각 이미지 URL을 `fetch(url)` → `blob()` 로 가져옴
- 이미지 파일명: 순서대로 `img1.jpg`, `img2.jpg`, ... (확장자는 Content-Type 또는 URL 끝에서 추론)
- 일부 실패 시: 그 이미지 인덱스를 누락 목록에 기록 (⑪에서 코멘트로 표시)

### ⑨ 폴더 생성
- `POST {apiHost}/vault/Thread/{폴더명}/` (디렉토리 생성)
- Local REST API에 디렉토리 생성 엔드포인트가 직접 없으면 `note.md`를 PUT하는 것만으로 디렉토리가 자동 생성됨 (⑪에서 처리)

### ⑩ 이미지 업로드
- 각 이미지에 대해:
  - `PUT {apiHost}/vault/Thread/{폴더명}/img{N}.{ext}`
  - Content-Type: 원본 image/* MIME
  - Body: 이미지 binary (Blob)
  - Headers: `Authorization: Bearer {apiToken}`

### ⑪ note.md 생성/업로드
- 추출 결과를 마크다운으로 조립 (frontmatter + segments + 이미지 임베드 + `---` 구분자)
- 누락된 이미지가 있으면 본문 끝에 `<!-- 이미지 N개 누락 -->` 추가
- `PUT {apiHost}/vault/Thread/{폴더명}/note.md`
- Content-Type: `text/markdown`
- Body: 마크다운 텍스트
- Headers: `Authorization: Bearer {apiToken}`

### ⑫ 성공 알림
- `chrome.notifications.create()`로 알림:
  - 제목: "Obsidian에 저장됨"
  - 본문: 폴더명
  - 클릭 핸들러 등록: 클릭 시 ⑬ 동작

### ⑬ 알림 클릭 → 노트 열기
- `chrome.tabs.create({ url: "obsidian://open?vault={vault}&file=Thread/{폴더명}/note.md" })`
  - 또는 `obsidian://advanced-uri` 사용
- vault 이름은 옵션 페이지에서 입력받아 chrome.storage에 저장 (옵션에 추가 필요)

## 에러 분기

각 단계에서 실패할 수 있고, 실패 시 흐름:

| 단계 | 실패 사유 | 사용자 알림 |
|---|---|---|
| ① | 게시물 페이지 아님 | "개별 게시물 페이지에서만 동작" |
| ② / ③ | content script 로드 실패 / DOM 추출 실패 | "페이지 새로고침 후 재시도" |
| ⑤ | 토큰 없음 | "설정에서 API 토큰 입력" |
| ⑥ | API 응답 없음 | "Obsidian을 켜주세요" |
| ⑥ | 중복 발견 | "이미 저장됨, 기존 노트 열기" 버튼 |
| ⑧ | 이미지 다운로드 실패 (일부) | (조용히 진행, 노트 끝에 코멘트) |
| ⑩ / ⑪ | 업로드 실패 | "Obsidian 저장 실패: {에러 메시지}" |

## 트랜잭션 / 부분 실패 정책

- **부분 업로드 허용**: 이미지 일부가 누락돼도 note.md는 저장. 누락 정보는 본문에 코멘트.
- **note.md 저장이 실패하면**: 이미 업로드된 이미지를 롤백하지는 않음. 폴더에 고아 이미지가 남을 수 있음. 사용자가 다시 시도하면 같은 폴더명에 덮어쓰기 (이건 Q9의 중복 처리와 모순될 수 있어서, 실제로는 임시 폴더명으로 시도 후 마지막에 rename하거나, note.md를 먼저 만든 뒤 이미지를 채우는 순서가 더 안전 — 구현 시 확정).
