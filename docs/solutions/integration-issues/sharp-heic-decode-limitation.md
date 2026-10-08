---
category: integration-issues
tags: [sharp, heic-convert, heic, heif, libheif, image-processing, native-binding]
related_files:
  - src/photos/services/image-processing.service.ts
  - src/photos/services/image-processing.service.spec.ts
---

# sharp는 이 환경에서 실제 HEIC(HEVC)를 디코딩하지 못함 — heic-convert로 대체

## 문제
Photos 모듈 플랜을 쓰면서 "HEIC는 sharp 하나로 디코딩+리사이즈+메타데이터 제거를 다 처리한다"고 가정하고 넘어가려 했다. 실제로 스크래치에서 확인해보니, 이 환경의 sharp(0.35.5, libheif 1.23.5)는 `heif()` 인코딩에서 `compression: 'hevc'`(아이폰 등 실제 기기가 쓰는 HEIC 코덱)를 "Unsupported compression"으로 거부했고, `av1`(AVIF)만 지원했다. `sharp.format.heif`도 `fileSuffix: ['.avif']`만 광고하고 있었다.

## 원인
sharp가 배포하는 prebuilt 바이너리는 라이선스 문제로 HEVC 인코더/디코더를 기본 포함하지 않는 경우가 흔하다. 이 환경도 AV1(AVIF)만 들어있고 실제 아이폰 HEIC(HEVC)는 디코딩 경로 자체가 없을 가능성이 높다 — 직접 합성한 AV1-코덱 heif 파일을 `heic-convert`에 먹여봤더니 "input buffer is not a HEIC image"로 거부당해서, sharp의 heif 지원과 실제 기기의 HEIC는 다른 걸 가리키고 있다는 게 확인됐다.

## 해결책
HEIC/HEIF 디코딩은 sharp가 아니라 `heic-convert`(HEVC 디코딩을 위해 만들어진 라이브러리)로 먼저 JPEG로 변환한 뒤, 그 결과를 sharp에 넘겨 리사이즈/메타데이터 제거를 하도록 분리했다 (`ImageProcessingService.process`).

```ts
const decodable = HEIC_MIMETYPES.includes(mimetype)
  ? Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 1 }))
  : buffer;
```

실제 아이폰 HEIC 샘플 파일이 이 환경에 없어서(합성도 불가능 — HEVC 인코더가 없음), 이 경로는 자동 테스트에서 `heic-convert`를 mock해서 "라우팅이 맞는지"만 검증했다. 실제 디코딩 정확성은 아직 라이브 기기 사진으로 확인된 적이 없다.

## 다음 작업 전 체크할 것
- [ ] **실제 아이폰/안드로이드에서 찍은 HEIC 사진으로 업로드를 한 번 수동 테스트한다** — `heic-convert`가 실제로 디코딩에 성공하는지는 아직 증명되지 않았다.
- [ ] 이미지 처리 라이브러리를 바꾸거나 업그레이드할 때는, "포맷 지원 목록에 있다"는 문서만 믿지 말고 `sharp.format`/실제 인코딩 시도로 직접 확인한다 ([spike-test-before-planning.md](../design-patterns/spike-test-before-planning.md) 참고).
- [ ] HEIC 디코딩이 실패하는 사용자가 실제로 보고되면, 에러를 그냥 500으로 내지 말고 "지원하지 않는 이미지입니다" 같은 명확한 400으로 바꾸는 걸 고려한다 (지금은 `ImageProcessingService`가 던지면 `PhotoUploadService`가 400으로 변환하긴 하지만, 사용자에게 "왜 실패했는지"는 안 보여준다).
