# ShutterMap 프론트엔드 설계

**상태**: 브레인스토밍 완료, 사용자 승인 대기
**Spec 대상**: `web/` (신규 Next.js 프로젝트, 이 레포의 사이블링 폴더)
**관련 문서**: [`docs/PRD.md`](../../PRD.md), [`docs/api.md`](../../api.md), [`docs/designs/DESIGN.md`](../../designs/DESIGN.md)

## 1. 배경과 목표

백엔드(NestJS, Auth/Photos/Discovery/Engagement 4개 모듈)는 PRD MVP 범위(기능 1~9) 기준으로 구현이 끝났다. 프론트는 이제부터 신규 구축이며, 이 문서는 "사용자 흐름 → 화면 → 화면별 API 호출 → 화면별 로딩/빈 상태/에러/권한없음 상태"를 플랜 작성 전에 전부 명확히 해서, 구현 단계에서 화면 설계를 다시 고민하지 않게 하는 게 목적이다.

PRD 4장(Flow)이 이미 사용자 흐름 4개(사진 등록×2, 지도 탐색, 갤러리 탐색)를 정의해뒀고, 이 문서는 그걸 실제 라우트/컴포넌트/API 호출 단위로 번역한다.

## 2. 스택 결정

PRD 5장에서 이미 확정된 것:
- **Next.js** — 순수 UI 렌더링과 라우팅만. API Route Handlers는 쓰지 않고, 모든 비즈니스 로직은 NestJS로 통일.
- **카카오맵 JS SDK** (위치 검색은 카카오 로컬 API)
- **클라이언트 클러스터링**: supercluster (radius 60px, maxZoom 16)
- **인증**: NestJS가 httpOnly 쿠키로 세션 발급. Next.js는 JWT를 자체 검증하지 않고 매 요청 `GET /auth/me`로 NestJS에 검증을 위임한다 — "인증 로직은 전부 NestJS"라는 원칙을 Next.js 쪽에서 깨지 않기 위함.

이 브레인스토밍에서 새로 정한 것:
- **Next.js App Router** (Pages Router 아님 — 레거시 대비 이점 없음, 별도 질문 없이 기본값으로 채택)
- **Tailwind CSS + shadcn/ui** — 분량 있는 디자인 스펙 없이 바로 컴포넌트 구축. 색상/폰트/radius 토큰은 `/design-consultation`으로 가볍게 정했음([`docs/designs/DESIGN.md`](../../designs/DESIGN.md) 참고)
- **TanStack Query** — 서버 상태(API 호출 결과) 관리. `isLoading`/`isError`/`data` 상태가 화면마다 필요한 로딩/에러 상태를 그대로 제공해서, 매 화면에서 직접 짜지 않아도 됨
- **레포 구조**: 같은 git 레포에 `web/` 폴더를 사이블링으로 추가(별도 레포 아님) — NestJS/Next.js가 HTTP로만 통신하고 공유 코드가 없어서, 한 레포에서 clone/관리가 더 간단

## 3. 레포 구조

```
shutter-map/            (기존 NestJS 레포 루트)
├── src/                (기존 NestJS 백엔드)
├── test/                ...
├── docs/                ...
└── web/                 (신규 — Next.js 프론트)
    ├── app/
    ├── components/
    ├── lib/
    └── ...
```

`web/`은 독립된 `package.json`을 갖고(npm workspace 불필요 — 공유 의존성 없음), 백엔드와는 `NEXT_PUBLIC_API_BASE_URL` 환경변수로만 연결된다.

## 4. 인증 흐름

- 로그인/가입 성공 시 NestJS가 `Set-Cookie: session=<JWT>` (httpOnly, 7일)를 심는다 — Next.js의 fetch/axios는 `credentials: 'include'`로 쿠키를 같이 보내야 한다.
- **Next.js는 JWT를 열어보지 않는다.** 로그인 여부는 항상 `GET /auth/me` 호출 결과로 판단한다 (200=로그인, 401=비로그인).
- **미들웨어(`middleware.ts`)**: `session` 쿠키의 "존재 여부"만 가볍게 확인해서, 없으면 보호된 라우트(`/upload`, `/me`)를 `/login`으로 보낸다. 이건 검증이 아니라 빈 페이지 로드를 막는 UX 최적화일 뿐이다 — 쿠키가 있어도 위조/만료됐을 수 있으므로, 실제 유효성은 페이지가 로드된 뒤 `GET /auth/me`가 다시 확인한다. 이렇게 역할을 나눠야 "인증 검증은 전부 NestJS" 원칙이 깨지지 않는다.
- **전역 로그인 상태**: `GET /auth/me`를 TanStack Query로 쿼리키 `['me']`에 캐싱해서 앱 전역에서 공유한다. 이 쿼리의 401은 에러로 취급하지 않고 "비로그인"이라는 정상 상태로 변환한다(쿼리 함수 안에서 401을 캐치해 `null`을 반환).
- **다른 요청의 401**: 공통 fetch 래퍼에서 가로채서 "로그인이 필요합니다" 토스트를 띄우고 로그인 화면으로 유도한다. (`/auth/me` 자체의 401과는 다르게 처리 — 혼동하지 않는다.)

