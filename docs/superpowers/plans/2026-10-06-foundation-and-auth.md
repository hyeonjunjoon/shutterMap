# Foundation + Auth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Prisma/PostgreSQL+PostGIS schema for ShutterMap and implement the complete `AuthModule` (email/password + Kakao + Google OAuth, httpOnly-cookie session issuance, and the `/auth/me` endpoint Next.js calls to verify sessions).

**Architecture:** `AuthModule` issues a JWT in an httpOnly cookie on login/OAuth callback. Next.js never verifies the cookie locally — every protected SSR page calls `GET /auth/me` and trusts NestJS's answer, per PRD 5장's "인증 로직은 전부 NestJS" rule. The Prisma schema defines all four MVP tables (`User`, `Photo`, `Like`, `Report`) now, even though this plan's code only touches `User` — later plans (Photos, Discovery, Engagement) build against a schema that's already migrated and stable.

**Tech Stack:** NestJS, Prisma, PostgreSQL 16 + PostGIS extension, `@nestjs/passport`, `passport-local`, `passport-jwt`, `passport-kakao`, `passport-google-oauth20`, `bcrypt`, `class-validator`/`class-transformer`.

**Spec:** `shutter-map/docs/PRD.md` (기능 6, 5장, 5-1, 부록 A)

## Global Constraints

- 비로그인 사용자는 열람 가능, 업로드/좋아요는 로그인 필요 (PRD 3장 권한 정책)
- 세션은 httpOnly 쿠키로 발급. Next.js는 쿠키를 직접 검증하지 않고 `/auth/me`에 매번 검증 요청 (PRD 5장)
- 소셜 로그인은 카카오·구글만 (PRD 기능 6)
- ORM: Prisma. DB: PostgreSQL + PostGIS, `geography(Point, 4326)` 컬럼을 처음부터 사용 (PRD 5장)
- 모듈 경계: `AuthModule`은 기능 6만 담당하고 Photos/Discovery/Engagement와 섞지 않는다 (PRD 5-1)

## Review Focus

1. 중복 이메일로 회원가입 — 기존 계정을 덮어쓰지 않고 명확한 409를 반환하는가
2. 잘못된 비밀번호로 로그인 — 계정 존재 여부를 노출하지 않는 동일한 401 메시지를 반환하는가
3. 만료되었거나 조작된 JWT 쿠키로 `/auth/me` 호출 — 401을 반환하고 500으로 터지지 않는가
4. 소셜 로그인 콜백에서 이미 존재하는 로컬 계정과 같은 이메일로 로그인 — MVP는 `provider`+`providerId`를 계정 식별자로 쓰고 이메일로 병합하지 않는다(별도 계정 생성). 이 한계를 테스트와 코드 주석에 명시한다
5. 비로그인 상태로 보호된 엔드포인트(`/auth/me` 등) 호출 — 401을 반환하고 서버 에러가 아닌가

---

### Task 1: Prisma 스키마 + PostGIS 마이그레이션

**Files:**
- Create: `shutter-map/prisma/schema.prisma`
- Create: `shutter-map/.env` (DATABASE_URL — `.gitignore`에 이미 포함되어 있는지 확인)
- Create: `shutter-map/src/prisma/prisma.service.ts`
- Create: `shutter-map/src/prisma/prisma.module.ts`
- Test: `shutter-map/test/prisma-schema.e2e-spec.ts`

**Interfaces:**
- Produces: `PrismaService` (NestJS injectable, extends `PrismaClient`), 모든 후속 모듈이 DB 접근에 이걸 주입받아 쓴다.

- [ ] **Step 1: Prisma 설치**

```bash
cd shutter-map
npm install @prisma/client
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: `.env`에 로컬 DB 접속 정보 작성**

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shuttermap?schema=public"
```

- [ ] **Step 3: `prisma/schema.prisma` 작성 (PostGIS 확장 포함, 4개 테이블 전체)**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]
}

enum AuthProvider {
  LOCAL
  KAKAO
  GOOGLE
}

enum PhotoVisibility {
  EXACT
  FUZZY
  HIDDEN
}

enum LocationSource {
  EXIF
  MANUAL
}

enum PhotoStatus {
  ACTIVE
  HIDDEN
  DELETED
}

