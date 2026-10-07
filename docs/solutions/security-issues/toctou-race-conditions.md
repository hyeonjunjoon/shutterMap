---
category: security-issues
tags: [race-condition, toctou, concurrency, prisma, find-or-create]
related_files:
  - src/auth/auth.service.ts
---

# find-or-create 패턴의 TOCTOU 레이스 — 두 번 발견됨

## 문제
같은 패턴의 버그가 두 번 나왔다.
1. (최종 리뷰에서) `AuthService.register`: `findUnique`로 이메일 존재 확인 → 없으면 `create`. 동시에 같은 이메일로 가입 요청이 두 번 오면 둘 다 "없음"을 보고 둘 다 `create`를 시도해 두 번째가 500으로 터질 수 있었다.
2. (`/review`에서, 같은 패턴을 findOrCreateSocialUser에도 적용해보고 발견) `AuthService.findOrCreateSocialUser`: 카카오/구글 콜백도 똑같이 `findUnique` → `create` 패턴이라, 동시 OAuth 콜백(더블클릭, 중복 탭)에서 같은 버그가 났다.

## 원인
"확인하고(check) → 쓴다(set)"를 분리하면, 그 사이의 시간(TOCTOU: Time-Of-Check-Time-Of-Use)에 다른 요청이 끼어들 수 있다. 사전 `findUnique` 체크만으로는 동시성 환경에서 중복 생성을 못 막는다. DB의 unique 제약(`@@unique`)만이 최종 방어선이다.

## 해결책
`create`를 먼저 시도하고, DB가 unique 제약 위반(Prisma 에러 코드 `P2002`)으로 거부하면 그걸 캐치해서:
- `register`: `ConflictException`(409)으로 변환.
- `findOrCreateSocialUser`: 경쟁에서 진 요청이 승자가 만든 레코드를 다시 `findUnique`로 조회해서 반환 (에러 없이 정상 응답).

```ts
try {
  const created = await this.prisma.user.create({ data: {...} });
  return created;
} catch (error) {
  if (isUniqueConstraintError(error)) { /* 409 또는 재조회 */ }
  throw error;
}
```

## 다음 작업 전 체크할 것
- [ ] **새 모듈(Photos, Discovery, Engagement)에서 "있으면 쓰고 없으면 만든다" 류 로직을 짤 때는, 처음부터 이 패턴(create 먼저 시도 → P2002 캐치)으로 짠다.** `findUnique` → `create` 순서로 사전 체크만 하는 코드는 기본적으로 레이스가 있다고 의심한다.
- [ ] 같은 버그를 한 곳에서 고쳤으면, **같은 파일/모듈 안에 비슷한 패턴이 또 있는지 grep해서 확인한다.** (이번에 register()만 고치고 findOrCreateSocialUser는 놓쳤다가 /review에서 다시 걸렸다.)