## 5. 디자인 토큰

[`docs/designs/DESIGN.md`](../../designs/DESIGN.md), [`docs/designs/globals.css`](../../designs/globals.css)에 이미 확정:
- 다크 모드 기본, 완전 무채색 배경 + 앰버 포인트 컬러(버튼/좋아요/지도 마커)
- 본문/제목: Pretendard(제목은 Black/ExtraBold 굵기). EXIF 숫자 데이터: IBM Plex Mono + `tabular-nums`
- Radius: UI 요소 8px, 사진 이미지 2px (별도 토큰 `--radius-photo`)

`web/` 스캐폴드 시 `docs/designs/globals.css`를 `web/app/globals.css`로 그대로 복사한다.

## 6. 화면 인벤토리

PRD 4장 플로우 기준. 지도/갤러리는 PRD가 "탭 전환 + 필터 상태 공유"라고 명시하므로 같은 라우트의 두 뷰로 묶는다 — 필터는 URL search params로 들고 다녀서(예: `?view=map&cameraName=ILCE-7M4&minLat=...`), 탭을 전환해도 필터가 유지되고 URL 자체가 북마크/공유 가능해진다. API 자체가 이미 쿼리 파라미터 기반이라 별도 클라이언트 상태 스토어 없이 URL이 곧 필터 상태의 source of truth가 된다.

| 라우트 | 화면 | 로그인 필요 |
|---|---|---|
| `/` | 탐색 (지도⇄갤러리 탭) | 아니오 |
| `/photos/[id]` | 사진 상세 | 아니오 (액션만 필요) |
| `/upload` | 업로드 마법사 | 예 |
| `/login` | 로그인 | 아니오 |
| `/register` | 회원가입 | 아니오 |
| `/me` | 마이페이지 | 예 |
| (모달) 신고 | `/photos/[id]` 안에서 열림 | 예 |

## 7. 화면별 상세: API 호출 + 상태

각 화면이 호출하는 API는 전부 [`docs/api.md`](../../api.md)에 정의돼 있다 — 요청/응답 형태, 에러 포맷(`{statusCode, message, error}`, `message`는 string 또는 string[])은 그 문서가 단일 소스다. 여기서는 화면별로 "어떤 API를 언제 부르는지"와 "로딩/빈 상태/에러/권한없음을 어떻게 다루는지"만 정리한다.

### 7.1 `/` — 탐색 (지도 ⇄ 갤러리)

**API**
- `GET /discovery/map` (뷰=지도) 또는 `GET /discovery/gallery` (뷰=갤러리) — URL search params를 그대로 쿼리 파라미터로 전달
- `GET /discovery/equipment` — 진입 시 1회, 카메라/렌즈 필터 드롭다운 옵션

**상태**
- 로딩: 지도 틀/썸네일 그리드 스켈레톤. 필터 드롭다운은 `equipment` 로딩 중엔 비활성화
- 빈 상태: 조건에 맞는 사진이 없으면 "아직 이 조건에 맞는 사진이 없습니다" (PRD 기능4/8 수용기준 문구 그대로 사용)
- 에러: 토스트 + 재시도 버튼. 지도 뷰에서 위경도 형식 에러(400)는 발생하지 않아야 정상(카카오맵이 항상 유효한 뷰포트를 주므로) — 발생하면 버그로 간주하고 로그
- 권한없음: 없음(전면 공개 열람). 좋아요 버튼은 이 화면에 없음(상세 페이지 전용)

### 7.2 `/photos/[id]` — 사진 상세

**API**
- `GET /photos/:id` — `likedByMe` 포함, 비로그인도 200
- `POST /photos/:id/like` — 좋아요 버튼 클릭 시 토글
- `POST /photos/:id/reports` — 신고 모달에서 제출
- 본인 사진일 때만(`photo.userId === me.id`):
  - `DELETE /photos/:id` — 삭제 버튼
  - `PATCH /photos/:id/visibility` — 공개범위 변경
  - `PATCH /photos/:id/metadata` — EXIF/메모 수정

