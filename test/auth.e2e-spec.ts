import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const FINAL_FIX_TEST_EMAILS = [
  'dup-test@example.com',
  'wrongpw-test@example.com',
  'shared-email@example.com',
];

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

  it('returns 401 with a tampered cookie', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', ['session=not-a-real-jwt'])
      .expect(401);
  });

  it('returns the user after register + login', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email: 'me-test@example.com', password: 'password123' });
    await agent.post('/auth/login').send({ email: 'me-test@example.com', password: 'password123' });
    const res = await agent.get('/auth/me').expect(200);
    expect(res.body.email).toBe('me-test@example.com');
  });

  it('clears the session cookie on logout', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email: 'logout-test@example.com', password: 'password123' });
    await agent.post('/auth/login').send({ email: 'logout-test@example.com', password: 'password123' });
    await agent.post('/auth/logout').expect(200);
    await agent.get('/auth/me').expect(401);
  });
});

describe('Auth — final review fixes', () => {
  let app: INestApplication;
  let authService: AuthService;
  let jwtService: JwtService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    authService = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: FINAL_FIX_TEST_EMAILS } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: FINAL_FIX_TEST_EMAILS } } });
    await app.close();
  });

  it('rejects invalid input with 400 (ValidationPipe)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '1' })
      .expect(400);
  });

  it('returns 409 on a real duplicate register (not a 500)', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dup-test@example.com', password: 'password123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dup-test@example.com', password: 'password123' })
      .expect(409);
  });

  it('returns the identical 401 body for an unknown email and a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'wrongpw-test@example.com', password: 'password123' });

    const unknownRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-such-user@example.com', password: 'whatever123' })
      .expect(401);
    const wrongPwRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'wrongpw-test@example.com', password: 'wrong-password' })
      .expect(401);

    expect(unknownRes.body.message).toEqual(wrongPwRes.body.message);
  });

  it('returns 401 for an expired JWT cookie', async () => {
    const expiredToken = await jwtService.signAsync({ sub: 'u1', email: 'expired@example.com' }, { expiresIn: '-10s' });
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', [`session=${expiredToken}`])
      .expect(401);
  });

  it('creates a separate account for a social login that shares a local account\'s email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'shared-email@example.com', password: 'password123' })
      .expect(201);

    const socialUser = await authService.findOrCreateSocialUser('KAKAO', 'kakao-shared-1', 'shared-email@example.com');

    expect(socialUser.email).toBe('shared-email@example.com');
  });
});

// Regression: ISSUE-002, ISSUE-003 — found by /qa on 2026-10-07
// Report: .gstack/qa-reports/qa-report-auth-module-2026-10-07.md
describe('Auth — QA findings', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const QA_TEST_EMAILS = ['casetest@example.com', 'bcrypttest@example.com'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: QA_TEST_EMAILS } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: QA_TEST_EMAILS } } });
    await app.close();
  });

  it('ISSUE-002: logs in with an email that differs only by case from registration', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'CaseTest@Example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'casetest@example.com', password: 'password123' })
      .expect(201);
  });

  it('ISSUE-003: rejects a password longer than bcrypt\'s 72-byte limit instead of silently truncating it', async () => {
    const tooLong = 'a'.repeat(73);
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bcrypttest@example.com', password: tooLong })
      .expect(400);
  });
});
