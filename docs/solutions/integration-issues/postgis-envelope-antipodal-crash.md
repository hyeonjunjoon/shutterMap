---
category: integration-issues
tags: [postgis, geography, st_makeenvelope, antipodal, viewport, wide-bounds]
related_files:
  - src/discovery/services/discovery-map.service.ts
---

# ST_MakeEnvelope(...)::geography가 뷰포트 폭이 180도에 가까우면 500을 냄

## 문제
fresh reviewer가 실제로 재현한 Important 이슈. 지도 API에 `minLng=-180, maxLng=180`처럼 거의 지구 전체를 담는 뷰포트(저줌 세계지도 뷰)를 보내면 500 에러(`Antipodal (180 degrees long) edge detected!`)가 났다. `minLng=-170, maxLng=170`처럼 폭 180도에 조금 못 미쳐도, 날짜선 쪽 결과가 빠지거나 뒤틀렸다.

## 원인
`ST_MakeEnvelope(...)::geography`는 평면 사각형(envelope)을 지구 타원체 위의 geography로 변환하는데, 폭이 180도에 가까워지면 "이 변(edge)이 지구 반대편까지 가는 건지 반대 방향으로 가는 건지" 방향을 결정할 수 없어진다 — PostGIS가 이런 경우를 "antipodal edge"로 보고 에러를 던진다. 지도 앱에서 줌 레벨이 낮은(세계 지도 수준) 뷰포트는 실제로 이 폭에 가깝게 요청될 수 있다.

## 해결책
geography 기반 `&&` 인덱스 prefilter는 "뷰포트 폭이 충분히 좁을 때만" 쓰고, 폭이 넓으면(90도 이상) 그 조건을 아예 빼고 공개 좌표에 대한 평범한 `BETWEEN` 비교만으로 거른다 — 결과는 항상 정확하고, 이 경우만 GIST 인덱스 스캔 대신 더 넓게(테이블 전체 또는 더 큰 범위를) 훑는다.

```ts
const isWideSpan =
  bounds.maxLat - bounds.minLat >= WIDE_SPAN_THRESHOLD_DEGREES ||
  bounds.maxLng - bounds.minLng >= WIDE_SPAN_THRESHOLD_DEGREES; // 90
if (!isWideSpan) {
  conditions.push(Prisma.sql`location && ST_MakeEnvelope(...)::geography`);
}
// 바깥쪽 BETWEEN 비교는 폭과 무관하게 항상 적용됨
```

## 다음 작업 전 체크할 것
- [ ] **지도/지리 관련 쿼리를 새로 만들 때, "저줌(세계 지도 수준)"처럼 극단적으로 넓은 입력값으로도 한 번 테스트한다.** 좁은 뷰포트(도시 수준)만 테스트하면 이런 경계 케이스를 놓친다.
- [ ] `geography` 타입에 `::geography` 캐스팅을 쓰는 다른 PostGIS 쿼리를 추가할 때도, 입력값이 날짜선/극지점을 건널 수 있는 상황인지 먼저 생각한다.
- [ ] 이 레포는 한국(단일 좁은 지역) 중심 MVP라 날짜선을 실제로 건너는 뷰포트(`minLng > maxLng`로 "감싸는" 범위)는 Non-goal로 두고 400으로 거부한다 — 글로벌 서비스가 되면 이 가정을 다시 봐야 한다.