**상태**
- 로딩: 스켈레톤 카드(이미지 영역 + 텍스트 placeholder)
- 빈 상태: 해당 없음(단일 리소스)
- 에러: `GET /photos/:id`가 404면 "사진을 찾을 수 없습니다" 전용 안내 화면(존재하지 않거나 삭제/비공개 처리됨, 둘을 구분해서 알려주지 않음 — 백엔드가 구분 안 함). 그 외 5xx는 토스트+재시도
- 권한없음: 좋아요/신고 버튼 클릭 시 비로그인이면 401 → "로그인이 필요합니다" 토스트 + 로그인 유도(해당 액션은 적용 안 됨). 소유자 전용 버튼(삭제/수정/공개범위)은 비소유자에겐 렌더링 자체를 안 함 — 403을 받고 숨기는 게 아니라 애초에 버튼을 안 보여줌(클라이언트에서 `me.id` 비교로 조건부 렌더링)

### 7.3 `/upload` — 업로드 마법사

PRD 플로우 4-1(GPS 있음)/4-2(GPS 없음)을 하나의 마법사로 구현하고, GPS 유무에 따라 스텝이 분기한다.

**단계와 API**
1. 파일 선택 → `POST /photos` (파일당 EXIF 자동 파싱, 응답에 미리보기 필드 전부 포함)
2. (보유 장비 미확인 상태면, 즉 `GET /auth/me`의 `ownedCameraName`이 `null`이면) 확인 모달 → `PATCH /auth/me`
3. 사진별 미리보기: EXIF 파싱값 확인/수정 → `PATCH /photos/:id/metadata` (카메라/렌즈 입력란은 `GET /discovery/equipment` 결과로 자동완성)
4. GPS가 없던 사진만: 지도에서 위치 직접 지정 → `PATCH /photos/:id/location` (건너뛸 수 없음, PRD 기능2 수용기준)
5. 공개범위 선택(기본값 FUZZY) → `PATCH /photos/:id/visibility`
6. 완료 → `/photos/[id]` 또는 `/me`로 이동

**상태**
- 로딩: 1단계는 업로드 프로그레스 바(파일 크기 기준), 이후 단계는 각 PATCH 호출 중 버튼 스피너
- 빈 상태: 해당 없음
- 에러: `POST /photos`의 400(디코딩 실패)/413(용량)/415(형식)은 파일별 인라인 에러로 표시하고 배치 전체가 거부됐음을 안내(부분 성공 없음, 백엔드가 이미 보장). 4단계에서 위치를 지정하지 않고 다음으로 진행 시도하면 클라이언트에서 막고 안내 문구 표시(PRD 기능2 수용기준 — 백엔드 호출 자체를 안 보냄)
- 권한없음: 비로그인으로 `/upload` 접근 시 즉시 `/login`으로 리다이렉트(미들웨어 1차 + 페이지 로드 후 `/auth/me` 401이면 2차 리다이렉트)

### 7.4 `/login`, `/register`

**API**
- `POST /auth/login`
- `POST /auth/register` (성공 시 가입과 동시에 로그인 상태 — 추가 로그인 호출 불필요)
- `GET /auth/kakao`, `GET /auth/google` — fetch가 아니라 `<a href>` 전체 페이지 이동(서버가 OAuth 제공자로 302 리다이렉트)

**상태**
- 로딩: 제출 버튼 스피너
- 빈 상태: 해당 없음
- 에러: 로그인 401(이메일/비밀번호 불일치, 어느 쪽인지 구분 안 함 — 그대로 안내), 가입 400(형식오류)/409(이미 가입된 이메일) 인라인 폼 에러
- 권한없음: 반대로, 이미 로그인된 상태에서 `/login`·`/register` 접근 시 `/`로 리다이렉트(선택적 UX, 막지 않아도 치명적이지 않음)

### 7.5 `/me` — 마이페이지

**API**
- `GET /auth/me` — 보유 장비 표시, 비어있으면 확인 유도 배너
- `GET /photos/me` — 내 사진 목록(cursor 페이지네이션)
- `DELETE /photos/:id` — 각 항목의 삭제 버튼
- `PATCH /auth/me` — 보유 장비 변경

**상태**
- 로딩: 목록 스켈레톤(썸네일 그리드)
- 빈 상태: "아직 업로드한 사진이 없습니다" + "업로드하기" 버튼(→ `/upload`)
- 에러: 목록 조회 실패 토스트+재시도. 삭제 실패 시 해당 항목만 토스트로 알리고 목록에서 제거하지 않음(낙관적 업데이트 금지 — 실패 시 되돌릴 상태가 애매해지는 걸 피함)
- 권한없음: 비로그인 접근 시 `/login` 리다이렉트. 목록의 각 사진은 `status: 'HIDDEN'`이면 "비공개 처리됨" 배지 표시(운영자 조치, `docs/api.md` 참고)

