---
category: best-practices
tags: [nestjs, class-validator, validation-pipe, query-params, dto, is-number-string]
related_files:
  - src/discovery/dto/map-query.dto.ts
  - src/discovery/dto/gallery-query.dto.ts
  - src/app.module.ts
---

# 쿼리 파라미터 숫자값은 `@IsNumberString()`으로 받고 서비스에서 변환한다

## 문제
Discovery 모듈의 `GET /discovery/map`/`GET /discovery/gallery`에 숫자 쿼리 파라미터(`minLat`, `minFocalLength` 등)를 받아야 했다. `@IsNumber()`를 썼더니, 쿼리스트링으로 들어오는 "35" 같은 값이 전부 "must be a number"로 400 거부됐다 — 쿼리 파라미터는 애초에 전부 문자열로 들어오기 때문이다.

## 원인
이 레포의 전역 `ValidationPipe`(`src/app.module.ts`의 `APP_PIPE`)는 `{ whitelist: true }`만 설정돼 있고 `transform: true`가 아니다 — Auth/Photos 모듈의 기존 body-JSON DTO들이 이 설정에 맞춰져 있어서 건드리지 않기로 했다(전역으로 `transform:true`를 켜면 기존 DTO 동작이 바뀔 위험이 있음). `@IsNumber()`는 실제 숫자 타입만 통과시키므로, 문자열 "35"는 변환 없이는 항상 거부된다. 로컬 `@UsePipes({transform:true})`를 라우트에 추가해도 **전역 파이프가 먼저 실행**돼서 거부하므로 소용없다는 것까지 직접 스파이크로 확인했다([spike-test-before-planning.md](../design-patterns/spike-test-before-planning.md) 참고).

## 해결책
숫자 쿼리 파라미터는 DTO에서 `string` 타입으로 선언하고 `@IsNumberString()`(소수 허용)으로 형식만 검증한 뒤, 컨트롤러에서 서비스를 호출하기 직전에 `Number(value)`로 변환한다. 위경도처럼 범위까지 검증해야 하면 `@IsLatitude()`/`@IsLongitude()`를 쓴다 — 둘 다 문자열 입력을 그대로 받아 검증한다.

```ts
export class MapQueryDto {
  @IsLatitude()
  minLat: string;        // "37.5" 같은 문자열 그대로

  @IsOptional()
  @IsNumberString()
  minFocalLength?: string;
}

// 컨트롤러에서
minFocalLength: query.minFocalLength != null ? Number(query.minFocalLength) : undefined,
```

페이지 크기처럼 **정수만** 허용해야 하는 필드(`limit`)는 `@IsNumberString()`(소수도 통과)이 아니라 정규식(`@Matches(/^[1-9]\d*$/)`)을 쓴다 — 0/음수/소수를 걸러야 하는 경우라서 따로 구분했다([unauthenticated-pagination-limit-validation.md](../security-issues/unauthenticated-pagination-limit-validation.md) 참고).

## 다음 작업 전 체크할 것
- [ ] **쿼리 파라미터(`@Query()`)를 받는 새 DTO를 만들 때는 숫자 필드를 `string`으로 선언하고 `@IsNumberString()`/`@IsLatitude()`/`@IsLongitude()`를 쓴다.** `@IsNumber()`를 쓰면 이 레포의 전역 파이프 설정(`transform:false`) 때문에 항상 400이 난다.
- [ ] body(JSON)로 받는 DTO는 이 문제가 없다 — JSON의 숫자는 이미 숫자 타입으로 들어오므로 `@IsNumber()`를 그대로 쓰면 된다. 혼동하지 않는다.
- [ ] 전역 `ValidationPipe`에 `transform:true`를 켜고 싶은 유혹이 들면, Auth/Photos의 기존 body DTO들이 전부 영향받는다는 걸 기억하고 먼저 전체 스위트로 확인한다.
