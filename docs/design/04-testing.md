# 04 — 테스팅 전략

소규모 개인 도구이므로 **테스트는 적게, 가치 있는 곳에만**. 과도한 테스트 인프라는 피한다.

## 테스트 계층

| 계층 | 대상 | 도구 | 자동화 |
|---|---|---|---|
| **단위 테스트** | 순수 로직 (마크다운 조립, 폴더명 sanitize) | Vitest | 자동 |
| **통합 테스트** | Obsidian API 클라이언트 (mock fetch) | Vitest | 자동 |
| **수동 E2E** | 실제 Threads + 실제 Obsidian 동작 확인 | 체크리스트 | 수동 |
| **회귀 점검** | Threads UI 변경 감지 | Snapshot 비교 | 반자동 |

## 1. 단위 테스트 (자동)

### 대상: 순수 함수

#### `markdown-builder.js`

| 케이스 | 입력 | 기대 출력 |
|---|---|---|
| 본문만 있는 segment 1개 | `{ segments: [{ text: "안녕", images: [] }] }` | frontmatter + `# 안녕\n\n안녕` |
| 이미지 1개 포함 | `{ segments: [{ text: "...", images: ["img1.jpg"] }] }` | 본문 + `![[img1.jpg]]` |
| 이어쓴 segment 다수 | segments 3개 | 각 segment가 `---` 구분자로 분리 |
| 이미지 누락 표시 | `missingImages: [1]` | 본문 끝에 `<!-- 이미지 1개 누락 -->` |
| 첫줄에 마크다운 특수문자 | `text: "# Hello"` | 그대로 사용 (사용자가 의도한 형식이므로 escape 안 함) |

#### `folder-name.js`

| 케이스 | 입력 | 기대 출력 |
|---|---|---|
| 정상 케이스 | `{postedAt:"2026-05-04", author:"@user", firstLine:"안녕"}` | `2026-05-04 @user 안녕` |
| 첫줄 30자 초과 | 50자 문자열 | 30자 + `...` 또는 단순 잘라내기 |
| 금지문자 포함 | `firstLine:"a/b\\c:d"` | `a b c d` (sanitize) |
| 빈 첫줄 | `firstLine:""` | `2026-05-04 @user untitled` |
| 작성자 핸들에 특수문자 | `@a/b` | sanitize 적용 |

`resolveCollision`은 통합 테스트로.

### 도구 선택

**Vitest** 사용 — 가장 가볍고 모던. ESM 네이티브.
- `package.json`만 있으면 됨, 별도 빌드 설정 불필요
- `npm test` 한 줄로 실행
- chrome API mock은 `globalThis.chrome = { storage: ... }` 식으로 setup 파일에서 직접 주입 (별도 라이브러리 불필요)

---

## 2. 통합 테스트 (자동, mock 사용)

### 대상: `obsidian-client.js`

`global.fetch`를 mock 처리하고 다음 시나리오 검증:

| 시나리오 | 검증 |
|---|---|
| `putMarkdown` 정상 | URL/메서드/헤더/body 정확한지 |
| `putBinary` 정상 | Content-Type이 image MIME인지, body가 Blob인지 |
| `getNote` 404 | `null` 반환 |
| 401 (토큰 잘못됨) | 명시적 에러 throw |
| 네트워크 오류 (fetch reject) | 에러 메시지에 "Obsidian 미실행" 힌트 포함 |
| `listFolder` 빈 폴더 | 빈 배열 반환 |

### 대상: `folder-name.js` 의 `resolveCollision`

mock client로 `listFolder` 결과 시뮬레이션:

| 시나리오 | 기대 |
|---|---|
| 충돌 없음 | base name 그대로 |
| `(2)`까지 존재 | `(3)` 반환 |

---

## 3. 수동 E2E (체크리스트)

자동화하기에는 비용 대비 가치가 낮음. 릴리스 직전과 selector 변경 후 수동 확인.

