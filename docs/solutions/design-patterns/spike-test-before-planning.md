---
category: design-patterns
tags: [spike-test, planning, exifr, piexifjs, sharp, multer, verification, library-behavior]
related_files:
  - docs/superpowers/plans/2026-10-07-photos-module.md
---

# 라이브러리 동작을 기억에만 의존해 계획에 박아두지 않는다 — 스크래치에서 직접 스파이크로 확인

## 문제
Photos 모듈 플랜을 쓰는 중에, 기억만으로 작성하면 틀렸을 가정이 최소 세 번 나왔다.
1. `exifr`가 GPS를 어떤 키/형태(`latitude`/`longitude` 십진수 vs DMS)로 돌려주는지, `piexifjs`로 만든 EXIF를 `exifr`가 실제로 읽는지.
2. sharp가 이 환경에서 실제 HEIC(HEVC)를 디코딩할 수 있는지 (→ [sharp-heic-decode-limitation.md](../integration-issues/sharp-heic-decode-limitation.md)).
3. NestJS 11 + multer가 파일 개수초과/용량초과/잘못된 mimetype을 커스텀 예외 필터 없이도 올바른 HTTP 상태코드(400/413/415)로 변환해주는지.

셋 다 "아마 이럴 것이다"로 플랜에 적었다면 최소 하나는 틀렸을 것이다(실제로 3번은 "커스텀 MulterExceptionFilter가 필요할 것"이라고 예상했는데, 스파이크 결과 전혀 필요 없었다 — NestJS가 이미 처리해줌).

## 원인
여러 라이브러리가 조합되는 지점(네이티브 바인딩이 있는 라이브러리, 프레임워크의 내부 동작, 버전마다 달라지는 기능)은 공식 문서나 기억에 의존한 추측이 실제 빌드 환경에서 틀리기 쉽다. 계획 단계에서 틀린 가정을 세우면, 실행 단계에 가서야 "계획이 틀렸다"는 걸 발견하고 Task를 다시 쓰게 된다 — 더 비싸다.

## 해결책
플랜을 쓰기 전에, 스크래치패드(`/private/tmp/.../scratchpad`)에 별도 `npm init` 프로젝트를 만들어 후보 라이브러리들을 실제로 설치하고, 작은 node 스크립트로 가정을 직접 검증했다:
- `piexifjs`로 JPEG+EXIF+GPS를 합성 → `exifr.parse()`로 다시 읽어서 필드명/타입/GPS 변환이 기대한 대로인지 확인.
- `sharp(buf).heif({compression:'hevc'})`를 실제로 호출해서 에러 메시지를 직접 받아봄 ("Unsupported compression").
- 최소 NestJS 앱 하나를 스크래치에 만들어 `FilesInterceptor`에 일부러 너무 많은 파일/너무 큰 파일/잘못된 mimetype을 보내고 실제 HTTP 응답 코드를 확인.

검증된 사실만 플랜의 코드에 반영했고, 플랜 문서의 "Global Constraints"에 "직접 스파이크로 확인함"이라고 근거를 남겼다.

## 다음 작업 전 체크할 것
- [ ] **다음 모듈(Discovery, Engagement) 플랜을 쓸 때도, 확신 없는 라이브러리 동작(카카오맵 SDK, supercluster, PostGIS 공간 쿼리의 정확한 함수 시그니처 등)은 코드를 쓰기 전에 스크래치에서 작게 검증한다.**
- [ ] 스파이크에 쓴 스크래치 프로젝트는 세션이 끝나면 자동으로 치워진다(스크래치패드 디렉토리) — 검증 결과 자체(에러 메시지, 성공/실패)만 플랜/문서에 남기면 충분하고, 스파이크 코드 자체를 레포에 커밋할 필요는 없다.
- [ ] 스파이크로도 확인이 안 되는 것(예: 이 문서의 실제 아이폰 HEIC 디코딩처럼 샘플 파일 자체가 없는 경우)은 "확인 안 됨"이라고 플랜/문서에 명시하고, 수동 QA 체크리스트로 남긴다 — 확인된 것처럼 꾸미지 않는다.