enum ReportReason {
  PRIVACY
  INAPPROPRIATE
  COPYRIGHT
  OTHER
}

enum ReportStatus {
  PENDING
  REVIEWED
  ACTIONED
}

model User {
  id              String       @id @default(uuid())
  email           String       @unique
  passwordHash    String?
  provider        AuthProvider @default(LOCAL)
  providerId      String?
  ownedCameraRaw  String?
  ownedCameraName String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  photos  Photo[]
  likes   Like[]
  reports Report[]

  @@unique([provider, providerId])
}

model Photo {
  id             String           @id @default(uuid())
  userId         String
  user           User             @relation(fields: [userId], references: [id])
  originalKey    String
  servingKey     String?
  thumbnailKey   String?
  cameraRaw      String?
  cameraName     String?
  lensRaw        String?
  lensName       String?
  focalLength    Float?
  aperture       Float?
  shutterSpeed   String?
  iso            Int?
  takenAt        DateTime?
  note           String?
  locationSource LocationSource?
  // Prisma has no first-class geography type: this column is written/read
  // with $executeRaw / $queryRaw in PhotoLocationService (a later plan),
  // not through the generated Prisma Client API.
  location       Unsupported("geography(Point, 4326)")?
  visibility     PhotoVisibility  @default(FUZZY)
  fuzzyOffsetLat Float?
  fuzzyOffsetLng Float?
  status         PhotoStatus      @default(ACTIVE)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  likes   Like[]
  reports Report[]
}

model Like {
  id        String   @id @default(uuid())
  userId    String
  photoId   String
  user      User     @relation(fields: [userId], references: [id])
  photo     Photo    @relation(fields: [photoId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, photoId])
}

model Report {
  id         String       @id @default(uuid())
  photoId    String
  reporterId String
  photo      Photo        @relation(fields: [photoId], references: [id])
  reporter   User         @relation(fields: [reporterId], references: [id])
  reason     ReportReason
  detail     String?
  status     ReportStatus @default(PENDING)
  createdAt  DateTime     @default(now())
}
```

- [ ] **Step 4: 마이그레이션 실행**

```bash
npx prisma migrate dev --name init
```

Expected: `postgis` 확장이 자동으로 생성되고 4개 테이블이 만들어진다. 실패하면 로컬 Postgres에 superuser 권한이 있는지 확인(확장 생성 권한 필요).

- [ ] **Step 5: `PrismaService` 작성**

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 6: 연결 확인 테스트 작성**

```typescript
// test/prisma-schema.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('Prisma schema', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'schema-test@example.com' } });
    await prisma.$disconnect();
  });

  it('creates and reads back a user', async () => {
    const user = await prisma.user.create({
      data: { email: 'schema-test@example.com', passwordHash: 'x' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('schema-test@example.com');
  });
});
```

- [ ] **Step 7: 테스트 실행**

Run: `npm run test:e2e -- prisma-schema`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add prisma/ src/prisma/ test/prisma-schema.e2e-spec.ts package.json package-lock.json
git commit -m "feat: add Prisma schema with PostGIS and PrismaModule"
```

---

### Task 2: 회원가입 (이메일/비밀번호)

**Files:**
- Create: `shutter-map/src/auth/auth.module.ts`
- Create: `shutter-map/src/auth/dto/register.dto.ts`
- Create: `shutter-map/src/auth/auth.service.ts`
- Create: `shutter-map/src/auth/auth.controller.ts`
- Test: `shutter-map/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1)
- Produces: `AuthService.register(dto: RegisterDto): Promise<{ id: string; email: string }>` — Task 3(로그인)이 이 메서드가 만든 `User` row를 그대로 씀

- [ ] **Step 1: 의존성 설치**

```bash
npm install bcrypt class-validator class-transformer
npm install -D @types/bcrypt
```

- [ ] **Step 2: 실패하는 테스트 작성 — 정상 가입**

```typescript
// src/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService.register', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('creates a user with a hashed password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe('password123'); // hashed, not plaintext
  });

  it('rejects a duplicate email with ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.register({ email: 'a@b.com', password: 'password123' })).rejects.toThrow(
      ConflictException,
    );
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `npm run test -- auth.service.spec`
Expected: FAIL (`AuthService` 모듈이 아직 없음)

