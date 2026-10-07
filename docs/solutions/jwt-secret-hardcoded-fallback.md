# JWT_SECRET 하드코딩 폴백

## 문제
`JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-only-change-me', ... })`처럼, `JWT_SECRET`이 설정 안 돼 있으면 소스에 박힌(그리고 public 레포에 공개된) 문자열로 조용히 넘어가고 있었다. `AuthModule`과 `JwtStrategy` 두 곳에서 각각 같은 폴백을 중복으로 들고 있었다.

## 원인
"일단 개발 중엔 편하게"로 넣은 기본값이, 실수로 프로덕션에 `JWT_SECRET`을 안 넣고 배포하면 **누구나 그 공개된 문자열로 유효한 세션을 위조할 수 있는** 상태를 만든다. 두 곳에 중복돼 있어서 하나만 고치고 잊어버릴 위험도 있었다.

## 해결책
`src/auth/jwt-secret.ts`에 `getJwtSecret()` 하나만 두고, 값이 없으면 바로 `throw`(기동 자체가 실패). `AuthModule`과 `JwtStrategy` 둘 다 이 함수를 쓰도록 통일. 이후 카카오/구글 키도 같은 필요가 생겨서 `requireEnv(name)`으로 일반화했다 (`docs/solutions/qa-build-type-errors.md` 참고).

## 다음 작업 전 체크할 것
- [ ] **비밀값(시크릿, API 키 등)에 `?? '기본값'` 폴백을 쓰지 않는다.** 없으면 기동 시점에 바로 실패하게 한다 — 조용히 넘어가는 게 제일 위험하다.
- [ ] 같은 환경변수를 두 군데 이상에서 읽어야 하면, 처음부터 한 곳(`requireEnv`/`getXxxSecret` 같은 헬퍼)으로 모은다.
- [ ] 새 환경변수를 추가할 때마다 `requireEnv('NAME')` 패턴을 그대로 재사용한다.
