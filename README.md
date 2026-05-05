# threads-clipper

Threads에서 본인이 리포스트한 게시물을 Obsidian vault에 저장하는 Chrome 확장프로그램.

## 동작 방식

1. Threads의 개별 게시물 페이지(`threads.com/@user/post/...`)를 연다
2. 확장 아이콘 클릭 또는 `Ctrl+Shift+S` 단축키
3. 게시물 본문 + 작성자가 이어쓴 댓글들 + 이미지를 추출
4. Obsidian Local REST API 플러그인을 통해 vault의 `Thread/` 폴더에 노트 1개 + 폴더 1개로 저장

## 사전 요구사항

- Obsidian 데스크톱 앱 (개인 사용 무료)
- Obsidian "Local REST API" 커뮤니티 플러그인 설치 및 활성화

## 문서

- [docs/design/](docs/design/) — 디자인 문서 (요건, 아키텍처, 데이터 흐름 등)

## 상태

설계 단계.
