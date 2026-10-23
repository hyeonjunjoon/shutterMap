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
- **클라이언트 클러스터링**: supercluster (radius 60px, maxZoom 16 — 표준 웹맵 zoom 스케일 기준, 카카오맵 자체 `level`과는 다른 값. §7.1 "레벨/줌 변환" 참고)
- **인증**: NestJS가 httpOnly 쿠키로 세션 발급. Next.js는 JWT를 자체 검증하지 않고 매 요청 `GET /auth/me`로 NestJS에 검증을 위임한다 — "인증 로직은 전부 NestJS"라는 원칙을 Next.js 쪽에서 깨지 않기 위함.

이 브레인스토밍에서 새로 정한 것:
- **Next.js App Router** (Pages Router 아님 — 레거시 대비 이점 없음, 별도 질문 없이 기본값으로 채택)
- **Tailwind CSS + shadcn/ui** — 분량 있는 디자인 스펙 없이 바로 컴포넌트 구축. 색상/폰트/radius 토큰은 `/design-consultation`으로 가볍게 정했음([`docs/designs/DESIGN.md`](../../designs/DESIGN.md) 참고)
- **TanStack Query** — 서버 상태(API 호출 결과) 관리. `isLoading`/`isError`/`data` 상태가 화면마다 필요한 로딩/에러 상태를 그대로 제공해서, 매 화면에서 직접 짜지 않아도 됨
- **레포 구조**: 같은 git 레포에 `web/` 폴더를 사이블링으로 추가(별도 레포 아님) — NestJS/Next.js가 HTTP로만 통신하고 공유 코드가 없어서, 한 레포에서 clone/관리가 더 간단

탐색(`/`) 화면 브레인스토밍(2026-10-22)에서 추가로 정한 것:
- **nuqs** — URL search params 기반 필터/탭/지도 center·zoom 상태 관리. `history`(push/replace)·`scroll`·디바운스(`limitUrlUpdates`) 옵션이 이 화면이 필요로 하는 요구사항(§7.1)과 거의 그대로 맞아떨어져서, 직접 구현 대비 테스트해야 할 엣지케이스(여러 필터 동시 변경 시 히스토리 배치, 디바운스-URL 갱신 레이스)가 훨씬 줄어든다고 판단. `npm view nuqs dist-tags` 확인: `latest 2.10.2`, peerDependencies `next >=14.2.0` / `react ^19.0.0-0` — 현재 스택(Next 16.4.0, React 19.3.0)과 호환.
- **supercluster** — §2에 이미 있던 결정 그대로 유지, 좌표 변환·레벨 변환 세부는 §7.1 참고.
- **shadcn Drawer**(`npx shadcn add drawer`) — 모바일 필터 바텀시트용. 아직 미설치.

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
- **다크 모드 기본, 완전 무채색**(2026-10-16 로그인/가입 사이클에서 앰버 포인트 컬러 폐기 → 흑백 최종 확정, `DESIGN.md` 결정 히스토리 참고). 이 문서의 "앰버 포인트 컬러" 언급은 전부 stale — 전역 포인트 컬러는 없음.
- 본문/제목: Pretendard(제목은 Black/ExtraBold 굵기). EXIF 숫자 데이터: IBM Plex Mono + `tabular-nums`
- Radius: UI 요소 8px, 사진 이미지 2px (별도 토큰 `--radius-photo`)

`web/` 스캐폴드 시 `docs/designs/globals.css`를 `web/app/globals.css`로 그대로 복사한다.

**지도 마커(2026-10-22 추가)**: 무채색 원칙 유지 — 기본 핀은 검정 채움+흰 테두리 단색. 색으로 상태를 구분하지 않고, 선택된 핀만 **값 반전(흰 채움+검정 테두리) + 1.3배 확대**로 구분한다(새 컬러 토큰 없음, WCAG "색으로만 구분하지 않기" 원칙과도 맞음).

**카카오맵 다크 테마 미지원(알려진 트레이드오프, 2026-10-22)**: 카카오맵 JS SDK는 다크 타일을 지원하지 않는다. CSS `filter: invert()` 같은 방식은 지도 가독성(글자/핀 색)까지 같이 뒤집혀서 쓰지 않고, 지도 영역은 밝은 타일 그대로 두고 둥근 모서리 컨테이너로 주변 다크 UI와 시각적 경계만 준다. Phase 2에서 지도 공급자 교체 등으로 재검토 가능.

