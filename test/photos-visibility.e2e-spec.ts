import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';

const OWNER_EMAIL = 'photos-visibility-owner@example.com';
const OTHER_EMAIL = 'photos-visibility-other@example.com';

describe('PATCH /photos/:id/visibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photoLocationService: PhotoLocationService;
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
    photoLocationService = moduleRef.get(PhotoLocationService);

    const authService = moduleRef.get(AuthService);
    const owner = await authService.register({ email: OWNER_EMAIL, password: 'password123' });
    await authService.register({ email: OTHER_EMAIL, password: 'password123' });
    ownerId = owner.id;

    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'k' } });
    photoId = photo.id;
    await photoLocationService.setLocation(photoId, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(401);
  });

  it('rejects an invalid enum value with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'SECRET' }).expect(400);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(403);
  });

  it('switches to HIDDEN and back to FUZZY without regenerating the offset', async () => {
    const agent = await loginAgent(OWNER_EMAIL);

    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'FUZZY' }).expect(200);
    const afterFirstFuzzy = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });

    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(200);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'FUZZY' }).expect(200);
    const afterSecondFuzzy = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });

    expect(afterSecondFuzzy.fuzzyOffsetLat).toBe(afterFirstFuzzy.fuzzyOffsetLat);
    expect(afterSecondFuzzy.fuzzyOffsetLng).toBe(afterFirstFuzzy.fuzzyOffsetLng);
  });
});
