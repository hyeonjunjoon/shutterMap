---
category: security-issues
tags: [pagination, validation, dto, unauthenticated-endpoint, resource-limits]
related_files:
  - src/discovery/dto/gallery-query.dto.ts
  - src/discovery/services/discovery-gallery.service.ts
---

# 인증 없는 전역 조회 API의 `limit`을 검증·상한 없이 받고 있었음

## 문제
fresh reviewer가 재현한 Important 이슈. `GET /discovery/gallery`의 `limit` 쿼리 파라미터가 `@IsNumberString()`만 걸려 있어서 — `limit=0`은 `findMany({ take: 1 })` 뒤 `page[-1]` 접근으로 500, `limit=-1`도 500, `limit=1.5`는 조용히 통과, `limit=999999`는 상한 없이 그대로 쿼리에 넘어갔다. 로그인도 필요 없는 엔드포인트라 누구나 호출할 수 있었다.

## 원인
"숫자 형식이면 통과"와 "이 숫자가 실제로 써도 되는 값인가"를 구분하지 않았다. `limit`은 양의 정수여야 하고 상한도 있어야 하는데, `@IsNumberString()`은 "숫자처럼 보이는 문자열"만 확인하지 그 이상은 안 본다.

## 해결책
- DTO에 양의 정수 전용 정규식(`@Matches(/^[1-9]\d*$/)`)을 추가해서 `0`/음수/소수를 애초에 400으로 거부한다.
- 서비스에서 `Math.min(requestedLimit, MAX_LIMIT)`로 상한(50)을 강제한다 — 클라이언트가 유효한 큰 수를 보내도 서버가 한 번에 긁어가는 양을 제한한다.

```ts
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
// DTO
@IsOptional()
@Matches(POSITIVE_INTEGER_PATTERN)
limit?: string;

// 서비스
const limit = Math.min(requestedLimit, MAX_LIMIT); // MAX_LIMIT = 50
```

## 다음 작업 전 체크할 것
- [ ] **로그인이 필요 없는(인증 없는) 조회 API에 페이지 크기/개수 파라미터를 추가할 때는 항상: (1) 형식 검증(양의 정수) + (2) 서버 쪽 상한을 같이 넣는다.** 인증 없는 엔드포인트일수록 아무나 큰 값을 보낼 수 있다는 걸 기본값으로 가정한다.
- [ ] `@IsNumberString()`은 "숫자 형식"만 보장하고 "이 값이 안전한 범위인가"는 보장하지 않는다 — 별도로 범위/정수 여부를 검증해야 한다.
- [ ] 비슷한 `limit`/`take`/`pageSize` 파라미터가 Engagement 모듈 등에 새로 생기면 같은 두 가지(형식 검증 + 서버 상한)를 기본으로 넣는다.
