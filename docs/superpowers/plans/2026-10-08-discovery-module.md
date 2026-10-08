# Discovery 모듈 (지도 탐색/필터링 + 갤러리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD 기능 4(지도 탐색 및 필터링)와 기능 8(갤러리)을 `DiscoveryModule`로 구현한다 — 뷰포트+필터 조건에 맞는 사진 핀 목록(지도)과, 공개범위와 무관하게 전부 노출되는 카메라/렌즈별 썸네일 그리드(갤러리)를 제공한다.

**Architecture:** PRD 5-1이 요구하는 "필터 빌더 서비스 하나를 공유"를 `PhotoFilterService`로 구현한다 — 카메라/렌즈/초점거리/조리개라는, 지도와 갤러리가 공통으로 쓰는 4개 필터를 하나의 입력 타입(`SharedPhotoFilters`)으로 받아 두 가지 출력(Prisma `WhereInput` / raw SQL 조건 배열)으로 변환한다. 지도는 PostGIS 좌표 연산(뷰포트, 공개범위 투영)이 필요해서 raw SQL(`DiscoveryMapService`)로, 갤러리는 좋아요순 정렬·커서 페이지네이션이 필요해서 Prisma 쿼리 빌더(`DiscoveryGalleryService`)로 각각 구현한다.

**Tech Stack:** NestJS 11, Prisma 7(`Prisma.sql`/`Prisma.join`로 조합되는 raw SQL) + PostGIS(GIST 부분 인덱스), class-validator(쿠리 파라미터는 문자열로 받아 서비스에서 숫자로 변환).

**Spec:** [docs/PRD.md](../../PRD.md) — 기능 4(303행), 기능 8(451행), 5-1 모듈 경계(119행), STACK(105행), 부록 A(543행)

## Global Constraints

- 지도/갤러리 둘 다 **비로그인 열람 허용** — 인증 가드 없음 (PRD 3장).
- 필터는 전부 **AND** 결합 (PRD 기능4 특이사항).
- **클러스터링은 클라이언트(supercluster)의 책임이다.** PRD 기능4의 Output 문구("클러스터 단위로 묶어서 반환")는 프론트엔드가 supercluster로 처리한 *이후*의 결과를 설명하는 것이고, STACK 섹션이 "클러스터링: 클라이언트에서 supercluster"로 명시적으로 결정해뒀다 — 백엔드는 뷰포트+필터에 맞는 **원시 핀 목록**만 반환하면 된다. 서버사이드 클러스터링 로직은 만들지 않는다. **Ruling.**
- 지도 쿼리는 `visibility <> 'HIDDEN'`(위치 공개범위) AND `status = 'ACTIVE'`(운영 상태) AND `location IS NOT NULL`만 포함한다. **`PhotoVisibility.HIDDEN`(위치 비공개)과 `PhotoStatus.HIDDEN`(운영자 조치로 전체 비노출)은 다른 enum이다** — `security-issues/public-bucket-exposes-original-gps.md`/Photos 모듈 플랜에서 이미 한 번 짚은 혼동 포인트가 여기서도 똑같이 적용된다.
- 갤러리는 **위치 공개범위와 무관하게(`HIDDEN` 포함) 전부 노출**하되, 운영 상태(`status`)가 `ACTIVE`인 것만 노출한다 (PRD 기능8 설명). **지역(bbox) 필터는 갤러리 API에 애초에 존재하지 않는다** — 지도 미노출 사진의 위치가 지역 필터로 유추되는 걸 막기 위한 PRD 기능8 특이사항. `GalleryQueryDto`에 bbox 관련 필드를 선언하지 않는 것만으로, 전역 `ValidationPipe({whitelist:true})`가 구조적으로 그 필드를 차단한다 — 별도 거부 로직이 필요 없다.
- 지도 핀의 공개 좌표는 Photos 모듈의 `PhotoVisibilityService.toPublicLocation`과 같은 규칙(EXACT=원본, FUZZY=저장된 오프셋, HIDDEN=제외)을 따르지만, 한 번에 여러 행을 다루는 bulk 쿼리라서 행마다 그 서비스를 호출(N+1)하지 않고 SQL `CASE WHEN`으로 직접 투영한다 — 로직이 두 곳에 있는 것처럭 보이지만 의도된 분리다. **Ruling.**
- **쿼리 파라미터의 숫자값은 `@IsNumberString()`/`@IsLatitude()`/`@IsLongitude()`로 문자열 그대로 받고, 서비스 호출 직전에 `Number()`로 변환한다.** 이 레포의 전역 `ValidationPipe`(`src/app.module.ts`)는 `{ whitelist: true }`만 설정돼 있고 `transform: true`가 아니다 — `@IsNumber()`를 썼다면 쿼리스트링으로 들어오는 "35"가 전부 "must be a number"로 400 거부된다는 걸 스크래치에서 직접 확인했다(엔드포인트 로컬 `@UsePipes()`로 `transform:true`를 추가해도, 전역 파이프가 먼저 거부하므로 소용없다는 것까지 확인). **Ruling** — Engagement 모듈에서도 쿼리 파라미터를 받을 일이 있으면 같은 패턴을 쓴다.
- **공간 부분 인덱스(GIST + `WHERE` 조건)는 Prisma 스키마 문법으로 표현할 수 없다** — schema.prisma에는 선언하지 않고 손으로 쓴 마이그레이션으로만 관리한다. schema.prisma가 모르는 인덱스를 마이그레이션으로만 만들어도 이후 `prisma migrate dev`가 drift로 보지 않는다는 것을 스크래치 DB에 실제로 적용해서 확인했다 ([postgis-migration-drift.md](../../solutions/database-issues/postgis-migration-drift.md)와 같은 "Prisma가 모르는 DB 변경" 범주지만, 이번엔 마이그레이션 파일을 통해서 들어가므로 안전하다는 게 다르다).
- 새 npm 패키지는 설치하지 않는다 — 기존 Prisma/NestJS/class-validator로 충분하다.

