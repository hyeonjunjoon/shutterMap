---
category: database-issues
tags: [prisma-schema, unique-constraint, oauth, requirements-mismatch]
related_files:
  - prisma/schema.prisma
  - src/auth/auth.service.ts
---

# 스키마 자체가 PRD 요구사항과 충돌한 사례 (이메일 전역 unique)

## 문제
최종 리뷰(Superpowers 서브에이전트)에서: 로컬 계정과 같은 이메일로 카카오 로그인을 하면 500 에러가 났다.

## 원인
`schema.prisma`의 `User.email`이 **전역 unique**로 선언돼 있었다. 그런데 PRD 기능6 / 이 플랜의 Review Focus #4는 "소셜 로그인은 로컬 계정과 이메일이 같아도 **별도 계정**을 만들어야 한다(이메일로 병합하지 않는다)"고 명시하고 있었다. 즉 **스키마 자체가 이미 합의된 요구사항과 충돌**하는 상태였는데, 모킹된 유닛 테스트만으로는 이걸 못 잡았다(DB의 실제 unique 제약은 모킹 대상이 아니었으니까).

## 해결책
`email`의 전역 `@unique`를 제거하고, `@@unique([provider, email])`로 바꿨다 — "같은 provider 안에서만" 이메일이 유일하면 된다. `LOCAL`+a@b.com과 `KAKAO`+a@b.com은 이제 별도 계정으로 공존 가능하다. `register`/`login`의 조회 쿼리도 `provider_email` 복합키를 쓰도록 같이 고쳤다.

## 다음 작업 전 체크할 것
- [ ] **스키마에 unique/제약을 걸 때는, PRD/기능 명세의 수용 기준과 실제로 충돌하지 않는지 먼저 대조한다.** (이번엔 PRD에 이미 답이 있었는데 스키마를 짤 때 반영이 안 됐다.)
- [ ] 이런 종류의 버그는 **모킹된 유닛 테스트로는 안 잡힌다** — 실제 DB에 붙는 e2e 테스트가 있어야 발견된다. Prisma 모델에 unique 제약을 추가/변경하면, 그 제약이 실제로 걸리는 경로를 최소 하나는 실제 DB로 테스트한다.
- [ ] 앞으로 사진/장비 등 새 테이블에 unique 제약을 걸 때도, "이게 정말 전역으로 유일해야 하는가, 아니면 어떤 범위(사용자별, provider별 등) 안에서만 유일해야 하는가"를 먼저 따로 질문한다.
