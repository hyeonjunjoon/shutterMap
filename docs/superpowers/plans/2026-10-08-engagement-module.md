# Engagement 모듈 (좋아요 + 사진 신고) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 사진에 좋아요를 토글하고, 사진을 신고(사유 제출)할 수 있는 두 개의 엔드포인트를 추가한다.

**Architecture:** `EngagementModule`을 신설하고 `LikeService`(좋아요 토글), `ReportService`(신고 제출)를 그 아래 둔다. 둘 다 `PhotosController`와 동일하게 `@Controller('photos')` 하위 경로(`/photos/:id/like`, `/photos/:id/reports`)로 노출하되, 소유 모듈은 `EngagementModule`로 분리한다(PRD 5-1의 모듈 경계 결정). `Like`/`Report` Prisma 모델과 관련 enum은 Foundation 단계에서 이미 schema에 존재하고 `Photo.likes` 관계는 Discovery 갤러리의 좋아요순 정렬에서 이미 쓰이고 있어 — 이번 작업은 새 테이블/마이그레이션 없이 그 모델을 실제로 채우는 쓰기 경로만 추가한다.

**Tech Stack:** NestJS 11.x, Prisma(`@prisma/client`), PostgreSQL, class-validator (`ValidateIf`로 신고 사유에 따른 조건부 필수 필드).

**Spec:** `docs/PRD.md` 기능 7(좋아요, L419-447), 기능 9(사진 신고 및 운영자 조치, L501-539), 모듈 경계 L126, 부록 A L550/L568/L570.

## Global Constraints

- `@nestjs/*` 계열 패키지는 전부 11.x로 고정한다 (CLAUDE.md).
- 경쟁 조건은 사전 체크 대신 원자적 조건부 쓰기(unique 제약+에러 캐치)로 처리한다 (CLAUDE.md). 좋아요 토글이 바로 이 패턴이 필요한 지점이다 — [toctou-race-conditions.md](../../solutions/security-issues/toctou-race-conditions.md)가 "Engagement 모듈에서 find-or-create류 로직을 짤 때는 처음부터 create 먼저 시도 → P2002 캐치 패턴으로 짜라"고 명시적으로 지목한 바로 그 모듈이다.
- `npm test`가 통과해도 `npm run typecheck`와 `npm run build`까지 돌린다 (CLAUDE.md).
- PR/커밋 메시지는 한국어로 쓰고, 공동 작업자에 Claude를 넣지 않는다 (CLAUDE.md "레포").
- push는 사용자 확인 후에만 한다 (CLAUDE.md "작업 전 확인").
- MVP에는 운영자용 어드민 패널/조치 API를 만들지 않는다 (PRD 기능 9 특이사항, 부록 A L568) — "운영자 조치"는 운영자가 Prisma Studio 등으로 `Report`를 직접 조회하고 `Photo.status`를 수동으로 바꾸는 것으로 처리한다. 이 플랜은 **신고 제출 엔드포인트까지만** 다루고, 조치/조회 API는 범위 밖이다.
- 로그인(인증)이 필요한 두 액션이다 — 업로드/좋아요는 로그인 필수(PRD L51), 신고도 "신고자 사용자 ID(로그인 필요)"(PRD L508)로 명시돼 있다. 둘 다 `JwtAuthGuard`로 막는다.

## Review Focus