## Review Focus

- 지역(bbox) 필터를 갤러리에 보내도 무시돼야 한다(힌트가 되지 않아야 함) — `GalleryQueryDto`가 그 필드를 선언하지 않아 whitelist가 구조적으로 막는지 테스트 (Task 4).
- 필터 조건에 맞는 사진이 하나도 없을 때 지도/갤러리 둘 다 빈 배열(에러 아님)을 반환해야 한다 (Task 3, Task 4).
- `minLat >= maxLat` 또는 `minLng >= maxLng`처럼 명백히 잘못된 지도 범위는 400으로 거부해야 한다 — 사용자가 좌표 순서를 뒤집어 보내는 실수를 막는다 (Task 3).
- `visibility = 'FUZZY'`인데 아직 `fuzzyOffset`이 생성되지 않은(위치는 있지만 오프셋 없음) 사진이 지도 쿼리에서 `null` 좌표로 새어나가면 안 된다 (Task 3).
- 갤러리 cursor로 마지막 페이지를 넘기면 빈 배열 + `nextCursor: null`로 끝나야 한다(무한 스크롤 종료 조건) (Task 4).

---

### Task 1: 위치 공간 부분 인덱스 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (주석만 추가)
- Create: `prisma/migrations/<timestamp>_add_photo_location_gist_index/migration.sql`
- Test: `test/photo-location-gist-index.e2e-spec.ts`

