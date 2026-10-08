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
    const reporter = await authService.register({ email: REPORTER_EMAIL, password: 'password123' });
    reporterId = reporter.id;

    const photo = await prisma.photo.create({ data: { userId: reporterId, originalKey: 'engagement-report-k' } });
    photoId = photo.id;

    const hiddenPhoto = await prisma.photo.create({
      data: { userId: reporterId, originalKey: 'engagement-report-hidden-k', status: 'HIDDEN' },
    });
    hiddenPhotoId = hiddenPhoto.id;
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

  it('rejects reason OTHER with a whitespace-only detail with 400', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'OTHER', detail: '   ' }).expect(400);
  });

  it('rejects a non-string detail with 400 instead of a 500 from the DB layer', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    await agent.post(`/photos/${photoId}/reports`).send({ reason: 'PRIVACY', detail: 123 }).expect(400);
  });

  it('accepts a report on a HIDDEN photo and does not touch the photo status', async () => {
    const agent = await loginAgent(REPORTER_EMAIL);
    const res = await agent.post(`/photos/${hiddenPhotoId}/reports`).send({ reason: 'PRIVACY' }).expect(201);

    expect(res.body.status).toBe('PENDING');

    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: hiddenPhotoId } });
    expect(photo.status).toBe('HIDDEN');
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
