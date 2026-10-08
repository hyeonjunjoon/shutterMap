---
category: security-issues
tags: [fuzzy-offset, privacy, location, postgis, race-condition, visibility]
related_files:
  - src/photos/services/photo-location.service.ts
  - src/photos/services/photo-visibility.service.ts
  - src/photos/photos.controller.ts
---

# fuzzy 오프셋이 위치가 바뀌는 경로와 안 묶여 있어서 핀이 안 뜨거나 옛 위치가 샘

## 문제
fresh reviewer가 찾아낸 Important 이슈 두 개, 근본 원인이 같아서 한 번에 고쳤다.

1. **수동 위치 등록(기능 2) 경로에서 지도 핀이 영영 안 뜸.** `Photo.visibility`의 기본값은 `FUZZY`인데, `PhotoVisibilityService.ensureFuzzyOffset`은 업로드 시 EXIF GPS가 있을 때만 호출되고 있었다. GPS 없는 사진에 `PATCH /photos/:id/location`으로 수동 위치만 등록하면 — 이게 PRD가 설명하는 가장 흔한 "GPS 없는 사진" 플로우인데 — `fuzzyOffsetLat/Lng`가 계속 `null`로 남아서 `toPublicLocation`이 `null`을 반환하고, 지도/상세 어디에도 핀이 뜨지 않았다.
2. **위치를 고친 뒤에도 옛 오프셋이 그대로 남아서 "떠나려 한 바로 그 장소"를 계속 가리킴.** `PATCH /photos/:id/location`으로 좌표를 바꿔도 `fuzzyOffsetLat/Lng`는 손대지 않았다 — EXIF가 틀려서 사용자가 좌표를 고친 경우, 공개되는 fuzzy 핀은 여전히 **옛 좌표** 기준 500m 안에 머물러 있었다.

## 원인
fuzzy 오프셋의 "생명주기"가 오직 **공개범위(visibility) 전환**에만 묶여 있었고, **위치(location) 자체가 바뀌는 순간**과는 연결돼 있지 않았다. 업로드 경로는 우연히 `setLocation` 바로 뒤에 `ensureFuzzyOffset`을 호출해서 괜찮아 보였을 뿐, 그 연결이 `PhotoLocationService`/`PhotoVisibilityService` 어디에도 구조적으로 보장돼 있지 않았다.

## 해결책
- `PhotoLocationService.setLocation`이 원점 좌표가 **실제로** 바뀌었는지(부동소수 오차 허용치 `1e-6` 적용) 확인하고, 바뀌었으면 `fuzzyOffsetLat/Lng`를 같은 UPDATE 문에서 함께 `NULL`로 리셋한다. 같은 좌표를 다시 저장한 경우엔 건드리지 않는다 — 안 그러면 오프셋을 매번 재생성하는 꼴이 되어, 같은 원본 위치를 중심으로 한 여러 노출 좌표의 평균으로 원본이 역산될 위험이 생긴다([toctou-race-conditions.md](toctou-race-conditions.md)와 같은 "재생성 자체가 위험"이라는 원칙).
- `PhotosController.setLocation`이 위치를 설정한 뒤 `PhotoVisibilityService.ensureFuzzyOffset`을 호출한다 — 업로드 경로(`PhotoUploadService`)가 이미 하던 것과 똑같은 패턴.

```ts
"fuzzyOffsetLat" = CASE WHEN ${originChanged} THEN NULL ELSE "fuzzyOffsetLat" END,
"fuzzyOffsetLng" = CASE WHEN ${originChanged} THEN NULL ELSE "fuzzyOffsetLng" END
```

실제 OS 프로세스 5개로 동시에 `PATCH visibility=FUZZY`를 쏴서, 진짜 커널 레벨 동시성에서도 오프셋이 1개만 저장되는 것까지 확인했다(`/qa`에서 curl 병렬 실행으로 재확인).

## 다음 작업 전 체크할 것
- [ ] **"한 번만 생성하고 재생성하지 않는" 파생값(오프셋, 캐시, 서명된 URL 등)을 만들 때는, 그 값이 의존하는 원본 데이터가 바뀌는 모든 경로를 같이 추적한다.** 생성 시점 하나만 챙기고 "원본이 바뀌면 파생값도 무효화해야 한다"는 걸 빠뜨리기 쉽다.
- [ ] 비슷한 패턴(필드 A가 바뀌면 파생값 B를 리셋)이 다른 모듈(Discovery, Engagement)에서도 나오면, 이 문서의 CASE WHEN 패턴을 재사용한다.
- [ ] Discovery 모듈에서 지도 핀을 뿌릴 때, `location`은 있지만 `visibility=FUZZY`이고 `fuzzyOffset`이 아직 `null`인 사진(막 업로드됐지만 아직 아무 경로도 안 탄 경우가 이론상 있을 수 있음)을 걸러내는 조건을 반드시 넣는다 — 지금은 업로드/위치설정 경로 둘 다 챙겼지만, 새 진입점이 생기면 또 빠뜨릴 수 있다.