1. **비로그인 사용자가 좋아요/신고를 시도하면 401이 오고, 아무 것도 반영되지 않는다** (PRD 기능 7/9 수용 기준에 명시적으로 나온 요구사항). `JwtAuthGuard`가 401을 던지는 것 자체는 기존 패턴이지만, "반영되지 않는다"(Like/Report 행이 생기지 않는다)는 각 태스크의 e2e에서 DB를 직접 조회해 확인한다.
2. **신고 사유가 `OTHER`인데 상세 내용(`detail`)이 비어있거나 없으면 400으로 거부된다** (PRD "기타, 직접 입력" — 크로스필드 검증이라 놓치기 쉽다). `class-validator`의 `@ValidateIf`로 구현하고, 스크래치에서 이 프로젝트의 글로벌 `ValidationPipe({ whitelist: true })`(transform 없음) 조합으로 실제 동작을 스파이크로 확인했다 (조건이 false면 해당 프로퍼티 검증이 완전히 스킵되고, true면 `@IsString()`+`@IsNotEmpty()`가 돈다).
3. **좋아요를 동시에 두 번 토글해도(레이스) 에러 없이 끝나고, `likeCount`는 항상 실제 `Like` 행 수와 일치한다** — `likeCount`는 캐시된 컬럼이 아니라 매번 `prisma.like.count()`로 계산하므로(기존 `PhotosService.getDetail`과 동일 패턴) 드리프트가 생길 수 없고, 레이스는 create 선시도 → P2002 캐치 → delete로 흡수한다. `AuthService.register`의 TOCTOU 테스트와 동일하게 mocked Prisma로 레이스 분기를 직접 검증한다(실제 동시 HTTP 요청으로 레이스를 재현하는 것은 타이밍 의존적이라 피한다 — 기존 Auth 모듈 테스트도 이 방식을 쓰지 않았다).
4. **좋아요 대상 사진이 없거나 `ACTIVE`가 아니면 404**, 하지만 **신고 대상 사진은 존재만 하면(상태 무관) 접수된다** — 이 둘이 다른 이유: 좋아요는 "열람 가능한 사진에 대한 반응"이라 `PhotosService.getDetail`과 동일한 열람 규칙을 따르지만, 신고는 이미 비공개/삭제 조치된 사진에 대한 재신고(예: 추가 사생활 침해 증거)도 유효해야 하므로 존재 여부만 본다. 두 서비스 모두 사진 자체가 없으면(행이 없으면) 404다.
5. **운영자가 `Photo.status`를 `HIDDEN`/`DELETED`로 바꾸면 지도/갤러리에서 즉시 사라진다** (PRD 기능 9 수용 기준 두 번째 Given/When/Then) — 이건 이미 `PhotoFilterService.toPrismaWhere`/`toSqlConditions`가 `status: 'ACTIVE'`를 하드코딩하고 있어서 **이번 플랜은 코드를 추가할 필요가 없다**. 다만 이 사실이 암묵적으로 깨지지 않았는지, 신고 제출 로직이 `Photo.status`를 건드리지 않는지(운영자 수동 조치 영역을 침범하지 않는지)는 각 태스크 완료 시 확인한다.

---

## Task 1: 좋아요 토글 — `LikeService` + `POST /photos/:id/like`

**Files:**
- Create: `src/engagement/services/like.service.ts`
- Create: `src/engagement/services/like.service.spec.ts`
- Create: `src/engagement/engagement.controller.ts`
- Create: `src/engagement/engagement.module.ts`
- Modify: `src/app.module.ts:8,11`
- Test: `test/engagement-like.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`(`src/prisma/prisma.service.ts`, 기존), `JwtAuthGuard`(`src/auth/guards/jwt-auth.guard.ts`, 기존, `../auth/guards/jwt-auth.guard`에서 import).
- Produces: `LikeService.toggle(photoId: string, userId: string): Promise<{ liked: boolean; likeCount: number }>` (throws `NotFoundException` when the photo is missing or not `ACTIVE`). `EngagementController` 클래스(`@Controller('photos')`, 생성자에 `likeService: LikeService`) — Task 2가 이 컨트롤러 파일에 라우트를 추가한다. `EngagementModule` 클래스 — Task 2가 이 모듈 파일에 provider를 추가한다.

- [ ] **Step 1: 실패하는 유닛 테스트 작성 (레이스 분기 포함, mocked Prisma)**

`src/engagement/services/like.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LikeService } from './like.service';
import { PrismaService } from '../../prisma/prisma.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('LikeService.toggle', () => {
  let service: LikeService;
  let prisma: {
    photo: { findUnique: jest.Mock };
    like: { create: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      photo: { findUnique: jest.fn() },
      like: { create: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LikeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LikeService);
  });

  it('throws NotFoundException when the photo does not exist', async () => {
    prisma.photo.findUnique.mockResolvedValue(null);

    await expect(service.toggle('missing-photo', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the photo is not ACTIVE', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'HIDDEN' });

    await expect(service.toggle('p1', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('creates a like on the first toggle', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockResolvedValue({ id: 'l1' });
    prisma.like.count.mockResolvedValue(1);

    const result = await service.toggle('p1', 'u1');

    expect(result).toEqual({ liked: true, likeCount: 1 });
    expect(prisma.like.deleteMany).not.toHaveBeenCalled();
  });

  it('recovers by deleting when two concurrent toggles race to create the same like (TOCTOU)', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockRejectedValue(uniqueConstraintError());
    prisma.like.deleteMany.mockResolvedValue({ count: 1 });
    prisma.like.count.mockResolvedValue(0);

    const result = await service.toggle('p1', 'u1');

    expect(result).toEqual({ liked: false, likeCount: 0 });
    expect(prisma.like.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', photoId: 'p1' } });
  });

  it('rethrows non-uniqueness errors as-is', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockRejectedValue(new Error('db is down'));

    await expect(service.toggle('p1', 'u1')).rejects.toThrow('db is down');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- src/engagement/services/like.service.spec.ts`