**접근성 대안(2026-10-22)**: 지도는 드래그/캔버스 기반이라 완전한 키보드·스크린리더 접근성을 MVP에서 보장하지 않는다. 키보드/스크린리더 사용자는 같은 데이터를 시맨틱 HTML 그리드로 제공하는 **갤러리 탭을 접근성 대안으로 쓴다** — 이걸 명시적 설계 결정으로 둔다(지도 자체를 접근성 대응하려 하지 않음).

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
- 로딩: 지도 틀/썸네일 그리드 스켈레톤(갤러리는 고정 비율 스켈레톤, 아래 참고). 필터 드롭다운은 `equipment` 로딩 중엔 비활성화
- 빈 상태: 조건에 맞는 사진이 없으면 "아직 이 조건에 맞는 사진이 없습니다" (PRD 기능4/8 수용기준 문구 그대로 사용)
- 에러: 토스트 + 재시도 버튼. 지도 뷰에서 위경도 형식 에러(400)는 발생하지 않아야 정상(카카오맵이 항상 유효한 뷰포트를 주므로) — 발생하면 버그로 간주하고 로그
- 권한없음: 없음(전면 공개 열람). 좋아요 버튼은 이 화면에 없음(상세 페이지 전용)

**URL 상태 (2026-10-22 추가, nuqs)**
- 필터(카메라/렌즈/초점거리/조리개, 지도 탭만 촬영월) 변경: `history: 'replace'`, `scroll: false`. 숫자 입력(초점거리/조리개 min·max)에만 `limitUrlUpdates: { method: 'debounce', timeMs: 300 }` 적용 — 카메라/렌즈/월은 드롭다운 단건 선택이라 디바운스가 필요 없고 즉시 반영.
- 탭 전환(`view=map|gallery`)만 별도 훅으로 `history: 'push'`.
- 지도 center/zoom도 URL에 포함하되, 쓰기는 카카오맵 `idle` 이벤트(이동/줌이 끝나 상태가 안정된 시점 — 카카오 JS SDK의 실제 이벤트명, "moveend" 아님) 핸들러 안에서만 호출. 좌표는 소수 5자리로 반올림하고, 반올림 값이 현재 URL과 같으면 쓰기 자체를 스킵.
- 모든 파라미터의 파싱/검증(잘못된 값 → 기본값 폴백, 초점거리/조리개 min<max 같은 도메인 룰 포함)은 `web/lib/discovery-params.ts` 한 곳에 모으고 유닛테스트로 커버한다.
- TanStack Query 키는 이 파일의 파싱 결과를 정규화(기본값과 같은 필드는 제거)한 객체를 쓴다 — `cursor`는 기존 규칙대로 키에서 항상 제외.
- `useSearchParams`(nuqs 내부도 결국 이걸 씀)를 쓰는 컴포넌트는 `<Suspense>`로 감싼다 — nuqs를 쓴다고 이 Next.js 제약이 없어지지 않음.
- **모바일**: 필터 UI는 "필터" 버튼 하나로 접히고, 클릭 시 **shadcn Drawer**(바텀시트, 드래그로 닫기 지원)로 전체 필터를 보여준다. 데스크톱/태블릿은 인라인 필터 바.

