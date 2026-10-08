---
category: security-issues
tags: [privacy, fuzzy-offset, postgis, bbox, location-leak, projection, bisection]
related_files:
  - src/discovery/services/discovery-map.service.ts
  - src/discovery/services/photo-filter.service.ts
---

# 공개 좌표를 숨겨도, 필터링을 실제 좌표로 하면 이분탐색으로 역산 가능

## 문제
fresh reviewer가 실제로 재현해서 찾아낸 Critical 이슈. `DiscoveryMapService.getPins`가 뷰포트(bbox) 안에 있는지 판단할 때 `location && ST_MakeEnvelope(...)::geography`로 **실제 저장된 좌표**를 기준으로 필터링하고 있었다. 응답에는 공개 좌표(fuzzy 오프셋)만 내려주니 괜찮아 보였지만, 좁은 bbox를 반복 조회하면서 "이 사진이 결과에 포함되는지"만 관찰하면 포함/제외의 경계선이 **실제 좌표**를 그대로 노출한다 — 몇 번의 이분탐색(bisection)으로 500m 반경 fuzzy를 무의미하게 만들고 실제 위치를 정밀하게 역산할 수 있었다.

## 원인
"공개 응답에 어떤 값을 보여줄지"와 "그 값으로 어떻게 필터링/정렬/인덱싱할지"를 분리해서 생각하지 못했다. 응답 필드만 공개 좌표로 바꾸면 끝이라고 착각했는데, 포함 여부 자체가 또 하나의 정보 채널이라는 걸 놓쳤다 — 공개 값이 숨겨도, 그 값을 결정하는 조건이 비공개 값을 쓰면 조건을 반복 관찰하는 것만으로 비공개 값이 새어나간다.

## 해결책
SQL을 서브쿼리로 분리했다. 안쪽 쿼리에서 공개 좌표(EXACT=실제, FUZZY=저장된 오프셋)를 `lat`/`lng` 컬럼으로 먼저 계산하고, bbox 비교(`BETWEEN`)는 바깥쪽에서 **그 공개 좌표에만** 적용한다. 실제 좌표 기준 PostGIS `&&` 연산자는 GIST 인덱스를 쓰기 위한 "넉넉한(fuzzy 반경만큼 여유를 둔) prefilter"로만 남기고, 최종 포함/제외는 절대 실제 좌표로 결정하지 않는다.

```sql
SELECT id, lat, lng FROM (
  SELECT id, "createdAt",
    CASE WHEN visibility = 'EXACT' THEN ST_Y(location::geometry) ELSE "fuzzyOffsetLat" END AS lat,
    CASE WHEN visibility = 'EXACT' THEN ST_X(location::geometry) ELSE "fuzzyOffsetLng" END AS lng
  FROM "Photo"
  WHERE ... AND location && ST_MakeEnvelope(...여유를 둔 범위...)::geography  -- 인덱스용 prefilter
) AS projected
WHERE lat BETWEEN :minLat AND :maxLat AND lng BETWEEN :minLng AND :maxLng  -- 진짜 필터
```

## 다음 작업 전 체크할 것
- [ ] **어떤 값을 "비공개"로 숨기기로 했다면, 그 값은 필터링·정렬·그룹핑·인덱싱 어디에도 직접 쓰지 않는다.** 응답 필드만 바꾸는 걸로는 부족하다 — 공개 값으로 유도된 "포함 여부/순서/개수"도 전부 공개 값 기준으로만 계산해야 한다.
- [ ] 비공개 값을 성능상 이유로(인덱스 등) 여전히 써야 한다면, 반드시 **공개 값이 가질 수 있는 오차 범위(fuzzy 반경 등)만큼 여유를 둔 prefilter**로만 쓰고, 최종 결정은 공개 값으로 다시 한다.
- [ ] 새로운 "공개범위가 있는 필드"가 생기면(예: Engagement에서 비슷한 게 생기면), 이 패턴을 재사용한다.
