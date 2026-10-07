---
category: database-issues
tags: [email-normalization, postgresql, case-sensitivity, collation]
related_files:
  - src/auth/auth.service.ts
---

# /qa에서 발견: 이메일 대소문자 다르면 로그인 실패

## 문제
`CaseTest@Example.com`으로 가입한 뒤 `casetest@example.com`(소문자)으로 로그인하면 "이메일 또는 비밀번호가 올바르지 않습니다"로 거부됐다. 실제 사용자가 자동완성/다른 기기/습관 차이로 매번 겪을 수 있는 상황이다.

## 원인
이메일을 저장/조회 전에 정규화하지 않았다. Postgres의 기본 collation은 `=` 비교가 대소문자 구분이라, `CaseTest@Example.com`과 `casetest@example.com`은 DB 입장에서 완전히 다른 값이다.

## 해결책
`AuthService`에 `normalizeEmail(email) { return email.trim().toLowerCase(); }`를 추가하고, 이메일을 저장하거나 조회하는 모든 지점(`register`, `login`, `findOrCreateSocialUser`)에서 저장/조회 직전에 항상 이 함수를 통과시켰다.

## 다음 작업 전 체크할 것
- [ ] **이메일을 다루는 새 코드(프로필 수정, 비밀번호 찾기 등)를 추가할 때는 반드시 `normalizeEmail`을 거친다.** 새 테이블/쿼리에 이메일 컬럼이 생기면 저장 전에 정규화하는 걸 기본값으로 삼는다.
- [ ] 비슷하게 "사람이 입력하지만 시스템은 정확히 일치시켜야 하는" 값(아이디, 태그 등)을 다룰 때도 대소문자/공백 정규화를 미리 생각한다.