### 사전 준비
- [ ] Obsidian 실행, Local REST API 플러그인 활성화, 토큰 발급
- [ ] 옵션 페이지에서 토큰 입력, "연결 테스트" 통과
- [ ] 테스트용 vault에 `Thread/` 폴더 비어있는 상태

### 골든 패스 (반드시 동작)
- [ ] **이미지 없는 단일 게시물** 저장 → `Thread/{폴더}/note.md` 생성, 본문 정확
- [ ] **이미지 1개 단일 게시물** 저장 → 이미지 다운로드되고 마크다운에 `![[img1.jpg]]` 임베드
- [ ] **이미지 여러 개 + 이어쓴 댓글 2개** 저장 → 각 segment가 `---`로 구분, 이미지가 올바른 segment에 임베드
- [ ] 저장 성공 알림 클릭 → Obsidian에서 노트 열림

### 트리거
- [ ] 확장 아이콘 클릭으로 저장
- [ ] `Ctrl+Shift+S` 단축키로 저장
- [ ] 피드 페이지(`threads.com/@user`)에서 단축키 → "개별 게시물 페이지에서만 동작" 알림

### 에러 케이스
- [ ] **Obsidian 종료 상태**에서 저장 시도 → "Obsidian을 켜주세요"
- [ ] **잘못된 토큰**으로 저장 → "API 토큰을 확인하세요"
- [ ] **빈 토큰**으로 저장 → "설정에서 API 토큰 입력"
- [ ] **이미 저장된 게시물** 다시 저장 → "이미 저장됨, 기존 노트 열기"
- [ ] **네트워크 차단** 상태에서 이미지 다운로드 실패 → 본문은 저장, 누락 코멘트 표시

### 폴더/파일 무결성 (Q5의 핵심 요구사항)
- [ ] 저장 후 vault 안의 폴더를 다른 위치로 통째로 이동 → Obsidian에서 노트 열고 이미지가 모두 정상 표시되는지 확인
- [ ] 폴더명 충돌 케이스: 일부러 같은 이름의 폴더를 미리 만들고 저장 → ` (2)` suffix 동작 확인

---

## 4. 회귀 감지 (Threads UI 변경 대응)

DOM 스크래핑은 Threads UI 변경에 깨지기 쉬움. 자동 감지를 위한 가벼운 스냅샷 비교:

### 방법 1: 추출 결과 스냅샷
- 알려진 게시물 URL 1~2개를 fixture로 보관
- HTML 스냅샷을 저장 (`tests/fixtures/post-{id}.html`)
- `extractPost`를 이 HTML에 대해 실행 → 결과 JSON을 골든 파일과 비교
- 골든 파일이 깨지면 selector 또는 DOM 변경 신호

### 방법 2: 단순 모니터링
- 월 1회 수동으로 골든 패스 1번 실행
- 깨지면 이슈 발행 후 selector 갱신

→ **개인 도구 기준으로는 방법 2가 충분**. 방법 1은 시간 여유 있을 때 추가.

---

## 5. 빌드 / 실행 환경

- **번들러 없음**: ESM 모듈로 작성, Chrome MV3가 그대로 로드 (`type: "module"`)
- **개발 흐름**:
  1. `chrome://extensions` → "압축 해제된 확장 프로그램 로드" → 프로젝트 루트 선택
  2. 코드 수정 시 새로고침 버튼 클릭으로 즉시 반영
- **테스트 실행**: `npm test` (Vitest) 또는 `node --test`
- **린트**: 선택. 시작 시점에는 생략, 필요하면 추가.

---

## 6. 테스트 우선순위 (구현 시)

1. **마크다운 조립 단위 테스트 먼저** — 가장 쉽고 핵심 (이게 깨지면 사용자 데이터가 망가짐)
2. **폴더명 sanitize 단위 테스트** — Windows 파일명 안정성
3. **Obsidian 클라이언트 통합 테스트** — 401/404/네트워크 에러 처리
4. **수동 E2E 체크리스트** — 릴리스 전 1회
5. **회귀 스냅샷** — 시간 남으면

이 순서대로 가면 가치 큰 것부터 커버.
