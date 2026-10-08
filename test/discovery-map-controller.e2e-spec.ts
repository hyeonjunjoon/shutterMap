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
    // discovery API는 유저 범위 없이 전역으로 조회하므로, 같은 bounds를 쓰는 다른
    // e2e 파일이 병렬로 떠 있을 때도 깨지지 않도록 "내가 만든 사진이 결과에 있는지"로
    // 확인한다 — 결과 배열 전체 길이는 다른 테스트의 데이터로 늘어날 수 있다.
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT' } });
    await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(127.0, 37.0), 4326)::geography WHERE id = ${photo.id}`;

    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '36.9', maxLat: '37.1', minLng: '126.9', maxLng: '127.1' })
      .expect(200);

    const pin = res.body.find((p: { id: string }) => p.id === photo.id);
    expect(pin).toBeDefined();
    expect(pin.lat).toBeCloseTo(37.0, 5);
    expect(pin.lng).toBeCloseTo(127.0, 5);
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

  it('does not return a photo placed outside the queried bounds', async () => {
    const farPhoto = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT' } });
    await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography WHERE id = ${farPhoto.id}`;

    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '36.9', maxLat: '37.1', minLng: '126.9', maxLng: '127.1' })
      .expect(200);

    expect(res.body.find((p: { id: string }) => p.id === farPhoto.id)).toBeUndefined();
  });
});