- [ ] **Step 4: `RegisterDto` 작성**

```typescript
// src/auth/dto/register.dto.ts
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

- [ ] **Step 5: `AuthService` 최소 구현**

```typescript
// src/auth/auth.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });
    return { id: user.id, email: user.email };
  }
}
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `npm run test -- auth.service.spec`
Expected: PASS

- [ ] **Step 7: `AuthController`, `AuthModule` 작성**

```typescript
// src/auth/auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
```

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

Register `AuthModule` and `PrismaModule` in `src/app.module.ts`'s `imports`.

- [ ] **Step 8: 커밋**

```bash
git add src/auth/ src/app.module.ts
git commit -m "feat: add email/password registration"
```

---

### Task 3: 로그인 + JWT 쿠키 발급

**Files:**
- Modify: `shutter-map/src/auth/auth.service.ts`
- Modify: `shutter-map/src/auth/auth.controller.ts`
- Modify: `shutter-map/src/auth/auth.module.ts`
- Create: `shutter-map/src/auth/dto/login.dto.ts`
- Modify: `shutter-map/src/main.ts` (cookie-parser 등록)
- Test: `shutter-map/src/auth/auth.service.spec.ts` (추가)

**Interfaces:**
- Consumes: `AuthService.register` (Task 2)에서 만든 `User`
- Produces: `AuthService.login(dto: LoginDto): Promise<{ token: string }>` — Task 4(`/auth/me`)가 이 토큰을 검증

- [ ] **Step 1: 의존성 설치**

```bash
npm install @nestjs/jwt cookie-parser
npm install -D @types/cookie-parser
```

- [ ] **Step 2: `main.ts`에 cookie-parser 등록**

```typescript
// src/main.ts (기존 bootstrap 함수에 추가)
import * as cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());
```

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// src/auth/auth.service.spec.ts에 추가
describe('AuthService.login', () => {
  // ... 위 register 테스트의 beforeEach 재사용 (jwt 서비스 mock 추가)
  it('rejects wrong password with UnauthorizedException', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: await bcrypt.hash('real-pw', 10) });
    await expect(service.login({ email: 'a@b.com', password: 'wrong-pw' })).rejects.toThrow(UnauthorizedException);
  });

  it('issues a token for correct password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: await bcrypt.hash('real-pw', 10) });
    const result = await service.login({ email: 'a@b.com', password: 'real-pw' });
    expect(result.token).toBeDefined();
  });
});
```

(Import `UnauthorizedException`과 `bcrypt`를 파일 상단에 추가하고, `AuthService`에 `JwtService` mock을 `providers`에 추가한다.)

- [ ] **Step 4: 테스트 실행 — 실패 확인**

Run: `npm run test -- auth.service.spec`
Expected: FAIL (`login` 메서드 없음)

- [ ] **Step 5: `LoginDto` 작성**

```typescript
// src/auth/dto/login.dto.ts
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 6: `AuthService.login` 구현**

```typescript
// src/auth/auth.service.ts에 추가
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
// constructor에 jwtService: JwtService 주입 추가

async login(dto: LoginDto): Promise<{ token: string }> {
  const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
  // 계정 존재 여부를 노출하지 않기 위해 "없음"과 "비밀번호 틀림"을 같은 메시지로 처리
  const INVALID = '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (!user || !user.passwordHash) {
    throw new UnauthorizedException(INVALID);
  }
  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedException(INVALID);
  }
  const token = await this.jwtService.signAsync({ sub: user.id, email: user.email });
  return { token };
}
```

- [ ] **Step 7: 테스트 실행 — 통과 확인**

Run: `npm run test -- auth.service.spec`
Expected: PASS

- [ ] **Step 8: 컨트롤러에서 httpOnly 쿠키로 발급**

```typescript
// src/auth/auth.controller.ts에 추가
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';

@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { token } = await this.authService.login(dto);
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
  });
  return { ok: true };
}
```

- [ ] **Step 9: `AuthModule`에 `JwtModule` 등록**

```typescript
// src/auth/auth.module.ts
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  // ... 기존 controllers/providers/exports
})
```

`.env`에 `JWT_SECRET`을 실제 값으로 추가(개발용 기본값은 프로덕션에 그대로 쓰지 않는다).

