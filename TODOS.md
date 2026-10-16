# TODOS

## web-design-guidelines 점검에서 미룬 사소한 항목 (2026-10-16, `/login`, `/register`)

Critical/Important는 전부 수정·커밋됨(`3a99b85`). 아래는 영향이 작아서 보류.

- [ ] `<meta name="theme-color">` 없음 — `web/app/layout.tsx`. 모바일 브라우저 주소창 색이 페이지 배경(다크)과 안 맞음.
- [ ] 장식용 아이콘 `<img alt="">`에 `aria-hidden="true"` 없음 — `web/app/login/page.tsx` 카카오/구글 심볼 `<img>` 2곳. `alt=""`만으로도 대체로 충분하지만 가이드는 둘 다 요구.
- [ ] 로딩 중 실제 스피너 없이 텍스트만 바뀜("로그인 중…" 등) — `web/app/login/page.tsx`, `web/app/register/page.tsx`. 가이드는 스피너를 명시.
- [ ] 메인 콘텐츠 스킵 링크 없음 — 지금은 단일 페이지 유틸리티 폼이라 영향 작음, 화면이 늘어나면 재검토.
