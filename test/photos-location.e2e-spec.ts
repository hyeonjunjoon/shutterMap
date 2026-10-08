import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';

const OWNER_EMAIL = 'photos-location-owner@example.com';
const OTHER_EMAIL = 'photos-location-other@example.com';

describe('PATCH /photos/:id/location', () => {
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
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(401);
  });

  it('rejects an invalid latitude with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 999, lng: 127.0 }).expect(400);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(403);
  });

  it('sets the location as MANUAL for the owner', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(200);

    const coords = await photoLocationService.getCoordinates(photoId);
    expect(coords?.lat).toBeCloseTo(37.5, 5);
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.locationSource).toBe('MANUAL');
  });

  it('fills in a fuzzy offset for a no-gps photo left at the default FUZZY visibility', async () => {
    // 이 사진은 visibility 기본값(FUZZY)을 그대로 두고, GPS 없이 수동 위치만 등록하는
    // 가장 흔한 케이스다 — 이 경우에도 지도에 핀이 떠야 한다.
    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'k2' } });
    const agent = await loginAgent(OWNER_EMAIL);

    await agent.patch(`/photos/${photo.id}/location`).send({ lat: 10, lng: 10 }).expect(200);

    const updated = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(updated.fuzzyOffsetLat).not.toBeNull();
    expect(updated.fuzzyOffsetLng).not.toBeNull();
  });
});
