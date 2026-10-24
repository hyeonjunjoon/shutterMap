---
category: integration-issues
tags: [jsdom, vitest, testing-methodology, form-validation, browser-gap, qa, react]
related_files:
  - web/app/login/login-form.tsx
  - web/app/register/register-form.tsx
  - web/app/login/page.regression-1.test.tsx
---

# jsdom은 `required`/`minlength` 네이티브 팝업을 안 띄운다 — 실 브라우저에서만 터지는 버그

## 문제
로그인/가입 폼에 커스텀 한글 에러 메시지(이메일 형식, 비밀번호 길이)를 만들어두고 jsdom 기반 vitest에서 31개 테스트가 전부 통과했는데, `/qa`를 바이너리(실제 헤드리스 브라우저, gstack의 `$B`)로 돌리자마자 실제로는 전혀 다른 일이 벌어졌다: `type="email"`이나 `minLength`가 걸린 `<input>`에서 브라우저 자체의 네이티브 유효성 검사 팝업이 뜨면서, 그 팝업이 **영어**로 표시되고 우리 커스텀 React 에러 핸들링은 전혀 호출되지 않았다(`submit` 이벤트 자체가 브라우저에 의해 막힘).

## 원인
jsdom은 `type="email"`의 형식 거부는 구현하지만, `required`/`minlength` 위반 시 실제 Chromium처럼 폼 제출을 막고 팝업을 띄우는 네이티브 동작까지는 구현하지 않는다. 그래서 단위 테스트(jsdom)에서는 "커스텀 에러가 잘 뜬다"로 보이고 통과하지만, 실제 브라우저에서는 네이티브 검증이 커스텀 핸들러보다 먼저 끼어들어 완전히 다른(그리고 로캘도 영어인) 경험을 만든다. **jsdom 환경에서의 "통과"가 실제 브라우저 동작을 보증하지 않는 대표적인 간극.**

## 해결책
모든 인증 폼에 `<form noValidate>`를 추가해 브라우저 네이티브 검증을 완전히 끄고, 모든 검증을 JS로 직접 재구현했다:
- 이메일 형식: `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- 비밀번호 길이: `password.length < 8`

둘 다 한글 메시지로 처리. 재검증은 jsdom 유닛 테스트뿐 아니라 실제 `$B` 브라우저로 다시 열어서 `document.activeElement`, 화면에 보이는 메시지 언어, `submit` 동작까지 직접 확인했다.

## 다음 작업 전 체크할 것
- [ ] **폼에 `required`/`minlength`/`pattern`/`type="email"` 같은 네이티브 HTML5 검증 속성을 쓰면서 커스텀 에러 UI도 같이 쓸 거라면, 반드시 `noValidate`를 추가하고 그 검증을 JS로 동일하게 재구현한다.** 둘을 같이 쓰면 브라우저가 먼저 가로챈다.
- [ ] **jsdom(vitest/jest) 단위 테스트가 전부 통과해도, 네이티브 브라우저 동작(폼 제출 가로채기, 팝업, 포커스 이동)이 걸린 기능은 실제 헤드리스/실 브라우저로 한 번은 반드시 재확인한다.** jsdom의 "구현 안 함"은 조용히 넘어가서 unit test green이 거짓 안심을 준다.
- [ ] 폼 검증 관련 버그를 찾을 때 `/qa`를 "바이너리(실 브라우저)로" 돌리라는 지시가 있으면 가장 먼저 네이티브 검증 속성이 있는 폼부터 의심한다 — 이번처럼 재현율이 높다.
