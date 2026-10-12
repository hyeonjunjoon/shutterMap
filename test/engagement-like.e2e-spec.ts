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
