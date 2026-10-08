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
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT' } });
    await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(127.0, 37.0), 4326)::geography WHERE id = ${photo.id}`;

    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '36.9', maxLat: '37.1', minLng: '126.9', maxLng: '127.1' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(photo.id);
    expect(res.body[0].lat).toBeCloseTo(37.0, 5);
    expect(res.body[0].lng).toBeCloseTo(127.0, 5);
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

  it('returns an empty array when no pins are in range', async () => {
    const res = await request(app.getHttpServer())
      .get('/discovery/map')
      .query({ minLat: '0.9', maxLat: '1.1', minLng: '0.9', maxLng: '1.1' })
      .expect(200);
    expect(res.body).toEqual([]);
  });
});