Expected: FAIL — `Cannot find module './like.service'` (아직 파일이 없음).

- [ ] **Step 3: `LikeService` 구현**

`src/engagement/services/like.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class LikeService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(photoId: string, userId: string): Promise<ToggleLikeResult> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== 'ACTIVE') {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    let liked: boolean;
    try {
      await this.prisma.like.create({ data: { userId, photoId } });
      liked = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // 동시에 같은 사용자가 두 번 토글해서 create가 unique 제약에 걸렸다는 뜻 —
      // 이미 좋아요가 있는 상태이므로 토글 의미상 지운다.
      await this.prisma.like.deleteMany({ where: { userId, photoId } });
      liked = false;
    }

    const likeCount = await this.prisma.like.count({ where: { photoId } });
    return { liked, likeCount };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- src/engagement/services/like.service.spec.ts`
Expected: PASS 5/5.

- [ ] **Step 5: 실패하는 e2e 테스트 작성 (컨트롤러/모듈이 아직 없으므로 라우트 자체가 없다)**

`test/engagement-like.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const USER_EMAIL = 'engagement-like-user@example.com';

describe('POST /photos/:id/like', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let photoId: string;
  let hiddenPhotoId: string;

  async function loginAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'password123' });
    return agent;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const authService = moduleRef.get(AuthService);
    const user = await authService.register({ email: USER_EMAIL, password: 'password123' });
    userId = user.id;

    const photo = await prisma.photo.create({ data: { userId, originalKey: 'engagement-like-k' } });
    photoId = photo.id;

    const hiddenPhoto = await prisma.photo.create({
      data: { userId, originalKey: 'engagement-like-hidden-k', status: 'HIDDEN' },
    });
    hiddenPhotoId = hiddenPhoto.id;
  });

  afterAll(async () => {
    // Like.photoId가 Photo를 참조하는 FK라서 Photo보다 먼저 지운다.
    await prisma.like.deleteMany({ where: { userId } });
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401 and does not create a like', async () => {
    await request(app.getHttpServer()).post(`/photos/${photoId}/like`).expect(401);

    const count = await prisma.like.count({ where: { photoId } });
    expect(count).toBe(0);
  });

  it('returns 404 for a photo that does not exist', async () => {
    const agent = await loginAgent(USER_EMAIL);
    await agent.post('/photos/non-existent-id/like').expect(404);
  });

  it('returns 404 for a photo that is not ACTIVE', async () => {
    const agent = await loginAgent(USER_EMAIL);
    await agent.post(`/photos/${hiddenPhotoId}/like`).expect(404);
  });

  it('likes on first toggle, then unlikes on second toggle', async () => {
    const agent = await loginAgent(USER_EMAIL);

    const firstRes = await agent.post(`/photos/${photoId}/like`).expect(201);
    expect(firstRes.body).toEqual({ liked: true, likeCount: 1 });

    const secondRes = await agent.post(`/photos/${photoId}/like`).expect(201);
    expect(secondRes.body).toEqual({ liked: false, likeCount: 0 });
  });
});
```

- [ ] **Step 6: e2e 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- test/engagement-like.e2e-spec.ts`
Expected: FAIL — `/photos/:id/like` 라우트가 없어 전부 404 (401을 기대한 첫 테스트도 404로 실패).

- [ ] **Step 7: 컨트롤러 + 모듈 생성, `app.module.ts`에 연결**

`src/engagement/engagement.controller.ts`:

```ts
import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LikeService } from './services/like.service';

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class EngagementController {
  constructor(private readonly likeService: LikeService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.likeService.toggle(id, req.user.id);
  }
}
```

`src/engagement/engagement.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EngagementController } from './engagement.controller';
import { LikeService } from './services/like.service';

