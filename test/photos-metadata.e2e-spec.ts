import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const OWNER_EMAIL = 'photos-metadata-owner@example.com';
const OTHER_EMAIL = 'photos-metadata-other@example.com';

describe('PATCH /photos/:id/metadata', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
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
    const owner = await authService.register({ email: OWNER_EMAIL, password: 'password123' });
    await authService.register({ email: OTHER_EMAIL, password: 'password123' });
    ownerId = owner.id;

    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'metadata-k' } });
    photoId = photo.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).patch(`/photos/${photoId}/metadata`).send({ lensName: 'x' }).expect(401);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.patch(`/photos/${photoId}/metadata`).send({ lensName: 'x' }).expect(403);
  });

  it('returns 404 for a photo that does not exist', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch('/photos/non-existent-id/metadata').send({ lensName: 'x' }).expect(404);
  });

  it('rejects a blank cameraName with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/metadata`).send({ cameraName: '' }).expect(400);
  });

  it('rejects a non-numeric focalLength with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/metadata`).send({ focalLength: 'seventy' }).expect(400);
  });

  it('updates only the provided fields, leaving the rest untouched', async () => {
    const agent = await loginAgent(OWNER_EMAIL);

    await agent
      .patch(`/photos/${photoId}/metadata`)
      .send({ cameraName: 'ILCE-7M4', lensName: 'FE 24-70mm F2.8 GM', focalLength: 70, aperture: 2.8, note: '한강에서' })
      .expect(200);

    let saved = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(saved.cameraName).toBe('ILCE-7M4');
    expect(saved.lensName).toBe('FE 24-70mm F2.8 GM');
    expect(saved.focalLength).toBe(70);
    expect(saved.aperture).toBe(2.8);
    expect(saved.note).toBe('한강에서');

    // lensName만 바꿔도 나머지는 그대로 — 부분 업데이트 확인
    await agent.patch(`/photos/${photoId}/metadata`).send({ lensName: 'FE 70-200mm F2.8 GM' }).expect(200);

    saved = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(saved.lensName).toBe('FE 70-200mm F2.8 GM');
    expect(saved.cameraName).toBe('ILCE-7M4'); // 안 보낸 필드는 유지
    expect(saved.note).toBe('한강에서');
  });

  it('allows clearing note to an empty string', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/metadata`).send({ note: '' }).expect(200);

    const saved = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(saved.note).toBe('');
  });
});