### 7.6 신고 모달 (`/photos/[id]` 안에서)

**API**
- `POST /photos/:id/reports`

**상태**
- 로딩: 제출 버튼 스피너
- 빈 상태: 해당 없음
- 에러: 400(사유 미선택, 또는 `reason=OTHER`인데 내용 없음/공백뿐) 인라인 폼 에러. 401이면 모달이 열리기 전에 이미 로그인 유도로 처리(아래 권한없음 참고)
- 권한없음: 비로그인 상태에서 신고 버튼 클릭 시 모달을 열지 않고 즉시 로그인 유도(API를 부르기 전에 클라이언트에서 `me` 캐시로 먼저 막음 — 401을 받고서야 아는 게 아니라)

## 8. 전역 처리 방침

- **서버 상태**: TanStack Query. 쿼리 키는 `web/lib/query-keys.ts` 한 곳에서 관리한다(2026-10-12 engineering review로 수정). 컨벤션: `queryKeys.me` → `['me']`, `queryKeys.photo(id)` → `['photo', id]`, `queryKeys.discovery.map(filters)`/`queryKeys.discovery.gallery(filters)` → `['discovery', 'map'|'gallery', filtersObject]`, `queryKeys.discovery.equipment` → `['discovery', 'equipment']`, `queryKeys.photosMine(filters?)` → `['photos', 'mine']`(또는 필터가 있다면 `['photos', 'mine', filtersObject]`). **cursor/페이지 파라미터는 절대 키에 넣지 않는다** — `useInfiniteQuery`는 키를 하나로 고정하고 cursor를 `pageParam`으로만 받는다. 키에 cursor를 넣으면(이전 버전의 실수) 페이지마다 별도 캐시 엔트리가 생겨 `useInfiniteQuery`의 pages 누적을 못 쓰게 된다 — 마이페이지 목록과 갤러리 무한스크롤 둘 다 해당.
- **에러 메시지 파싱**: 공통 함수 하나(`extractErrorMessage(response)`)가 `message`의 string/string[] 둘 다 처리해서 사용자에게 보여줄 문자열(또는 배열 join)로 변환한다. 화면마다 따로 처리하지 않는다.
- **401 처리**: TanStack Query의 `QueryClient`에 등록하는 `queryCache`/`mutationCache`의 전역 `onError` 콜백이 처리한다(2026-10-12 engineering review로 구체화 — `apiClient`를 감싸는 훅이 아니다). 예외: `['me']` 쿼리 자체의 401은 이 콜백을 타지 않고 쿼리 함수 내부에서 `null`로 변환(무한 루프/토스트 스팸 방지). `onError`는 `ApiError`가 아닌 raw 네트워크 에러도 받을 수 있다는 것, 401은 기본 재시도(3회) 대상에서 빼야 한다는 것을 구현 시 같이 처리한다.
- **라우트 가드**: §4 참고 — `proxy.ts`(Next.js 16부터 `middleware.ts`가 deprecated, 2026-10-12 확인 — 가벼운 쿠키 존재 체크) + 페이지 레벨 `/auth/me` 재확인의 2단 구조.
- **업로드 진행률**: `fetch` 기반 공용 `apiClient`는 업로드 진행률 이벤트를 지원하지 않는다 — 업로드 화면(§7.3)은 `apiClient`를 재사용하지 않고 `XMLHttpRequest` 기반 별도 함수를 쓴다(2026-10-12 engineering review로 결정).

## 9. 범위 밖 (이번 스펙에서 다루지 않음)

- 카카오맵 API 키/OAuth 앱 등록 같은 외부 서비스 설정 — 구현 단계에서 별도 처리
- 배포 타겟(Vercel 등) — 화면/플로우 설계와 무관, 필요해지면 별도 결정
- PRD 7-1 Phase 2 후보 전부(시간대 필터, 장비 별칭 매핑, 팔로우, 제휴 링크 등) — 명시적으로 MVP 범위 밖

## 10. 참고 문서

- [`docs/PRD.md`](../../PRD.md) — 기능 명세, 수용 기준
- [`docs/api.md`](../../api.md) — 전체 API 레퍼런스(요청/응답/에러 포맷/인증 방식)
- [`docs/designs/DESIGN.md`](../../designs/DESIGN.md), [`docs/designs/globals.css`](../../designs/globals.css) — 디자인 토큰
- [`docs/solutions/`](../../solutions/) — 백엔드 구현 중 겪은 문제와 해결책(프론트에서 백엔드 동작을 가정할 때 참고)
