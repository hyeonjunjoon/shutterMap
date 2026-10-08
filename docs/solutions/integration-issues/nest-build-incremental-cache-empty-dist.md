---
category: integration-issues
tags: [nestjs, nest-cli, typescript, incremental-build, tsbuildinfo, deleteOutDir, deploy]
related_files:
  - tsconfig.build.json
  - nest-cli.json
  - tsconfig.json
---

# nest build가 "0 errors"로 성공해도 dist/를 안 만드는 경우가 있음

## 문제
`/qa`로 실제 서버를 띄워보려다가 `node dist/main` 단계에서 `Cannot find module '.../dist/main'`으로 터졌다. 그런데 바로 전에 돌린 `npm run build`(`nest build`)는 "Found 0 errors"로 끝났고 exit code도 0이었다 — 빌드가 "성공"했다고 보고하는데 `dist/` 자체가 존재하지 않는 상태였다.

## 원인
`nest-cli.json`에 `compilerOptions.deleteOutDir: true`가 있어서, 빌드 시작 시 `dist/`를 지운다. 그런데 TypeScript의 incremental 빌드 캐시(`tsconfig.build.tsbuildinfo`)는 **프로젝트 루트**에 따로 저장돼 있었다(`tsconfig.build.json`이 `outDir`를 그대로 물려받으면서도 `tsBuildInfoFile`을 지정하지 않아 기본 위치에 생김). `dist/`가 지워져도 이 캐시 파일은 안 지워지니, 다음 빌드에서 tsc의 incremental 로직이 "입력 파일 해시가 캐시와 똑같다 → 다시 쓸 필요 없다"고 판단해버리면, **출력 파일이 실제로는 없어도 아무것도 다시 쓰지 않고 그냥 성공 종료**한다. (이전에 `nest start --watch`가 비정상 종료하면서 `dist/`가 지워진 상태로 캐시만 남는 상황이 실제로 발생했다.)

`npm test`/`npm run test:e2e`/`npm run typecheck`는 전부 멀쩡히 통과했다 — 이 버그는 오직 "진짜로 `dist/`에서 서버를 띄워보는" 경로에서만 드러난다.

## 해결책
`tsconfig.build.json`에 `tsBuildInfoFile`을 `dist/` 안쪽으로 지정해서, 캐시와 산출물이 항상 같은 생명주기를 갖게 만들었다 — `deleteOutDir`가 `dist/`를 지우면 캐시도 무조건 같이 지워지므로, "캐시만 살아남고 산출물은 없는" 상태 자체가 구조적으로 불가능해진다.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo"
  }
}
```

`dist/`를 지우고 재빌드하는 걸 반복해서 — 지워도 매번 제대로 다시 생기는 것을 확인했다.

## 다음 작업 전 체크할 것
- [ ] **`npm run build`를 돌린 뒤에는 `ls dist/main.js`(또는 실제로 `node dist/main`을 한 번 띄워보는 것)까지 확인한다.** "exit 0 + 에러 없음"은 산출물이 실제로 생성됐다는 증거가 아니다.
- [ ] CI나 배포 파이프라인에서 `node_modules`는 캐싱하면서 `dist/`는 캐싱하지 않는 식으로 "캐시와 산출물이 따로 노는" 구조를 쓰고 있다면, 이 레포와 똑같은 증상(빌드 성공 보고 + 빈 산출물)이 날 수 있다 — incremental 캐시 파일(`*.tsbuildinfo`)이 항상 그 출력물과 같은 디렉토리/같은 캐시 키 안에 있는지 확인한다.
- [ ] `deleteOutDir: true`와 TypeScript `incremental: true`를 같이 쓰는 다른 tsconfig가 레포에 추가되면, 이 문제가 또 생길 수 있다는 걸 기억한다.
