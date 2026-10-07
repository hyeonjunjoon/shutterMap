---
category: security-issues
tags: [nestjs, validation, input-validation, class-validator]
related_files:
  - src/app.module.ts
  - src/auth/dto/register.dto.ts
  - src/auth/dto/login.dto.ts
---

# class-validator 데코레이터가 장식일 뿐이었던 문제

## 문제
최종 리뷰에서: `RegisterDto`/`LoginDto`에 `@IsEmail()`, `@MinLength(8)` 데코레이터를 붙여놨는데, 실제로는 전혀 검증되지 않고 있었다. `email: 'not-an-email', password: '1'`로 가입이 그대로 성공했고, 필드가 빠지면 400이 아니라 500(bcrypt가 undefined를 받아서 터짐)이 났다.

## 원인
NestJS는 `ValidationPipe`를 **명시적으로 등록해야** class-validator 데코레이터가 실제로 실행된다. 이 프로젝트엔 어디에도 등록돼 있지 않았다. 심지어 `main.ts`에만 등록했어도 안 됐을 것이다 — e2e 테스트는 `main.ts`의 `bootstrap()`을 거치지 않고 `Test.createTestingModule({ imports: [AppModule] })`으로 직접 앱을 만들기 때문이다.

## 해결책
`AppModule`의 `providers`에 `APP_PIPE` 토큰으로 전역 등록:
```ts
{ provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true }) }
```
`main.ts`가 아니라 `AppModule`에 등록해야, 실제 서버든 테스트가 만든 앱이든 둘 다 같은 파이프라인을 탄다.

## 다음 작업 전 체크할 것
- [ ] **새 DTO에 class-validator 데코레이터를 쓰는 걸로 끝났다고 생각하지 않는다** — `ValidationPipe`가 전역으로 걸려 있는지 먼저 확인한다 (이미 Auth 모듈에서 걸어놨으니 보통은 자동으로 적용되지만, 확인 습관을 들인다).
- [ ] 잘못된 입력에 대한 **e2e 테스트를 최소 하나 넣는다** (`{}` 또는 형식이 틀린 값 → 400 기대). 모킹 테스트는 파이프를 거치지 않아서 이 버그를 못 잡는다.
- [ ] 미들웨어/파이프/가드를 새로 추가할 때는, `main.ts`뿐 아니라 e2e 테스트가 만드는 앱(`Test.createTestingModule`)에도 똑같이 적용되는지 확인한다.