**Interfaces:**
- Produces: DB에 `photo_location_gist_idx`라는 이름의 부분 GIST 인덱스가 존재함 (schema.prisma에는 선언 안 됨).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/photo-location-gist-index.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Photo location 공간 부분 인덱스', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('photo_location_gist_idx가 GIST + 부분 조건으로 존재한다', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'photo_location_gist_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('USING gist');
    expect(rows[0].indexdef).toContain("visibility <> 'HIDDEN'");
    expect(rows[0].indexdef).toContain("status = 'ACTIVE'");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photo-location-gist-index.e2e-spec.ts`
Expected: FAIL — `rows`가 빈 배열이라 `toHaveLength(1)`이 깨짐.

- [ ] **Step 3: 빈 마이그레이션 생성**

```bash
npx prisma migrate dev --create-only --name add_photo_location_gist_index
```
Expected: schema.prisma에 변경이 없으므로 "Prisma Migrate created the following migration without applying it"라는 로그와 함께 `prisma/migrations/<timestamp>_add_photo_location_gist_index/migration.sql`(빈 파일, `-- This is an empty migration.`)이 생긴다.

- [ ] **Step 4: 생성된 migration.sql을 직접 작성**

생성된 `prisma/migrations/<timestamp>_add_photo_location_gist_index/migration.sql`의 내용을 아래로 교체:
```sql
CREATE INDEX "photo_location_gist_idx" ON "Photo" USING GIST (location)
WHERE "visibility" <> 'HIDDEN' AND "status" = 'ACTIVE' AND location IS NOT NULL;
```

- [ ] **Step 5: 마이그레이션 적용**

```bash
npx prisma migrate dev
```
Expected: "Applying migration `<timestamp>_add_photo_location_gist_index`" → "Your database is now in sync with your schema."

- [ ] **Step 6: schema.prisma에 설명 주석 추가**

`prisma/schema.prisma`의 `Photo` 모델에서 `location` 필드 주석(90행 근처, "Prisma has no first-class geography type..." 다음 줄)에 이어서 한 줄 추가:
```prisma
  // 이 컬럼 위의 공간 부분 인덱스(photo_location_gist_idx)는 Prisma가 partial index를
  // 표현할 문법이 없어서 손으로 쓴 마이그레이션으로만 관리된다 — 여기엔 선언하지 않는다.
  location       Unsupported("geography(Point, 4326)")?
```

- [ ] **Step 7: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photo-location-gist-index.e2e-spec.ts`
Expected: PASS 1/1

- [ ] **Step 8: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations test/photo-location-gist-index.e2e-spec.ts
git commit -m "feat: 지도 뷰포트 조회용 위치 공간 부분 인덱스 추가"
```

---

### Task 2: `PhotoFilterService` (공유 필터)

**Files:**
- Create: `src/discovery/services/photo-filter.service.ts`
- Test: `test/photo-filter.e2e-spec.ts`

**Interfaces:**
- Produces:
  `interface SharedPhotoFilters { cameraName?: string; lensName?: string; minFocalLength?: number; maxFocalLength?: number; minAperture?: number; maxAperture?: number }`
  `PhotoFilterService.toPrismaWhere(filters: SharedPhotoFilters): Prisma.PhotoWhereInput` (Task 4에서 갤러리가 사용)
  `PhotoFilterService.toSqlConditions(filters: SharedPhotoFilters): Prisma.Sql[]` (Task 3에서 지도가 사용, `status = 'ACTIVE'` 조건 포함해서 반환)

- [ ] **Step 1: 실패하는 테스트 작성 — 같은 필터가 Prisma where와 raw SQL 양쪽에서 같은 결과를 내는지 실제 DB로 검증**

`test/photo-filter.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from '../src/discovery/services/photo-filter.service';