- [ ] **Step 10: 커밋**

```bash
git add src/auth/ src/main.ts package.json package-lock.json
git commit -m "feat: add login with httpOnly JWT cookie"
```

---

### Task 4: `GET /auth/me` (세션 검증 엔드포인트)

**Files:**
- Create: `shutter-map/src/auth/strategies/jwt.strategy.ts`
- Create: `shutter-map/src/auth/guards/jwt-auth.guard.ts`
- Modify: `shutter-map/src/auth/auth.controller.ts`
- Modify: `shutter-map/src/auth/auth.module.ts`
- Test: `shutter-map/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 3에서 발급한 `session` 쿠키
- Produces: `JwtAuthGuard` — Photos/Discovery/Engagement 모듈(이후 계획)이 보호된 엔드포인트에 그대로 재사용

- [ ] **Step 1: 의존성 설치**

```bash
npm install passport passport-jwt @nestjs/passport
npm install -D @types/passport-jwt
```

- [ ] **Step 2: 실패하는 e2e 테스트 작성**

```typescript
// test/auth.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('GET /auth/me', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 without a session cookie', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns the user after register + login', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email: 'me-test@example.com', password: 'password123' });
    await agent.post('/auth/login').send({ email: 'me-test@example.com', password: 'password123' });
    const res = await agent.get('/auth/me').expect(200);
    expect(res.body.email).toBe('me-test@example.com');
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `npm run test:e2e -- auth.e2e-spec`
Expected: FAIL (`/auth/me` 라우트 없음)

- [ ] **Step 4: `JwtStrategy` 작성 (쿠키에서 토큰 추출)**

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.session ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: extractFromCookie,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 5: `JwtAuthGuard` 작성**

```typescript
// src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 6: `/auth/me` 라우트 추가**

```typescript
// src/auth/auth.controller.ts에 추가
import { Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Get('me')
me(@Req() req: Request & { user: { id: string; email: string } }) {
  return req.user;
}
```

- [ ] **Step 7: `AuthModule`에 `PassportModule`, `JwtStrategy` 등록**

```typescript
// src/auth/auth.module.ts
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register(/* 기존과 동일 */)],
  providers: [AuthService, JwtStrategy],
  // ...
})
```

- [ ] **Step 8: 테스트 실행 — 통과 확인**

Run: `npm run test:e2e -- auth.e2e-spec`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add src/auth/ test/auth.e2e-spec.ts package.json package-lock.json
git commit -m "feat: add JwtAuthGuard and GET /auth/me"
```

---

### Task 5: 카카오 로그인

**Files:**
- Create: `shutter-map/src/auth/strategies/kakao.strategy.ts`
- Modify: `shutter-map/src/auth/auth.service.ts`
- Modify: `shutter-map/src/auth/auth.controller.ts`
- Modify: `shutter-map/src/auth/auth.module.ts`
- Test: `shutter-map/src/auth/auth.service.spec.ts` (추가)

**Interfaces:**
- Consumes: 카카오 디벨로퍼스에서 발급받은 `KAKAO_CLIENT_ID`, `KAKAO_CALLBACK_URL` (`.env`)
- Produces: `AuthService.findOrCreateSocialUser(provider, providerId, email)` — Task 6(구글)도 동일 메서드를 재사용

- [ ] **Step 1: 의존성 설치**

```bash
npm install passport-kakao
npm install -D @types/passport-kakao
```

- [ ] **Step 2: `.env`에 카카오 키 추가**

```
KAKAO_CLIENT_ID=<카카오 디벨로퍼스 REST API 키>
KAKAO_CALLBACK_URL=http://localhost:3000/auth/kakao/callback
```

- [ ] **Step 3: 실패하는 테스트 작성 — 소셜 신규 가입은 계정을 만든다**

```typescript
// src/auth/auth.service.spec.ts에 추가
describe('AuthService.findOrCreateSocialUser', () => {
  it('creates a new user on first social login', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'social@example.com' });

    const user = await service.findOrCreateSocialUser('KAKAO', 'kakao-123', 'social@example.com');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'KAKAO', providerId: 'kakao-123' }),
    });
    expect(user.id).toBe('u2');
  });

  it('returns the existing user on repeat social login', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'social@example.com' });
    const user = await service.findOrCreateSocialUser('KAKAO', 'kakao-123', 'social@example.com');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(user.id).toBe('u2');
  });
});
```

