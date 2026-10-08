---
category: database-issues
tags: [prisma, foreign-key, cleanup, afterAll, test-isolation, like]
related_files:
  - test/discovery-gallery.e2e-spec.ts
  - prisma/schema.prisma
---

# 테스트 `afterAll`에서 Like보다 Photo를 먼저 지우면 FK 제약 위반

## 문제
갤러리 e2e 테스트의 `afterAll`이 `prisma.photo.deleteMany` → `prisma.user.deleteMany` 순서로 정리하고 있었다. `'sorts by likes' 테스트`가 `Like` 행을 하나 만들었는데, 그 뒤 `afterAll`이 `Photo`를 지우려다 `Like_photoId_fkey` 외래키 제약 위반으로 실패했다 — 정리 자체가 실패해서 유저/사진/좋아요가 DB에 그대로 남고, 다음 테스트 실행 때 `user.create`가 유니크 제약 위반으로 깨졌다.

## 원인
`Like.photoId`가 `Photo.id`를 참조하는 FK라서, 참조하는 쪽(`Like`)을 먼저 지워야 참조되는 쪽(`Photo`)을 지울 수 있다. 이 순서를 지키지 않으면 Postgres가 삭제 자체를 막는다 — 테스트가 실패하는 게 아니라 **정리(cleanup)가 실패**하는 거라, 에러가 나는 테스트 파일을 열어봐도 원인이 바로 안 보이고, "왜 이전 실행의 데이터가 남아있지?"로 헤매게 된다.

## 해결책
`afterAll`에서 FK가 가리키는 방향의 역순으로 지운다 — `Like` → `Photo` → `User`.

```ts
afterAll(async () => {
  // Like.photoId가 Photo를 참조하는 FK라서, 좋아요를 먼저 지워야
  // photo.deleteMany가 제약 위반 없이 끝난다.
  await prisma.like.deleteMany({ where: { userId } });
  await prisma.photo.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});
```

## 다음 작업 전 체크할 것
- [ ] **새 테스트가 `Like`/`Report`처럼 `Photo`를 참조하는 행을 만들면, `afterAll`에서 그 행을 `Photo`보다 먼저 지운다.** 이 레포의 FK 방향: `Like.photoId → Photo.id`, `Report.photoId → Photo.id`, `Photo.userId → User.id`, `Like.userId`/`Report.userId → User.id`.
- [ ] 이 순서를 매번 손으로 맞추는 대신, 테스트 cleanup이 많아지면 "유저 하나가 만든 모든 것을 역순으로 지우는" 공용 헬퍼를 고려한다(지금은 테스트 파일이 몇 개뿐이라 아직 만들지 않음 — YAGNI).
- [ ] 정리가 실패하면(에러가 `afterAll`에서 나면) 그 테스트 파일이 만든 테스트 이메일로 유저가 남아있는지 직접 DB에서 확인하고 수동으로 치운 뒤, cleanup 순서를 고친다.