@Module({
  imports: [PrismaModule],
  controllers: [EngagementController],
  providers: [LikeService],
})
export class EngagementModule {}
```

`src/app.module.ts` 수정 — 8번째 줄 뒤에 import 추가, 11번째 줄의 imports 배열에 추가:

```ts
import { DiscoveryModule } from './discovery/discovery.module';
import { EngagementModule } from './engagement/engagement.module';

@Module({
  imports: [PrismaModule, AuthModule, PhotosModule, DiscoveryModule, EngagementModule],
```

- [ ] **Step 8: e2e 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- test/engagement-like.e2e-spec.ts`
Expected: PASS 4/4.

- [ ] **Step 9: 커밋**

```bash
git add src/engagement/services/like.service.ts src/engagement/services/like.service.spec.ts src/engagement/engagement.controller.ts src/engagement/engagement.module.ts src/app.module.ts test/engagement-like.e2e-spec.ts
git commit -m "feat: POST /photos/:id/like 좋아요 토글 엔드포인트 추가"
```

---

## Task 2: 사진 신고 제출 — `ReportService` + `POST /photos/:id/reports`

**Files:**
- Create: `src/engagement/dto/create-report.dto.ts`
- Create: `src/engagement/services/report.service.ts`
- Modify: `src/engagement/engagement.controller.ts` (Task 1에서 만든 파일에 라우트 추가)
- Modify: `src/engagement/engagement.module.ts` (Task 1에서 만든 파일에 provider 추가)
- Test: `test/engagement-report.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1의 `EngagementController` 클래스(같은 파일에 라우트 추가, 생성자에 `reportService: ReportService` 추가), Task 1의 `EngagementModule` 클래스(providers 배열에 `ReportService` 추가), `JwtAuthGuard`, `AuthedRequest` 타입(Task 1에서 이미 선언됨, 재사용).
- Produces: `ReportService.submit(photoId: string, reporterId: string, input: { reason: ReportReason; detail?: string }): Promise<{ id: string; photoId: string; reason: ReportReason; status: ReportStatus; createdAt: Date }>` (throws `NotFoundException`일 때는 사진 행 자체가 없을 때뿐 — `status`는 보지 않는다). `CreateReportDto { reason: ReportReason; detail?: string }`.

이 서비스는 **사진 행이 있는지만** 확인한다 (상태 무관) — Review Focus 4번 참고. `Photo.status`는 절대 건드리지 않는다 — 운영자 수동 조치 영역이다 (Global Constraints 참고).

- [ ] **Step 1: DTO 동작을 스파이크로 먼저 확인했음을 전제로, 실패하는 e2e 테스트 작성**

(이 프로젝트는 DTO를 별도 유닛 스펙 대신 e2e HTTP 레벨에서 검증한다 — `GalleryQueryDto`/`SetVisibilityDto`와 동일한 기존 패턴.)

`test/engagement-report.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const REPORTER_EMAIL = 'engagement-report-user@example.com';

describe('POST /photos/:id/reports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reporterId: string;
  let photoId: string;

  async function loginAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'password123' });
    return agent;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const authService = moduleRef.get(AuthService);
    const reporter = await authService.register({ email: REPORTER_EMAIL, password: 'password123' });
    reporterId = reporter.id;

    const photo = await prisma.photo.create({ data: { userId: reporterId, originalKey: 'engagement-report-k' } });
    photoId = photo.id;
  });

  afterAll(async () => {
    // Report.photoId가 Photo를 참조하는 FK라서 Photo보다 먼저 지운다.
    await prisma.report.deleteMany({ where: { reporterId } });
    await prisma.photo.deleteMany({ where: { userId: reporterId } });
    await prisma.user.deleteMany({ where: { email: REPORTER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401 and creates no report', async () => {
    await request(app.getHttpServer()).post(`/photos/${photoId}/reports`).send({ reason: 'PRIVACY' }).expect(401);

    const count = await prisma.report.count({ where: { photoId } });
    expect(count).toBe(0);
  });

  it('returns 404 for a photo that does not exist', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post('/photos/non-existent-id/reports').send({ reason: 'PRIVACY' }).expect(404);
  });

  it('rejects an invalid reason enum with 400', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'SPAM' }).expect(400);
  });

  it('rejects reason OTHER with no detail with 400', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'OTHER' }).expect(400);
  });

  it('rejects reason OTHER with an empty detail with 400', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'OTHER', detail: '' }).expect(400);
  });

  it('accepts a non-OTHER reason with no detail and creates a PENDING report', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    const res = await agent.post(`/photos/${photoId}/reports`).send({ reason: 'PRIVACY' }).expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.photoId).toBe(photoId);
  });

  it('accepts reason OTHER with a non-empty detail', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    const res = await agent
      .post(`/photos/${photoId}/reports`)
      .send({ reason: 'OTHER', detail: '얼굴이 그대로 노출돼요' })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
  });

  it('allows the same photo to accumulate multiple reports (no uniqueness constraint)', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'COPYRIGHT' }).expect(201);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'INAPPROPRIATE' }).expect(201);

    const count = await prisma.report.count({ where: { photoId } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: e2e 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- test/engagement-report.e2e-spec.ts`
Expected: FAIL — `/photos/:id/reports` 라우트가 없어 전부 404 (401을 기대한 첫 테스트도 404로 실패).

- [ ] **Step 3: `CreateReportDto` 구현**

`src/engagement/dto/create-report.dto.ts`:

```ts
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ReportReason } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  // reason이 OTHER일 때만 detail을 필수로 만든다. ValidateIf 조건이 false면
  // 이 프로퍼티의 검증이 완전히 스킵된다(스파이크로 확인) — 다른 사유에선 detail이
  // 있어도 그냥 저장되고, 없어도 통과한다.
  @ValidateIf((dto: CreateReportDto) => dto.reason === ReportReason.OTHER)
  @IsString()
  @IsNotEmpty({ message: '기타 사유는 상세 내용을 입력해야 합니다.' })
  detail?: string;
}
```

- [ ] **Step 4: `ReportService` 구현**

`src/engagement/services/report.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportReason, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubmitReportInput {
  reason: ReportReason;
  detail?: string;
}