**지도 뷰 기술 (2026-10-22 추가)**
- SDK 로딩: `next/script`로 `https://dapi.kakao.com/v2/maps/sdk.js?appkey=...&autoload=false`(`libraries=clusterer` 없음 — supercluster를 쓰므로 카카오 자체 클러스터러 불필요) 비동기 로드. `onLoad`가 아니라 **`onReady`** 사용 — `onLoad`는 스크립트가 처음 로드될 때 한 번만 실행되고, SPA 내에서 `/`를 떠났다가 재방문하면(스크립트 재다운로드 안 됨) 다시 실행되지 않는다. `onReady`는 로드 완료 후 + 마운트될 때마다 실행되는 next/script의 공식 설계라 재방문 시에도 지도가 생성된다.
- 키는 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`(발급 완료) — 브라우저 노출이 정상(도메인 화이트리스트로 보호되는 공개 키), 백엔드의 `requireEnv()` 규칙은 NestJS 한정이라 여기엔 적용 안 됨.
- 핀 재조회: PRD 4-3 플로우에 재검색 버튼이 없어 **버튼 없이 `idle`에서 자동 재조회**. 요청 bbox는 뷰포트보다 가로/세로 각 20% 넓게 패딩.
- `/discovery/map`은 최대 2000개까지 최신순으로 잘라서 응답(잘렸다는 표시 없음, `docs/api.md`). 응답 길이가 2000이면(길이 기반 휴리스틱) 지도 위에 "확대하면 더 많은 작례가 보여요" 배너를 표시.
- 지도 쿼리는 `placeholderData: keepPreviousData`(TanStack Query v5) — 뷰포트 이동 중 이전 핀이 그대로 보여서 깜빡임 없음.
- **좌표 변환**: 카카오 `LatLng(lat, lng)` ↔ GeoJSON/supercluster `[lng, lat]`(경도 먼저, 순서 반대) 변환은 `web/lib/geo-convert.ts`의 `toGeoJSONPoint`/`toKakaoLatLng` 두 함수로 통일하고 라운드트립 유닛테스트를 둔다. 이 두 함수 밖에서는 좌표 순서를 직접 다루지 않는다.
- **레벨/줌 변환 (2026-10-23 스파이크로 실측 확정)**: 카카오맵 `level`은 1~14, 숫자가 작을수록 확대(가까이)·클수록 축소(멀리) — supercluster/표준 웹맵 `zoom`과 방향이 반대고 범위도 다르다. PRD의 "maxZoom 16"은 카카오 level일 수 없음(최대가 14라 16이 존재하지 않음) — supercluster 자체 기본값이 `maxZoom: 16`인 것과 일치하므로, **supercluster에 직접 넣는 표준 zoom 값**으로 해석한다. 실제 카카오맵(`map.getBounds()`)을 레벨 1~14 전부 띄워 위경도 범위를 미터로 환산 후 표준 Web Mercator 공식(`meters/pixel = 156543.034·cos(lat)/2^zoom`)으로 역산한 결과, **`standardZoom ≈ 20 - kakaoLevel`**(역방향 `kakaoLevel ≈ 20 - standardZoom`, 반올림 후 1~14로 클램프)이 전 구간에서 최대 오차 0.15 이내로 맞아떨어졌다 — supercluster의 픽셀 radius 기반 클러스터링엔 무시 가능한 오차. `web/lib/geo-convert.ts`에 `kakaoLevelToZoom`/`zoomToKakaoLevel` 두 함수로 추가하고 유닛테스트.
- 마커 렌더링: 카카오 네이티브 `Marker`는 이미지 아이콘만 받아 CSS로 못 꾸민다. **개별 핀**은 흑백 SVG를 data URI로 만들어 `kakao.maps.MarkerImage`에 전달(정적 1개). **클러스터 배지**(개수가 매번 다름)는 `kakao.maps.CustomOverlay`(HTML div, 원형+흰 숫자)로 렌더링, 클릭 시 해당 좌표로 줌인. 클러스터 계산은 `supercluster({ radius: 60, maxZoom: <스파이크로 확정한 값> })`.
- jsdom 한계: 지도 자체(DOM/Canvas 렌더링)는 유닛테스트로 검증 불가(`docs/solutions/integration-issues/jsdom-vs-browser-native-form-validation-gap.md`와 같은 종류의 간극) — `geo-convert.ts`/`discovery-params.ts`의 순수 함수만 유닛테스트하고, 실제 지도 렌더/핀 클릭/클러스터 확장은 구현 뒤 `/qa`·`/design-review`의 실 브라우저 검증으로 분리한다.

**갤러리 뷰 + 상세 placeholder 기술 (2026-10-22 추가)**
- 무한스크롤: `useInfiniteQuery`(`initialPageParam: null`, `getNextPageParam: (last) => last.nextCursor`), `cursor`가 `null`이면 요청 쿼리스트링에 그 키 자체를 안 넣는다. sentinel에 네이티브 `IntersectionObserver`(`rootMargin: '600px'`, `hasNextPage && !isFetchingNextPage` 가드) — 별도 라이브러리 불필요.
- 정렬(`sort=latest|likes`, PRD 기능8 전용, 갤러리에만 있음)이나 정규화된 필터 전체가 바뀌면 그리드 스크롤을 맨 위로 리셋.
- 썸네일 그리드: `Photo`에 width/height 컬럼이 없어(DB에도 저장 안 함, 업로드 시 sharp로 리사이즈만 하고 치수는 안 남김 — `TODOS.md` 기록) 원본 비율을 알 수 없다. **고정 비율(4:3) 컨테이너 + `object-fit: contain`**(크롭 없이 레터박스)으로 이 갭을 회피 — 스켈레톤도 같은 고정 비율이라 레이아웃 시프트 자체가 없다.
- **사진 상세는 이번 사이클엔 placeholder만**: 이미지(원본 비율 그대로, `<img style={{width:'100%',height:'auto'}}>` — 치수를 몰라 Next `<Image>`의 width/height·fill 대신 일반 `<img>`) + 카메라/렌즈/초점거리/조리개/셔터스피드/ISO만. 좋아요/신고/삭제/수정/소유자 전용 UI는 **다음 사이클**(§7.2 전체 내용 참고, 그때 클라이언트 컴포넌트로 승격). `params`는 Next 16 규칙대로 `Promise`로 받아 `await`. 404는 `notFound()`(→ 전역 `app/not-found.tsx`), 그 외 `!res.ok`는 `throw`(→ 전역 `app/error.tsx`, 한국어 문구 + 다시 시도). 둘 다 전역 파일로 신규 작성(이 화면만을 위한 전용 에러 UI 없음).
- 서버 컴포넌트로 직접 `fetch`하므로 쿠키가 안 실린다 — `likedByMe`가 로그인 여부와 무관하게 항상 `false`로 보이는 영향은 placeholder 범위에선 무해(좋아요 버튼이 없음), 다음 사이클 TODO로 `TODOS.md`에 기록됨. (본인 비공개(`HIDDEN`) 사진의 404는 쿠키와 무관한 백엔드의 기존 설계 — `GET /photos/:id`는 owner 여부 체크 없이 `status !== 'ACTIVE'`면 항상 404, 본인 사진은 `GET /photos/me`로 별도 조회.)

**알려진 갭 (범위 밖, `TODOS.md` 기록)**
- `cameraName`/`lensName`은 업로드 시 EXIF 원문이 기본값이라(`photo-upload.service.ts`), 매핑 테이블 없이 사용자가 직접 고치지 않으면 필터 드롭다운에 "ILCE-7M4" 같은 원문이 그대로 보일 수 있음 — PRD 7-1절이 이미 Phase 2로 못박아둔 정규화 문제, 이번 사이클에서 고치지 않음.

### 7.2 `/photos/[id]` — 사진 상세

**2026-10-22 추가**: 탐색 화면 플랜(§7.1)에서 이 라우트의 **placeholder만** 먼저 만든다(이미지+EXIF 읽기 전용, 서버 컴포넌트). 아래 전체 내용(좋아요/신고/소유자 기능)은 **다음 사이클**에서 클라이언트 컴포넌트로 승격하며 구현한다 — 지금은 라우트가 아예 없어 탐색 화면의 썸네일/핀 클릭이 404로 가는 걸 막는 최소 범위.

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
- **전역 에러 UI (2026-10-22 추가)**: `app/error.tsx`(Next.js Error Boundary, Client Component, 한국어 "문제가 생겼어요" 류 문구 + `reset()` 호출하는 다시 시도 버튼)와 `app/not-found.tsx`(`notFound()`가 트리거, "찾을 수 없습니다" 류 문구)를 전역 1개씩만 두고, 화면별 전용 에러 UI를 따로 만들지 않는다(§7.1 상세 placeholder가 첫 사용처).

## 9. 범위 밖 (이번 스펙에서 다루지 않음)

- 카카오맵 API 키/OAuth 앱 등록 같은 외부 서비스 설정 — 구현 단계에서 별도 처리
- 배포 타겟(Vercel 등) — 화면/플로우 설계와 무관, 필요해지면 별도 결정
- PRD 7-1 Phase 2 후보 전부(시간대 필터, 장비 별칭 매핑, 팔로우, 제휴 링크 등) — 명시적으로 MVP 범위 밖

## 10. 참고 문서

- [`docs/PRD.md`](../../PRD.md) — 기능 명세, 수용 기준
- [`docs/api.md`](../../api.md) — 전체 API 레퍼런스(요청/응답/에러 포맷/인증 방식)
- [`docs/designs/DESIGN.md`](../../designs/DESIGN.md), [`docs/designs/globals.css`](../../designs/globals.css) — 디자인 토큰
- [`docs/solutions/`](../../solutions/) — 백엔드 구현 중 겪은 문제와 해결책(프론트에서 백엔드 동작을 가정할 때 참고)