describe('PhotoFilterService', () => {
  let prisma: PrismaService;
  let service: PhotoFilterService;
  let userId: string;
  let ids: { a: string; b: string; c: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoFilterService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(PhotoFilterService);

    const user = await prisma.user.create({ data: { email: 'photo-filter-test@example.com', passwordHash: 'x' } });
    userId = user.id;
    const a = await prisma.photo.create({
      data: { userId, originalKey: 'k', cameraName: 'ILCE-7M4', lensName: 'FE 24-70mm F2.8 GM', focalLength: 35, aperture: 1.8 },
    });
    const b = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'X100VI', focalLength: 23, aperture: 2.0 } });
    const c = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'ILCE-7M4', focalLength: 85, aperture: 1.4 } });
    ids = { a: a.id, b: b.id, c: c.id };
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function idsViaPrismaWhere(filters: SharedPhotoFilters) {
    const where = service.toPrismaWhere(filters);
    const rows = await prisma.photo.findMany({ where: { ...where, userId }, select: { id: true } });
    return rows.map((r) => r.id).sort();
  }

  async function idsViaSql(filters: SharedPhotoFilters) {
    const conditions = service.toSqlConditions(filters);
    const whereSql = Prisma.join([...conditions, Prisma.sql`"userId" = ${userId}`], ' AND ');
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Photo" WHERE ${whereSql}`;
    return rows.map((r) => r.id).sort();
  }

  it('camera 필터가 Prisma where와 raw SQL 양쪽에서 같은 결과를 낸다', async () => {
    const filters = { cameraName: 'ILCE-7M4' };
    const expected = [ids.a, ids.c].sort();
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('focalLength 범위 필터가 양쪽에서 같은 결과를 낸다', async () => {
    const filters = { minFocalLength: 30, maxFocalLength: 50 };
    const expected = [ids.a];
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('lens + aperture 범위를 같이 걸어도 양쪽이 같다', async () => {
    const filters = { lensName: 'FE 24-70mm F2.8 GM', maxAperture: 2.0 };
    const expected = [ids.a];
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('필터가 없으면 둘 다 이 유저의 ACTIVE 사진 전체를 반환한다', async () => {
    const expected = [ids.a, ids.b, ids.c].sort();
    expect(await idsViaPrismaWhere({})).toEqual(expected);
    expect(await idsViaSql({})).toEqual(expected);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photo-filter.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/discovery/services/photo-filter.service'`

- [ ] **Step 3: 최소 구현**

`src/discovery/services/photo-filter.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface SharedPhotoFilters {
  cameraName?: string;
  lensName?: string;
  minFocalLength?: number;
  maxFocalLength?: number;
  minAperture?: number;
  maxAperture?: number;
}

@Injectable()
export class PhotoFilterService {
  toPrismaWhere(filters: SharedPhotoFilters): Prisma.PhotoWhereInput {
    const where: Prisma.PhotoWhereInput = { status: 'ACTIVE' };

    if (filters.cameraName) where.cameraName = filters.cameraName;
    if (filters.lensName) where.lensName = filters.lensName;

    if (filters.minFocalLength != null || filters.maxFocalLength != null) {
      where.focalLength = {
        ...(filters.minFocalLength != null ? { gte: filters.minFocalLength } : {}),
        ...(filters.maxFocalLength != null ? { lte: filters.maxFocalLength } : {}),
      };
    }

    if (filters.minAperture != null || filters.maxAperture != null) {
      where.aperture = {
        ...(filters.minAperture != null ? { gte: filters.minAperture } : {}),
        ...(filters.maxAperture != null ? { lte: filters.maxAperture } : {}),
      };
    }

    return where;
  }

  toSqlConditions(filters: SharedPhotoFilters): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`"status" = 'ACTIVE'`];

    if (filters.cameraName) conditions.push(Prisma.sql`"cameraName" = ${filters.cameraName}`);
    if (filters.lensName) conditions.push(Prisma.sql`"lensName" = ${filters.lensName}`);
    if (filters.minFocalLength != null) conditions.push(Prisma.sql`"focalLength" >= ${filters.minFocalLength}`);
    if (filters.maxFocalLength != null) conditions.push(Prisma.sql`"focalLength" <= ${filters.maxFocalLength}`);
    if (filters.minAperture != null) conditions.push(Prisma.sql`"aperture" >= ${filters.minAperture}`);
    if (filters.maxAperture != null) conditions.push(Prisma.sql`"aperture" <= ${filters.maxAperture}`);

    return conditions;
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photo-filter.e2e-spec.ts`
Expected: PASS 4/4

- [ ] **Step 5: 커밋**

```bash
git add src/discovery/services/photo-filter.service.ts test/photo-filter.e2e-spec.ts
git commit -m "feat: PhotoFilterService 추가 — 지도/갤러리 공유 필터"
```

---

### Task 3: `DiscoveryMapService` + `GET /discovery/map`

**Files:**
- Create: `src/discovery/dto/map-query.dto.ts`
- Create: `src/discovery/services/discovery-map.service.ts`
- Create: `src/discovery/discovery.controller.ts`
- Create: `src/discovery/discovery.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/discovery-map.e2e-spec.ts` (서비스 레이어, 실제 DB)
- Test: `test/discovery-map-controller.e2e-spec.ts` (HTTP 레이어)

**Interfaces:**
- Consumes: `PhotoFilterService.toSqlConditions` (Task 2), `PrismaService`.
- Produces: `DiscoveryMapService.getPins(bounds: MapBounds, filters: MapFilters): Promise<PhotoPin[]>` where `PhotoPin = { id: string; lat: number; lng: number }`, `MapBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number }`, `MapFilters extends SharedPhotoFilters { month?: number }`. `GET /discovery/map` (query: `minLat,maxLat,minLng,maxLng` 필수 + 선택 필터).

- [ ] **Step 1: 실패하는 테스트 작성 (서비스 레이어, 실제 DB)**

`test/discovery-map.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoFilterService } from '../src/discovery/services/photo-filter.service';
import { DiscoveryMapService } from '../src/discovery/services/discovery-map.service';

describe('DiscoveryMapService.getPins', () => {
  let prisma: PrismaService;
  let service: DiscoveryMapService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoFilterService, DiscoveryMapService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DiscoveryMapService);

    const user = await prisma.user.create({ data: { email: 'discovery-map-test@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const bounds = { minLat: 36.9, maxLat: 37.1, minLng: 126.9, maxLng: 127.1 };

  async function seedPhoto(data: {
    cameraName?: string;
    visibility?: 'EXACT' | 'FUZZY' | 'HIDDEN';
    lat?: number;
    lng?: number;
    fuzzyOffset?: [number, number];
    takenAt?: Date;
  }) {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', cameraName: data.cameraName, visibility: data.visibility ?? 'EXACT', takenAt: data.takenAt },
    });
    if (data.lat != null && data.lng != null) {
      await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)::geography WHERE id = ${photo.id}`;
    }
    if (data.fuzzyOffset) {
      await prisma.$executeRaw`UPDATE "Photo" SET "fuzzyOffsetLat" = ${data.fuzzyOffset[0]}, "fuzzyOffsetLng" = ${data.fuzzyOffset[1]} WHERE id = ${photo.id}`;
    }
    return photo;
  }

  it('returns EXACT photos with their real coordinates, within bounds', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    const pin = pins.find((p) => p.id === photo.id);
    expect(pin?.lat).toBeCloseTo(37.0, 5);
    expect(pin?.lng).toBeCloseTo(127.0, 5);
  });

  it('returns FUZZY photos with their stored offset, not the real coordinates', async () => {
    const photo = await seedPhoto({ visibility: 'FUZZY', lat: 37.0, lng: 127.0, fuzzyOffset: [37.002, 127.002] });
    const pins = await service.getPins(bounds, {});
    const pin = pins.find((p) => p.id === photo.id);
    expect(pin?.lat).toBeCloseTo(37.002, 5);
    expect(pin?.lng).toBeCloseTo(127.002, 5);
  });

  it('excludes HIDDEN-visibility photos entirely', async () => {
    const photo = await seedPhoto({ visibility: 'HIDDEN', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('excludes photos outside the viewport bounds', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 0, lng: 0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('excludes FUZZY photos that have a location but no fuzzy offset yet (defensive null-safety)', async () => {
    const photo = await seedPhoto({ visibility: 'FUZZY', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('applies the camera filter', async () => {
    const match = await seedPhoto({ cameraName: 'X100VI', visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const other = await seedPhoto({ cameraName: 'ILCE-7M4', visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, { cameraName: 'X100VI' });
    expect(pins.find((p) => p.id === match.id)).toBeDefined();
    expect(pins.find((p) => p.id === other.id)).toBeUndefined();
  });

  it('applies the month filter', async () => {
    const march = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0, takenAt: new Date('2026-03-10T00:00:00Z') });
    const july = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0, takenAt: new Date('2026-07-10T00:00:00Z') });
    const pins = await service.getPins(bounds, { month: 3 });
    expect(pins.find((p) => p.id === march.id)).toBeDefined();
    expect(pins.find((p) => p.id === july.id)).toBeUndefined();
  });

  it('returns an empty array when nothing matches (not an error)', async () => {
    const pins = await service.getPins(bounds, { cameraName: 'NoSuchCamera' });
    expect(pins).toEqual([]);
  });

  it('rejects an invalid bounds (min >= max) with 400', async () => {
    await expect(service.getPins({ minLat: 38, maxLat: 37, minLng: 126.9, maxLng: 127.1 }, {})).rejects.toMatchObject({
      status: 400,
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- discovery-map.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/discovery/services/discovery-map.service'`

- [ ] **Step 3: `DiscoveryMapService` 최소 구현**

`src/discovery/services/discovery-map.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from './photo-filter.service';

export interface MapFilters extends SharedPhotoFilters {
  month?: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface PhotoPin {
  id: string;
  lat: number;
  lng: number;
}

const MAX_MAP_RESULTS = 2000;

@Injectable()
export class DiscoveryMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoFilterService: PhotoFilterService,
  ) {}

  async getPins(bounds: MapBounds, filters: MapFilters): Promise<PhotoPin[]> {
    if (bounds.minLat >= bounds.maxLat || bounds.minLng >= bounds.maxLng) {
      throw new BadRequestException('유효하지 않은 지도 범위입니다.');
    }

    const conditions = this.photoFilterService.toSqlConditions(filters);
    if (filters.month != null) {
      conditions.push(Prisma.sql`EXTRACT(MONTH FROM "takenAt") = ${filters.month}`);
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<{ id: string; lat: number | null; lng: number | null }[]>`
      SELECT id,
        CASE WHEN visibility = 'EXACT' THEN ST_Y(location::geometry) ELSE "fuzzyOffsetLat" END AS lat,
        CASE WHEN visibility = 'EXACT' THEN ST_X(location::geometry) ELSE "fuzzyOffsetLng" END AS lng
      FROM "Photo"
      WHERE ${whereSql}
        AND visibility <> 'HIDDEN'
        AND location IS NOT NULL
        AND location && ST_MakeEnvelope(${bounds.minLng}, ${bounds.minLat}, ${bounds.maxLng}, ${bounds.maxLat}, 4326)::geography
      LIMIT ${MAX_MAP_RESULTS}
    `;

    return rows
      .filter((row) => row.lat != null && row.lng != null)
      .map((row) => ({ id: row.id, lat: row.lat as number, lng: row.lng as number }));
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- discovery-map.e2e-spec.ts`
Expected: PASS 9/9

- [ ] **Step 5: DTO 작성**

`src/discovery/dto/map-query.dto.ts`:
```ts
import { IsLatitude, IsLongitude, IsNumberString, IsOptional, IsString } from 'class-validator';

export class MapQueryDto {
  @IsLatitude()
  minLat: string;

  @IsLatitude()
  maxLat: string;

  @IsLongitude()
  minLng: string;

  @IsLongitude()
  maxLng: string;

  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  lensName?: string;

  @IsOptional()
  @IsNumberString()
  minFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  maxFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  minAperture?: string;

  @IsOptional()
  @IsNumberString()
  maxAperture?: string;

  @IsOptional()
  @IsNumberString()
  month?: string;
}
```

- [ ] **Step 6: 실패하는 HTTP 레이어 테스트 작성**

`test/discovery-map-controller.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const EMAIL = 'discovery-map-controller-test@example.com';

describe('GET /discovery/map', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns pins within bounds without requiring authentication', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT' } });
    await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(127.0, 37.0), 4326)::geography WHERE id = ${photo.id}`;

    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '36.9', maxLat: '37.1', minLng: '126.9', maxLng: '127.1' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(photo.id);
    expect(res.body[0].lat).toBeCloseTo(37.0, 5);
    expect(res.body[0].lng).toBeCloseTo(127.0, 5);
  });

  it('rejects an invalid latitude with 400', async () => {
    await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '999', maxLat: '38', minLng: '126.9', maxLng: '127.1' })
      .expect(400);
  });

  it('rejects min >= max bounds with 400', async () => {
    await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '38', maxLat: '37', minLng: '126.9', maxLng: '127.1' })
      .expect(400);
  });

  it('returns an empty array when no pins are in range', async () => {
    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '0.9', maxLat: '1.1', minLng: '0.9', maxLng: '1.1' })
      .expect(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 7: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- discovery-map-controller.e2e-spec.ts`
Expected: FAIL — 라우트 없음 (404).

- [ ] **Step 8: 컨트롤러 + 모듈 작성**

`src/discovery/discovery.controller.ts`:
```ts
import { Controller, Get, Query } from '@nestjs/common';
import { MapQueryDto } from './dto/map-query.dto';
import { DiscoveryMapService } from './services/discovery-map.service';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryMapService: DiscoveryMapService) {}

  @Get('map')
  getMap(@Query() query: MapQueryDto) {
    return this.discoveryMapService.getPins(
      {
        minLat: Number(query.minLat),
        maxLat: Number(query.maxLat),
        minLng: Number(query.minLng),
        maxLng: Number(query.maxLng),
      },
      {
        cameraName: query.cameraName,
        lensName: query.lensName,
        minFocalLength: query.minFocalLength != null ? Number(query.minFocalLength) : undefined,
        maxFocalLength: query.maxFocalLength != null ? Number(query.maxFocalLength) : undefined,
        minAperture: query.minAperture != null ? Number(query.minAperture) : undefined,
        maxAperture: query.maxAperture != null ? Number(query.maxAperture) : undefined,
        month: query.month != null ? Number(query.month) : undefined,
      },
    );
  }
}
```

`src/discovery/discovery.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryController } from './discovery.controller';
import { PhotoFilterService } from './services/photo-filter.service';
import { DiscoveryMapService } from './services/discovery-map.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiscoveryController],
  providers: [PhotoFilterService, DiscoveryMapService],
})
export class DiscoveryModule {}
```

`src/app.module.ts`에서 `DiscoveryModule`을 import하고 `imports` 배열에 추가 (`PrismaModule`, `AuthModule`, `PhotosModule` 옆에).

- [ ] **Step 9: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- discovery-map-controller.e2e-spec.ts`
Expected: PASS 4/4

- [ ] **Step 10: 전체 스위트 확인**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전부 PASS.

- [ ] **Step 11: 커밋**

```bash
git add src/discovery src/app.module.ts test/discovery-map.e2e-spec.ts test/discovery-map-controller.e2e-spec.ts
git commit -m "feat: GET /discovery/map 지도 탐색 엔드포인트 추가"
```

---

### Task 4: `DiscoveryGalleryService` + `GET /discovery/gallery`

**Files:**
- Create: `src/discovery/dto/gallery-query.dto.ts`
- Create: `src/discovery/services/discovery-gallery.service.ts`
- Modify: `src/discovery/discovery.controller.ts`
- Modify: `src/discovery/discovery.module.ts`
- Test: `test/discovery-gallery.e2e-spec.ts`

**Interfaces:**
- Consumes: `PhotoFilterService.toPrismaWhere` (Task 2), `R2StorageService.buildPublicUrl` (Photos 모듈, `src/photos/services/r2-storage.service.ts`).
- Produces: `DiscoveryGalleryService.getGallery(filters, sort, cursor, limit): Promise<GalleryPage>` where `GalleryPage = { items: GalleryItem[]; nextCursor: string | null }`. `GET /discovery/gallery` (query: 선택 필터 + `sort` + `cursor` + `limit`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/discovery-gallery.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const EMAIL = 'discovery-gallery-test@example.com';

describe('GET /discovery/gallery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns photos regardless of visibility (including HIDDEN), newest first by default', async () => {
    const hidden = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'HIDDEN', cameraName: 'ILCE-7M4' } });
    await new Promise((r) => setTimeout(r, 10));
    const visible = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT', cameraName: 'ILCE-7M4' } });

    const res = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: 'ILCE-7M4' }).expect(200);

    const ids = res.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual([visible.id, hidden.id]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('sorts by likes when sort=likes', async () => {
    const liked = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'X100VI' } });
    const unliked = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'X100VI' } });
    await prisma.like.create({ data: { userId, photoId: liked.id } });

    const res = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: 'X100VI', sort: 'likes' })
      .expect(200);

    expect(res.body.items[0].id).toBe(liked.id);
    expect(res.body.items[0].likeCount).toBe(1);
    expect(res.body.items[1].id).toBe(unliked.id);
  });

  it('paginates with a cursor and ends with nextCursor: null', async () => {
    const camera = 'cursor-test-camera';
    for (let i = 0; i < 3; i++) {
      await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });
      await new Promise((r) => setTimeout(r, 10));
    }

    const page1 = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: camera, limit: '2' }).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: camera, limit: '2', cursor: page1.body.nextCursor })
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const overlap = page1.body.items.some((a: { id: string }) => page2.body.items.some((b: { id: string }) => a.id === b.id));
    expect(overlap).toBe(false);
  });

  it('ignores an unexpected region/bbox-like param instead of using it to filter (whitelist strip)', async () => {
    const res = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ minLat: '37', maxLat: '38', minLng: '127', maxLng: '128' })
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns an empty array when nothing matches', async () => {
    const res = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: 'NoSuchCamera' }).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- discovery-gallery.e2e-spec.ts`
Expected: FAIL — 라우트 없음 (404).

- [ ] **Step 3: `DiscoveryGalleryService` 구현**

`src/discovery/services/discovery-gallery.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from './photo-filter.service';
import { R2StorageService } from '../../photos/services/r2-storage.service';

