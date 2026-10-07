---
category: integration-issues
tags: [nestjs, jest, esm, cjs, typescript, ts-jest]
related_files:
  - tsconfig.json
  - test/jest-e2e.json
  - jest.config.ts
  - package.json
---

# NestJS 12(ESM) vs Jest — 테스트 전체가 깨져 있던 문제

## 문제
Prisma 연결 테스트(`prisma-schema.e2e-spec.ts`)를 처음 돌렸을 때 `TS5011: rootDir` 에러로 실패했다. `rootDir`을 고치고 나니, 이번엔 기존에 있던(스캐폴드 기본) `app.e2e-spec.ts`까지도 `Must use import to load ES Module: @nestjs/testing`로 깨졌다. `@nestjs/*` 체인을 따라 들어가며 `import * as X from 'cookie-parser'`/`'supertest'`가 호출 가능한 함수로 안 풀리는 문제도 같이 나왔다.

## 원인
- `tsconfig.json`에 `rootDir`이 명시돼 있지 않아서, `test/`와 `src/`에 걸쳐 있는 파일들을 ts-jest가 컴파일할 때 TypeScript가 공통 루트를 못 정했다 (이건 이 레포 스캐폴드 자체의 기존 버그였고, Prisma 작업과는 무관했다 — 기존 `app.e2e-spec.ts`도 똑같이 깨져 있었다).
- 더 큰 원인: 설치된 `@nestjs/common` 12.x부터 패키지 전체가 **ESM 전용**(`"type": "module"`)으로 바뀌었다. Jest는 ts-jest로 CommonJS로 변환해서 테스트를 돌리는데, ESM 전용 패키지를 `require()`하지 못해 cascade로 깨진다.
- 부수적으로, `cookie-parser`/`supertest`는 `module.exports = fn` 형태의 CJS 단일 함수 export인데, `import * as cookieParser from 'cookie-parser'`로 받으면 `esModuleInterop` 환경에서도 호출 가능한 함수로 안 풀렸다. `import cookieParser from 'cookie-parser'`(default import)로 바꿔야 했다.

## 해결책
- `tsconfig.json`에 `"rootDir": "."` 추가 (`tsconfig.build.json`은 이미 `./src`로 따로 override하고 있어서 영향 없음).
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`, `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/jwt`, `@nestjs/passport` 전부 **11.x(legacy, CJS) 라인으로 고정**. npm `legacy` dist-tag가 이 마지막 CJS 버전을 가리킨다.
- `import * as X from 'cookie-parser'`/`'supertest'`를 전부 `import X from 'cookie-parser'`/`'supertest'`(default import)로 바꿈.

## 다음 작업 전 체크할 것
- [ ] **`@nestjs/*` 패키지를 추가/업그레이드할 때는 반드시 11.x 라인으로 고정한다.** `npm install @nestjs/xxx`만 실행하면 최신(12.x, ESM) 버전이 깔려서 또 같은 문제가 난다 — `npm install @nestjs/xxx@<11.x 버전>`으로 명시할 것.
- [ ] NestJS 12 이상으로 올리고 싶다면, 이건 "패키지 업그레이드"가 아니라 "Jest를 ESM 네이티브 모드로 전환하는 별도 작업"이다. 가볍게 시도하지 않는다.
- [ ] `cookie-parser`, `supertest`처럼 CJS 단일 함수를 export하는 패키지는 `import X from '...'` (default import)로 쓴다. `import * as X`는 쓰지 않는다.
- [ ] 새 e2e 테스트 파일이 이상한 이유로 깨지면, 먼저 `npm run test:e2e -- app.e2e-spec`(가장 단순한 기존 테스트)이 통과하는지부터 확인해서 내가 만든 코드 문제인지 환경 문제인지 가른다.