export interface SubmittedReport {
  id: string;
  photoId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(photoId: string, reporterId: string, input: SubmitReportInput): Promise<SubmittedReport> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    const report = await this.prisma.report.create({
      data: { photoId, reporterId, reason: input.reason, detail: input.detail },
    });

    return {
      id: report.id,
      photoId: report.photoId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    };
  }
}
```

- [ ] **Step 5: 컨트롤러 + 모듈에 연결**

`src/engagement/engagement.controller.ts` 전체를 아래로 교체 (Task 1 내용에 신고 라우트 추가):

```ts
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LikeService } from './services/like.service';
import { ReportService } from './services/report.service';
import { CreateReportDto } from './dto/create-report.dto';

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class EngagementController {
  constructor(
    private readonly likeService: LikeService,
    private readonly reportService: ReportService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.likeService.toggle(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reports')
  submitReport(@Param('id') id: string, @Body() dto: CreateReportDto, @Req() req: AuthedRequest) {
    return this.reportService.submit(id, req.user.id, { reason: dto.reason, detail: dto.detail });
  }
}
```

`src/engagement/engagement.module.ts` 전체를 아래로 교체:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EngagementController } from './engagement.controller';
import { LikeService } from './services/like.service';
import { ReportService } from './services/report.service';

@Module({
  imports: [PrismaModule],
  controllers: [EngagementController],
  providers: [LikeService, ReportService],
})
export class EngagementModule {}
```

- [ ] **Step 6: e2e 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- test/engagement-report.e2e-spec.ts`
Expected: PASS 8/8.

- [ ] **Step 7: 전체 테스트/타입체크/빌드 확인**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전체 통과 (Task 1의 `engagement-like` 포함, 회귀 없음).

- [ ] **Step 8: 커밋**

```bash
git add src/engagement/dto/create-report.dto.ts src/engagement/services/report.service.ts src/engagement/engagement.controller.ts src/engagement/engagement.module.ts test/engagement-report.e2e-spec.ts
git commit -m "feat: POST /photos/:id/reports 사진 신고 제출 엔드포인트 추가"
```
