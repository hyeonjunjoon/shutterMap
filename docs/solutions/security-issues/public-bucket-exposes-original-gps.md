---
category: security-issues
tags: [r2, cloudflare, privacy, gps, exif, public-bucket, storage, fuzzy-visibility]
related_files:
  - src/photos/services/r2-storage.service.ts
  - src/photos/services/photo-upload.service.ts
---

# 원본 파일을 공개 R2 버킷에 두면 fuzzy/hidden 설정이 통째로 무력화됨

## 문제
fresh reviewer(최종 리뷰)가 찾아낸 Critical 이슈. `PhotoUploadService`가 원본 파일을 `R2StorageService.uploadBuffer`로 — 서빙/썸네일 이미지와 **같은 공개 버킷**에 — 업로드하고 있었다. 원본 파일은 GPS가 그대로 남아 있는데, 키 이름(`photos/{userId}/{photoId}/original.jpg`)이 예측 가능하고, `GET /photos/:id`가 `userId`와 `photoId`를 그대로 돌려주니, 누구나 `{R2_PUBLIC_BASE_URL}/photos/{userId}/{photoId}/original.jpg`를 조립해서 원본 EXIF의 정확한 좌표를 읽을 수 있었다 — `visibility`가 `HIDDEN`이어도 마찬가지였다.

## 원인
"서빙 이미지만 GPS를 지우면 된다"는 기능 1의 요구사항(PRD 196행)에만 집중하고, 원본이 저장되는 **위치**(공개 버킷인지 비공개 버킷인지)는 따로 생각하지 않았다. Cloudflare R2의 공개 접근은 버킷 단위(또는 커스텀 도메인)로 걸리기 때문에, 같은 버킷 안의 "경로만 다른" 파일은 전부 똑같이 공개된다 — prefix로는 비공개를 만들 수 없다.

## 해결책
원본용으로 별도의 비공개 버킷(`R2_ORIGINAL_BUCKET_NAME`)을 두고, `R2StorageService`에 `uploadOriginal()`을 따로 만들어 원본만 그 버킷으로 가도록 분리했다. `uploadBuffer()`(공개 버킷)는 서빙/썸네일 전용으로만 남겼다.

```ts
async uploadOriginal(key: string, body: Buffer, contentType: string): Promise<void> {
  await this.client.send(
    new PutObjectCommand({ Bucket: this.originalBucket, Key: key, Body: body, ContentType: contentType }),
  );
}
```

`PhotosService.getDetail()`은 원래부터 `originalKey`로 공개 URL을 만든 적이 없었지만(서빙/썸네일 URL만 만듦), 테스트에서 "원본은 공개 업로드 경로를 절대 타지 않는다"는 걸 명시적으로 검증했다.

## 다음 작업 전 체크할 것
- [ ] **클라우드 스토리지에 "민감한 원본"과 "공개 서빙용 산출물"을 같은 버킷에 넣지 않는다.** 버킷/도메인 단위로 공개 여부가 걸리므로, 경로(prefix)로 비공개를 만들 수 있다고 가정하면 안 된다.
- [ ] 새 업로드 플로우를 추가할 때, "이 파일에 어떤 민감정보가 남아있고, 그게 어느 버킷/권한으로 들어가는가"를 공개범위 설계(기능 3)와 같이 묶어서 검토한다.
- [ ] `R2_ORIGINAL_BUCKET_NAME`이 실수로 `R2_BUCKET_NAME`과 같은 값으로 설정되면 이 버그가 그대로 재발한다 — 운영 배포 전에 두 버킷 이름이 실제로 다른지, 비공개 버킷이 실제로 퍼블릭 액세스가 꺼져 있는지 확인한다.
