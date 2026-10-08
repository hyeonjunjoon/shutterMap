---
category: conventions
tags: [testing, jest, parallel-workers, test-isolation, e2e, global-query]
related_files:
  - test/discovery-map-controller.e2e-spec.ts
  - test/discovery-gallery.e2e-spec.ts
---

# 유저 범위 없는 전역 조회 API의 e2e 테스트는 다른 파일과 쉽게 충돌한다

## 문제
Discovery 모듈(`GET /discovery/map`, `GET /discovery/gallery`)은 설계상 `userId`로 범위를 좁히지 않는 전역 조회다. 그런데 테스트에서 `toHaveLength(1)`/`toEqual([...])`처럼 결과 배열 전체를 비교했더니, `npm run test:e2e`(전체 스위트, Jest가 여러 파일을 병렬 워커로 동시 실행)에서 종종 실패했다 — 같은 bbox나 `cameraName: 'ILCE-7M4'`처럼 다른 e2e 파일에서도 흔히 쓰는 값을 썼더니, 그 파일이 병렬로 떠 있는 동안 심어둔 데이터가 결과에 섞여 들어왔다.

## 원인
다른 모든 모듈(Auth/Photos)의 테스트는 `afterAll`에서 `userId`로 범위를 좁혀 자기 데이터만 지우기 때문에 "내 데이터만 본다"는 전제가 자연히 성립했다. Discovery는 API 자체가 전역이라 이 전제가 깨진다 — 같은 실제 Postgres를 여러 e2e 파일이 동시에 공유하는데, 그중 어떤 파일이 어떤 좌표/카메라명을 쓰는지는 서로 모른다.

## 해결책
두 가지를 같이 적용했다.
1. **고유한 픽스처 값을 쓴다.** `'ILCE-7M4'` 같은 범용 값 대신 `'gallery-visibility-test-camera'`처럼 이 테스트 파일/케이스 전용 문자열을 쓴다.
2. **그래도 안전하지 않은 경우(지도의 bbox처럼 좌표 자체가 의미 있는 경우)엔, 배열 전체를 비교하지 않고 "내가 만든 데이터의 id가 있는지/없는지"로만 검증한다.**

```ts
// 나쁨 — 다른 파일이 같은 영역에 데이터를 심어두면 깨짐
expect(res.body).toHaveLength(1);

// 좋음 — 다른 병렬 테스트의 데이터가 섞여도 안전
const pin = res.body.find((p) => p.id === myPhoto.id);
expect(pin).toBeDefined();
```

## 다음 작업 전 체크할 것
- [ ] **`userId`(또는 비슷한 소유자 범위) 없이 전역으로 조회하는 새 엔드포인트의 테스트를 쓸 때는, 처음부터 이 파일 전용 고유값을 쓰고 배열 전체 비교 대신 id 존재 여부로 검증한다.** "나중에 문제되면 고치자"가 아니라 처음부터 이렇게 쓴다.
- [ ] 반대로, 기존 모듈처럼 `userId`로 범위가 좁혀지는 API는 이 패턴이 필요 없다 — 과하게 적용하지 않는다.
- [ ] 좌표/카메라명처럼 "현실적인 값"을 쓰고 싶은 유혹이 있는 테스트일수록 이 문제가 잘 생긴다 — 현실적인 값일수록 다른 테스트도 똑같이 쓰고 싶어하기 때문.
