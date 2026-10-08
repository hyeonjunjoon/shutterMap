---
category: best-practices
tags: [typescript, typecheck, tsconfig, types-array, multer, heic-convert, ts-jest, build, ci-gap]
related_files:
  - tsconfig.json
  - src/photos/photos.controller.ts
  - src/photos/services/image-processing.service.ts
  - package.json
---

# 새 패키지를 추가할 때마다 tsc(typecheck/build)만 잡는 타입 에러가 또 나옴

## 문제
Photos 모듈에서 `multer`(파일 업로드 타입)와 `heic-convert`를 새로 쓰기 시작했는데, `npm test`는 전부 통과했지만 `npm run typecheck`/`npm run build`가 두 가지 에러로 깨졌다 — 하나는 `Express.Multer.File`을 못 찾는 에러, 다른 하나는 `heic-convert`에 타입 선언이 없다는 에러. Auth 모듈 때 겪었던 ["ts-jest는 못 잡고 tsc만 잡는 에러"](qa-build-type-errors.md) 패턴이 새 의존성을 추가할 때마다 또 재발했다.

## 원인
- `Express.Multer.File`은 `@types/multer`가 전역(`declare global`)으로 증강하는 타입인데, 이 프로젝트의 `tsconfig.json`은 `"types": ["node", "jest"]`로 자동 포함되는 전역 타입 패키지를 제한해두고 있다 — `multer`를 그 배열에 명시적으로 추가하지 않으면 `@types/multer`를 설치해도 전역 증강이 적용되지 않는다.
- `heic-convert`는 패키지 자체에 타입 선언이 없다 — `@types/heic-convert`를 따로 설치해야 한다.

둘 다 ts-jest(파일 단위로 느슨하게 변환)는 못 잡고, 프로젝트 전체를 엄격하게 보는 `tsc`(`typecheck`/`build`)만 잡는다.

## 해결책
- `tsconfig.json`의 `"types"` 배열에 `"multer"`를 추가 (`["node", "jest", "multer"]`).
- `npm install -D @types/heic-convert`.

## 다음 작업 전 체크할 것
- [ ] **새 npm 패키지를 추가할 때는 설치 직후 `npm run typecheck`와 `npm run build`를 돌려본다** — `npm test`만 돌리고 넘어가면 이런 에러를 못 본다.
- [ ] 패키지가 전역 타입 증강(Express 네임스페이스에 끼워 넣는 식)을 쓰는 타입이라면, 이 프로젝트의 `tsconfig.json`이 `"types"` 배열로 자동 포함을 제한해두고 있다는 걸 기억하고 거기 추가한다.
- [ ] 패키지에 내장 타입이 없으면 `npm view @types/<패키지명> dist-tags.latest`로 커뮤니티 타입이 있는지 먼저 확인한다 — 없으면 `declare module '<패키지명>';` 같은 최소 ambient 선언을 직접 만든다.