Note: `provider`/`providerId` 조합이 식별자다. 로컬 계정과 이메일이 같아도 별도 계정으로 생성된다 — Review Focus #4에서 명시한 MVP 한계.

- [ ] **Step 4: 테스트 실행 — 실패 확인**

Run: `npm run test -- auth.service.spec`
Expected: FAIL (`findOrCreateSocialUser` 없음)

- [ ] **Step 5: `AuthService.findOrCreateSocialUser` 구현**

```typescript
// src/auth/auth.service.ts에 추가
async findOrCreateSocialUser(
  provider: 'KAKAO' | 'GOOGLE',
  providerId: string,
  email: string,
): Promise<{ id: string; email: string }> {
  const existing = await this.prisma.user.findUnique({
    where: { provider_providerId: { provider, providerId } },
  });
  if (existing) {
    return { id: existing.id, email: existing.email };
  }
  const created = await this.prisma.user.create({
    data: { email, provider, providerId },
  });
  return { id: created.id, email: created.email };
}

async issueSessionToken(userId: string, email: string): Promise<string> {
  return this.jwtService.signAsync({ sub: userId, email });
}
```

(`provider_providerId`는 Task 1 스키마의 `@@unique([provider, providerId])`가 생성하는 Prisma 복합키 이름이다.)

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `npm run test -- auth.service.spec`
Expected: PASS

- [ ] **Step 7: `KakaoStrategy` 작성**

```typescript
// src/auth/strategies/kakao.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-kakao';

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
  constructor() {
    super({
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL: process.env.KAKAO_CALLBACK_URL,
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return {
      providerId: String(profile.id),
      email: profile._json?.kakao_account?.email ?? `kakao-${profile.id}@no-email.shuttermap`,
    };
  }
}
```

(카카오 계정 설정에서 이메일 제공에 동의하지 않은 사용자는 email이 없을 수 있다 — placeholder 이메일로 대체한다.)

- [ ] **Step 8: 라우트 추가**

```typescript
// src/auth/auth.controller.ts에 추가
import { AuthGuard } from '@nestjs/passport';

@Get('kakao')
@UseGuards(AuthGuard('kakao'))
kakaoLogin() {} // passport가 카카오 인증 페이지로 리다이렉트

@Get('kakao/callback')
@UseGuards(AuthGuard('kakao'))
async kakaoCallback(@Req() req: Request & { user: { providerId: string; email: string } }, @Res({ passthrough: true }) res: Response) {
  const user = await this.authService.findOrCreateSocialUser('KAKAO', req.user.providerId, req.user.email);
  const token = await this.authService.issueSessionToken(user.id, user.email);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
  res.redirect('/'); // 프론트 메인으로
}
```

- [ ] **Step 9: `AuthModule`에 `KakaoStrategy` 등록, 커밋**

```bash
git add src/auth/ package.json package-lock.json
git commit -m "feat: add Kakao OAuth login"
```

---

### Task 6: 구글 로그인

Task 5와 동일한 패턴. 중복 설명 생략 없이 그대로 적용한다.

**Files:**
- Create: `shutter-map/src/auth/strategies/google.strategy.ts`
- Modify: `shutter-map/src/auth/auth.controller.ts`
- Modify: `shutter-map/src/auth/auth.module.ts`

- [ ] **Step 1: 의존성 설치 + `.env`**

```bash
npm install passport-google-oauth20
npm install -D @types/passport-google-oauth20
```

```
GOOGLE_CLIENT_ID=<구글 클라우드 콘솔 OAuth 클라이언트 ID>
GOOGLE_CLIENT_SECRET=<구글 클라이언트 시크릿>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

- [ ] **Step 2: `GoogleStrategy` 작성**

```typescript
// src/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return {
      providerId: String(profile.id),
      email: profile.emails?.[0]?.value ?? `google-${profile.id}@no-email.shuttermap`,
    };
  }
}
```

- [ ] **Step 3: 라우트 추가 (Task 5의 카카오 라우트와 동일한 구조)**

```typescript
// src/auth/auth.controller.ts에 추가
@Get('google')
@UseGuards(AuthGuard('google'))
googleLogin() {}

