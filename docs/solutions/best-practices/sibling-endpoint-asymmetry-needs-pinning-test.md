---
category: best-practices
tags: [testing, regression, api-design, moderation, consistency]
related_files:
  - src/engagement/services/like.service.ts
  - src/engagement/services/report.service.ts
  - test/engagement-report.e2e-spec.ts
---

# 의도적으로 다르게 동작하는 비슷한 엔드포인트는, 그 "다름"을 직접 고정하는 테스트가 있어야 한다

## 문제
fresh reviewer가 지적한 Important 이슈. `LikeService.toggle`은 사진이 `ACTIVE`가 아니면 404로 막고, `ReportService.submit`은 사진 행이 존재하기만 하면(상태 무관) 접수한다 — 둘 다 "사진에 대한 사용자 액션"이라는 같은 모양이지만 의도적으로 다르게 설계했다. 그런데 신고 쪽 e2e 테스트는 `ACTIVE` 사진만 가지고 테스트해서, 이 "다름" 자체를 증명하는 테스트가 없었다.

## 원인
두 서비스가 비슷하게 생겼을수록, 나중에 누군가(미래의 나 포함) "일관성 있게 통일하자"며 `ReportService`도 `LikeService`처럼 `status !== 'ACTIVE'`면 막게 "정리"하기 쉽다 — 그 리팩터링이 들어가도 기존 테스트는 전부 통과한다(둘 다 `ACTIVE` 사진만 테스트했으니까). 의도된 차이가 테스트로 고정돼 있지 않으면, 그 차이는 코드에만 존재하고 다음 사람에게는 보이지 않는다.

## 해결책
`ReportService`가 **의도적으로 다르게 동작하는 케이스**(`HIDDEN` 사진 신고 → 201, `status`는 그대로 `HIDDEN`)를 e2e에 명시적으로 추가했다.

```ts
it('accepts a report on a HIDDEN photo and does not touch the photo status', async () => {
  const agent = await loginAgent(REPORTER_EMAIL);
  const res = await agent.post(`/photos/${hiddenPhotoId}/reports`).send({ reason: 'PRIVACY' }).expect(201);
  expect(res.body.status).toBe('PENDING');
  const photo = await prisma.photo.findUniqueOrThrow({ where: { id: hiddenPhotoId } });
  expect(photo.status).toBe('HIDDEN'); // 신고가 운영자 조치 영역(status)을 침범하지 않는다는 것도 같이 고정
});
```

## 다음 작업 전 체크할 것
- [ ] **비슷하게 생긴 두 엔드포인트/서비스가 어딘가에서 의도적으로 다르게 동작한다면, 그 차이 자체를 검증하는 테스트를 "같음"을 검증하는 테스트와 별도로 추가한다.** 이번 플랜의 Review Focus 섹션에는 이미 "이 둘이 다른 이유"를 적어뒀었는데도, 실제 태스크의 테스트 목록을 쓸 때 그 항목을 빠뜨렸다 — 플랜에 적어두는 것만으로는 안 되고, 각 태스크의 테스트에 실제로 들어가야 한다.
- [ ] 리뷰/회고에서 "두 코드가 비슷한데 왜 다르게 짰나?"라는 질문이 나오면, 그 답(의도된 설계 결정)이 테스트로 고정돼 있는지도 같이 확인한다.
