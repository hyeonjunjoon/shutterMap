---
category: best-practices
tags: [testing, test-design, falsifiability, false-positive-test, whitelist]
related_files:
  - test/discovery-gallery.e2e-spec.ts
---

# "통과하는 테스트"가 실제로는 아무것도 증명하지 못할 수 있음

## 문제
fresh reviewer가 지적한 Important 이슈. 갤러리에 지역(bbox) 필터가 없다는 걸 증명하려고 쓴 테스트가 이랬다:

```ts
it('ignores an unexpected region/bbox-like param instead of using it to filter (whitelist strip)', async () => {
  const res = await request(app.getHttpServer())
    .get('/discovery/gallery')
    .query({ minLat: '37', maxLat: '38', minLng: '127', maxLng: '128' })
    .expect(200);
  expect(Array.isArray(res.body.items)).toBe(true);
});
```

이 테스트는 `bbox`가 실제로 필터로 쓰여도(즉 버그가 있어도) 통과한다 — "200이고 배열이다"는 bbox 사용 여부와 아무 상관이 없기 때문이다. 리뷰어가 짚어주기 전까지 아무도 몰랐다.

## 원인
"API가 에러 없이 응답한다"와 "API가 내가 의도한 대로 동작한다"를 구분하지 않고 테스트를 썼다. 테스트 이름과 주석은 "bbox를 무시한다"고 말하지만, assertion은 그걸 확인하지 않았다 — 테스트가 초록불이어도 주장하는 내용은 검증되지 않은 상태였다.

## 해결책
위치가 없는(= bbox로 필터링됐다면 당연히 빠져야 하는) 사진을 직접 만들고, bbox 파라미터를 같이 보내도 **그 사진이 결과에 그대로 있는지**로 바꿨다 — 버그가 있었다면(bbox가 실제로 필터로 쓰였다면) 반드시 실패하는 assertion이다.

```ts
const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } }); // location 없음
const res = await request(app.getHttpServer())
  .get('/discovery/gallery')
  .query({ cameraName: camera, minLat: '37', maxLat: '38', minLng: '127', maxLng: '128' })
  .expect(200);
expect(res.body.items.find((item) => item.id === photo.id)).toBeDefined(); // bbox가 안 쓰였다는 진짜 증거
```

## 다음 작업 전 체크할 것
- [ ] **테스트를 쓸 때 "이 assertion이 실패하려면 코드가 어떻게 잘못돼야 하는가"를 스스로 답할 수 있어야 한다.** 답이 "모르겠다"거나 "거의 항상 통과한다"면, 그 테스트는 주장(제목/주석)을 증명하지 못한다.
- [ ] "~가 아니다"/"~를 무시한다" 같은 부정 명제를 테스트할 때 특히 조심한다 — `200`이나 `타입이 맞다` 같은 약한 assertion으로는 부정 명제를 증명할 수 없다. 그 조건이 있었다면 달라졌을 구체적인 데이터를 만들고, 그 데이터로 직접 확인한다.
- [ ] 리뷰(사람이든 fresh reviewer든)에서 "이 테스트가 뭘 증명하나요?"를 스스로 한 번씩 물어본다.
