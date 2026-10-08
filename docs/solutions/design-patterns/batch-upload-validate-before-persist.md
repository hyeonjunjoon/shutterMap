---
category: design-patterns
tags: [batch-processing, atomicity, partial-failure, orchestration, multer, upload]
related_files:
  - src/photos/services/photo-upload.service.ts
---

# 배치 작업은 전부 검증부터 끝내고, 그 다음에만 쓰기 시작한다

## 문제
fresh reviewer가 찾아낸 Important 이슈. `PhotoUploadService.uploadPhotos`가 파일 배열을 `for` 루프로 돌면서 각 파일마다 "EXIF 파싱 → 이미지 처리 → R2 업로드 → DB 저장"을 순서대로 했다. multer의 `fileFilter`는 **클라이언트가 선언한 mimetype**만 보기 때문에, 실제 바이트가 손상된 파일(`image/jpeg`라고 주장하지만 진짜 JPEG가 아닌 파일)도 통과시킨다 — 손상 여부는 `sharp`/`heic-convert`가 실제로 디코딩을 시도할 때야 드러난다. 배치 중 두 번째 파일에서 이게 터지면, **첫 번째 파일은 이미 R2에 업로드되고 DB에도 저장된 채로** 500 에러가 났다 — 부분 성공 + 고아 레코드.

## 원인
"형식/용량/개수"는 멀티파트 파싱 단계(multer)에서 전부 걸러진다고 가정하고, 그 뒤의 "내용이 실제로 유효한가"는 따로 검증하지 않았다. 배치의 각 항목을 독립적으로 처리하면, 항목 수가 N개일 때 실패 지점에 따라 "0개 성공"부터 "N-1개 성공"까지 전부 가능한 상태가 된다 — 이게 바로 PRD/플랜이 요구한 "부분 성공 없음"을 깨는 지점이었다.

## 해결책
업로드를 2단계로 분리했다.

1. **1단계(검증만)**: 모든 파일에 대해 EXIF 파싱 + 이미지 디코딩을 먼저 끝낸다. 하나라도 디코딩에 실패하면 `BadRequestException`을 던지고, **아직 아무것도 R2나 DB에 쓰지 않은 상태**이므로 깨끗하게 전체 요청이 거부된다.
2. **2단계(쓰기)**: 1단계를 통과한 파일만 R2 업로드 + DB 저장을 진행한다.

```ts
const prepared: PreparedFile[] = [];
for (const file of files) {
  const exif = await this.exifService.parse(file.buffer); // 절대 안 던짐 (EXIF 없음 → null 필드)
  let processed: ProcessedImage;
  try {
    processed = await this.imageProcessingService.process(file.buffer, file.mimetype);
  } catch {
    throw new BadRequestException(`이미지를 처리할 수 없습니다: ${file.originalname}`);
  }
  prepared.push({ file, exif, processed });
}
// 여기까지 왔으면 전부 검증 통과 — 이제부터 쓰기 시작
for (const { file, exif, processed } of prepared) { /* R2 업로드 + DB 저장 */ }
```

## 다음 작업 전 체크할 것
- [ ] **여러 항목을 하나의 요청으로 처리하는 엔드포인트를 새로 만들 때는, "검증(실패 가능한 것)"과 "쓰기(부작용이 있는 것)"를 단계로 분리한다.** 모든 항목의 검증이 끝나기 전에는 어떤 항목도 쓰기 시작하지 않는다.
- [ ] 쓰기 단계 자체도 중간에 실패할 수 있다(R2는 되고 DB는 실패하는 등) — 지금은 그 경우까지는 트랜잭션으로 안 묶었다(MVP 범위에서 ruling으로 남김). 실제로 이런 부분 실패가 운영에서 관찰되면, `prisma.$transaction` + R2 업로드 보상(실패 시 삭제)을 고려한다.
- [ ] 이 패턴이 필요한 다른 배치 엔드포인트(예: 여러 사진 일괄 삭제/신고)가 생기면 이 2단계 구조를 재사용한다.