export type GallerySortOption = 'latest' | 'likes';

export interface GalleryItem {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  thumbnailUrl: string;
  likeCount: number;
  createdAt: Date;
}

export interface GalleryPage {
  items: GalleryItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;

@Injectable()
export class DiscoveryGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoFilterService: PhotoFilterService,
    private readonly r2: R2StorageService,
  ) {}

  async getGallery(
    filters: SharedPhotoFilters,
    sort: GallerySortOption,
    cursor: string | undefined,
    limit: number = DEFAULT_LIMIT,
  ): Promise<GalleryPage> {
    const where = this.photoFilterService.toPrismaWhere(filters);
    const orderBy =
      sort === 'likes'
        ? [{ likes: { _count: 'desc' as const } }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

    const photos = await this.prisma.photo.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        cameraName: true,
        lensName: true,
        thumbnailKey: true,
        createdAt: true,
        _count: { select: { likes: true } },
      },
    });

    const hasMore = photos.length > limit;
    const page = hasMore ? photos.slice(0, limit) : photos;

    return {
      items: page.map((photo) => ({
        id: photo.id,
        cameraName: photo.cameraName,
        lensName: photo.lensName,
        thumbnailUrl: photo.thumbnailKey ? this.r2.buildPublicUrl(photo.thumbnailKey) : '',
        likeCount: photo._count.likes,
        createdAt: photo.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
```

- [ ] **Step 4: DTO 작성**

`src/discovery/dto/gallery-query.dto.ts`:
```ts
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

export enum GallerySort {
  LATEST = 'latest',
  LIKES = 'likes',
}

export class GalleryQueryDto {
  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  lensName?: string;

  @IsOptional()
  @IsNumberString()
  minFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  maxFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  minAperture?: string;

  @IsOptional()
  @IsNumberString()
  maxAperture?: string;

  @IsOptional()
  @IsEnum(GallerySort)
  sort?: GallerySort;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
```

- [ ] **Step 5: 컨트롤러 라우트 추가**

`src/discovery/discovery.controller.ts`의 생성자와 import를 아래로 교체:
```ts
import { Controller, Get, Query } from '@nestjs/common';
import { MapQueryDto } from './dto/map-query.dto';
import { GalleryQueryDto, GallerySort } from './dto/gallery-query.dto';
import { DiscoveryMapService } from './services/discovery-map.service';
import { DiscoveryGalleryService } from './services/discovery-gallery.service';

@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryMapService: DiscoveryMapService,
    private readonly discoveryGalleryService: DiscoveryGalleryService,
  ) {}
```
(`getMap` 메서드는 그대로 두고) 그 아래에 추가:
```ts
@Get('gallery')
getGallery(@Query() query: GalleryQueryDto) {
  return this.discoveryGalleryService.getGallery(
    {
      cameraName: query.cameraName,
      lensName: query.lensName,
      minFocalLength: query.minFocalLength != null ? Number(query.minFocalLength) : undefined,
      maxFocalLength: query.maxFocalLength != null ? Number(query.maxFocalLength) : undefined,
      minAperture: query.minAperture != null ? Number(query.minAperture) : undefined,
      maxAperture: query.maxAperture != null ? Number(query.maxAperture) : undefined,
    },
    query.sort === GallerySort.LIKES ? 'likes' : 'latest',
    query.cursor,
    query.limit != null ? Number(query.limit) : undefined,
  );
}
```

- [ ] **Step 6: `DiscoveryModule`에 `DiscoveryGalleryService` 등록**

`src/discovery/discovery.module.ts`의 `imports`에 `PhotosModule`(R2StorageService를 export하므로) 추가, `providers`에 `DiscoveryGalleryService` 추가, import 구문 추가.

- [ ] **Step 7: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- discovery-gallery.e2e-spec.ts`
Expected: PASS 5/5

- [ ] **Step 8: 전체 스위트 확인**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전부 PASS.

- [ ] **Step 9: 커밋**

```bash
git add src/discovery test/discovery-gallery.e2e-spec.ts
git commit -m "feat: GET /discovery/gallery 갤러리 엔드포인트 추가"
```
