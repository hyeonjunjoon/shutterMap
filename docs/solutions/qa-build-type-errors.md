# /qa에서 발견: npm run build가 타입 에러로 실패

## 문제
`npm test`/`npm run test:e2e`는 전부 통과했는데, 실제로 서버를 띄워보려고 `npm run build`(`nest build`)를 돌리니 타입 에러 2개로 실패했다(exit 1). 코드는 실제로는 정상 동작했다 — 빌드만 깨져 있었다.

## 원인
`KakaoStrategy`/`GoogleStrategy`에서 `clientID: process.env.KAKAO_CLIENT_ID`처럼 `process.env.X`를 그대로 넘겼다. `tsconfig.json`에 `strict: true`가 있어서 `process.env.X`는 항상 `string | undefined` 타입인데, passport 전략의 옵션 타입은 `string`을 요구한다.

**ts-jest(테스트)는 이 에러를 못 잡았다** — ts-jest는 파일 단위로 느슨하게 변환만 하고 프로젝트 전체의 엄격한 타입체크를 안 하기 때문이다. `tsc`(진짜 빌드)만 잡는다. 이 프로젝트에 `npm run typecheck` 같은 별도 스크립트가 없어서, 테스트가 다 통과해도 빌드가 깨진 걸 아무도 모르고 있었다.

## 해결책
- `requireEnv(name: string): string` 헬퍼(`src/auth/require-env.ts`)를 만들어, 값이 없으면 던지고 있으면 `string`으로 반환하게 함. 세 전략(JWT, Kakao, Google) 모두 이걸로 통일.
- `package.json`에 `"typecheck": "tsc --noEmit"` 스크립트 추가.

## 다음 작업 전 체크할 것
- [ ] **테스트가 통과해도 안심하지 않는다.** 커밋/기능 완성 전에 `npm run typecheck`와 `npm run build`도 같이 돌린다 — ts-jest가 못 잡는 에러가 있다.
- [ ] `process.env.X`를 코드에서 직접 쓰지 않는다. 항상 `requireEnv('X')`(또는 그에 준하는, undefined를 걸러주는 헬퍼)를 통해서 읽는다.
