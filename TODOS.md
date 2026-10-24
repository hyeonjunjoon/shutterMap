# TODOS

## web-design-guidelines 점검에서 미룬 사소한 항목 (2026-10-16, `/login`, `/register`)

Critical/Important는 전부 수정·커밋됨(`3a99b85`). 아래는 영향이 작아서 보류.

- [ ] `<meta name="theme-color">` 없음 — `web/app/layout.tsx`. 모바일 브라우저 주소창 색이 페이지 배경(다크)과 안 맞음.
- [ ] 장식용 아이콘 `<img alt="">`에 `aria-hidden="true"` 없음 — `web/app/login/page.tsx` 카카오/구글 심볼 `<img>` 2곳. `alt=""`만으로도 대체로 충분하지만 가이드는 둘 다 요구.
- [ ] 로딩 중 실제 스피너 없이 텍스트만 바뀜("로그인 중…" 등) — `web/app/login/page.tsx`, `web/app/register/page.tsx`. 가이드는 스피너를 명시.
- [ ] 메인 콘텐츠 스킵 링크 없음 — 지금은 단일 페이지 유틸리티 폼이라 영향 작음, 화면이 늘어나면 재검토.

## 탐색(`/`) 화면 브레인스토밍에서 미룬 항목 (2026-10-22)

- [ ] 상세 페이지 서버 컴포넌트의 fetch는 쿠키를 안 실어서 `likedByMe`가 로그인 여부와 무관하게 항상 false로 보임 — 다음 사이클(좋아요 버튼 추가 시) 클라이언트 컴포넌트로 승격하거나 서버에서 쿠키를 forward해야 함. (본인 HIDDEN 사진 404는 쿠키와 무관한 기존 백엔드 설계이므로 버그 아님 — 혼동 방지용으로 같이 적어둠)
- [ ] `Photo`에 width/height 컬럼이 없어서 갤러리 그리드가 원본 비율을 모름 — 업로드 사이클에서 sharp 메타데이터로 저장 + 기존 사진 백필 필요.
- [ ] 카메라/렌즈 표기 정규화는 PRD 7-1절 Phase 2. 단 표기가 다르면 필터에서 사진이 누락되는 데이터 분산 문제이므로, 업로드 사이클에서 카메라·렌즈 입력칸에 `/discovery/equipment` 기존 값 자동완성 제안을 넣어 완화할 것.

## 탐색 갤러리+상세 placeholder 플랜 최종 리뷰에서 미룬 Minor 항목 (2026-10-24)

Critical 0건, Important 5건은 전부 수정·커밋됨. 아래는 fresh reviewer가 Minor로 분류한 것.

- [ ] `/photos/[id]`가 `id`를 URL 인코딩 없이 그대로 API 경로에 붙임 — `web/app/photos/[id]/page.tsx`. `%2F`, `%3F` 등으로 경로/쿼리 조작 가능(공개 API, 쿠키 없음이라 영향은 낮음). `encodeURIComponent(id)` 적용.
- [ ] `minAperture=1e400`처럼 극단적인 숫자 URL 값이 `Infinity`/`1e+23` 같은 값으로 파싱·직렬화돼 백엔드 400으로 이어짐(조용한 폴백이 아니라 에러 화면) — `web/lib/discovery-params.ts`의 `normalizeRange`. `Number.isFinite` 체크 추가.
- [ ] 사진 상세 placeholder가 `<Suspense fallback={null}>`이라 로딩 중 빈 화면 — `web/app/photos/[id]/page.tsx`. §7.2는 스켈레톤 카드를 요구. 또한 Suspense 안에서 streaming 이후 `notFound()`를 부르면 소프트 404(HTTP 200)가 됨 — placeholder 범위에선 허용 가능.
- [ ] `/` 페이지도 `<Suspense fallback={null}>`라 초기 정적 HTML이 빈 화면 — `web/app/page.tsx`. 탭/스켈레톤 fallback을 주면 깜빡임이 줄어듦.
- [ ] 갤러리 다음 페이지 로딩 중 표시(스피너 등)와 "더 이상 없음" 상태 표시가 없음 — `web/app/gallery-view.tsx`.
- [ ] `normalizeDiscoveryFilters`가 `sort`를 기본값이어도 항상 쿼리 키에 포함시킴 — §7.1은 "기본값과 같은 필드는 제외"라고 돼 있음. 캐시 키 자체는 일관되게 동작해 무해하지만 스펙 문구와 어긋남.
- [ ] 필터 바의 초점거리 입력이 `parseAsInteger`라 소수(35.5)를 입력하면 URL엔 반올림된 36이 쓰이는데 그 순간의 fetch는 35.5로 나감(한 틱 동안 상태 불일치) — `web/app/filter-bar.tsx`. `step="1"` 또는 `Math.round` 적용 검토.
- [ ] 백엔드가 `servingUrl`/`thumbnailUrl`을 빈 문자열로 줄 수 있는 경우(키 누락) `<img src="">`가 그대로 렌더링됨 — `web/app/photo-card.tsx`, `web/app/photos/[id]/photo-detail-card.tsx`.

## 탐색 갤러리 web-design-guidelines 점검에서 미룬 항목 (2026-10-24)

hover/lazy-loading 등 즉시 수정 가능한 건 바로 고침(discovery-view.tsx, photo-card.tsx). 아래는 보류.

- [ ] 갤러리 무한스크롤 목록이 50개 넘게 쌓이면 가상화가 없음(`web/app/gallery-view.tsx`) — `virtua` 등 도입 검토. 이번 사이클은 요청량이 적어 체감 영향 작음.
- [ ] 사진 상세 placeholder의 메인 이미지(`web/app/photos/[id]/photo-detail-card.tsx`)는 width/height도, aspect-ratio 컨테이너도 없음("원본 비율 그대로"가 의도된 설계) — 실제 레이아웃 시프트(CLS) 발생 가능. width/height 백필(이미 기록된 항목)이 끝나면 같이 해결됨.
- [ ] 필터 바의 `<select>`가 `bg-transparent`라 Windows 다크모드에서 OS 기본(흰) 드롭다운 배경이 노출될 수 있음(`web/app/filter-bar.tsx`) — Windows 환경에서 직접 확인 필요.
