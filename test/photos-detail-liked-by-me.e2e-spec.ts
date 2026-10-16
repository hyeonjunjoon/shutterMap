import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const LIKER_EMAIL = 'photos-detail-liker@example.com';
const OTHER_EMAIL = 'photos-detail-liker-other@example.com';

describe('GET /photos/:id likedByMe', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let likerId: string;
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
    const liker = await authService.register({ email: LIKER_EMAIL, password: 'password123' });
    await authService.register({ email: OTHER_EMAIL, password: 'password123' });
    likerId = liker.id;

    const photo = await prisma.photo.create({ data: { userId: likerId, originalKey: 'liked-by-me-k' } });
    photoId = photo.id;
    await prisma.like.create({ data: { userId: likerId, photoId } });
  });

  afterAll(async () => {
    await prisma.like.deleteMany({ where: { userId: likerId } });
    await prisma.photo.deleteMany({ where: { userId: likerId } });
    await prisma.user.deleteMany({ where: { email: { in: [LIKER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns likedByMe: false for an unauthenticated request (does not 401)', async () => {
    const res = await request(app.getHttpServer()).get(`/photos/${photoId}`).expect(200);
    expect(res.body.likedByMe).toBe(false);
  });

  it('returns likedByMe: true for the user who liked it', async () => {
    const agent = await loginAgent(LIKER_EMAIL);
    const res = await agent.get(`/photos/${photoId}`).expect(200);
    expect(res.body.likedByMe).toBe(true);
  });

  it('returns likedByMe: false for a different logged-in user', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    const res = await agent.get(`/photos/${photoId}`).expect(200);
    expect(res.body.likedByMe).toBe(false);
  });
});