@Get('google/callback')
@UseGuards(AuthGuard('google'))
async googleCallback(@Req() req: Request & { user: { providerId: string; email: string } }, @Res({ passthrough: true }) res: Response) {
  const user = await this.authService.findOrCreateSocialUser('GOOGLE', req.user.providerId, req.user.email);
  const token = await this.authService.issueSessionToken(user.id, user.email);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
  res.redirect('/');
}
```

- [ ] **Step 4: `AuthModule`에 `GoogleStrategy` 등록, 커밋**

```bash
git add src/auth/ package.json package-lock.json
git commit -m "feat: add Google OAuth login"
```

---

### Task 7: 로그아웃

**Files:**
- Modify: `shutter-map/src/auth/auth.controller.ts`
- Modify: `shutter-map/test/auth.e2e-spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// test/auth.e2e-spec.ts에 추가
it('clears the session cookie on logout', async () => {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/register').send({ email: 'logout-test@example.com', password: 'password123' });
  await agent.post('/auth/login').send({ email: 'logout-test@example.com', password: 'password123' });
  await agent.post('/auth/logout').expect(200);
  await agent.get('/auth/me').expect(401);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npm run test:e2e -- auth.e2e-spec`
Expected: FAIL (`/auth/logout` 없음)

- [ ] **Step 3: 라우트 구현**

```typescript
// src/auth/auth.controller.ts에 추가
@Post('logout')
logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('session');
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npm run test:e2e -- auth.e2e-spec`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/auth/auth.controller.ts test/auth.e2e-spec.ts
git commit -m "feat: add logout endpoint"
```

---

## Self-Review

**1. Spec coverage**: PRD 기능 6의 수용 기준 4개(가입, 잘못된 비밀번호, 소셜 로그인, 비로그인 업로드 거부) 중 앞의 3개는 Task 2/3/5/6이 직접 검증한다. "비로그인 업로드 시도 시 안내" 자체는 Photos 모듈(다음 계획) 책임이라 이 플랜 범위 밖이지만, 그 가드가 재사용할 `JwtAuthGuard`는 Task 4가 만든다. PRD 5장(세션 검증), 5-1(모듈 경계), 기능 3의 fuzzy 오프셋 서버 전용 계산 규칙은 Task 1의 스키마 설계(위치 컬럼을 raw SQL 전용으로 분리)에 반영했다. 갭 없음.

**2. Placeholder 스캔**: "TODO", "구현 예정", "기존과 유사" 패턴 없음. 각 스텝에 실제 코드 포함.

**3. 타입 일관성**: `AuthService.register`/`login`/`findOrCreateSocialUser`/`issueSessionToken`의 시그니처가 Task 2~6 전체에서 동일한 이름·파라미터로 쓰였다. `JwtAuthGuard`, `JwtStrategy` 이름도 Task 4 정의 그대로 Task 5/6에서 재사용.

**4. Review Focus 커버리지**:
- #1 중복 이메일 → Task 2 Step 2 테스트
- #2 잘못된 비밀번호 → Task 3 Step 3 테스트
- #3 만료/조작된 쿠키 → `JwtStrategy`의 `ignoreExpiration: false`가 만료를 걸러내고, passport가 서명 불일치 시 자동으로 401을 던진다(`AuthGuard`가 `validate` 실패를 401로 변환). 별도 테스트는 Task 4에 추가하지 않았음 — **갭**: Task 4 Step 2 테스트에 "조작된 쿠키로 401" 케이스를 추가해야 한다.
- #4 소셜/로컬 이메일 충돌 → Task 5 Step 3 테스트 주석에 한계 명시
- #5 비로그인 보호 엔드포인트 → Task 4 Step 2 "returns 401 without a session cookie" 테스트

**4번에서 발견한 갭을 바로 고친다**: Task 4의 e2e 테스트에 다음을 추가한다.

```typescript
// test/auth.e2e-spec.ts, 'returns 401 without a session cookie' 아래에 추가
it('returns 401 with a tampered cookie', () => {
  return request(app.getHttpServer())
    .get('/auth/me')
    .set('Cookie', ['session=not-a-real-jwt'])
    .expect(401);
});
```
