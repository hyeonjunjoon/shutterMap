import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from '../src/discovery/services/photo-filter.service';

describe('PhotoFilterService', () => {
  let prisma: PrismaService;
  let service: PhotoFilterService;
  let userId: string;
  let ids: { a: string; b: string; c: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoFilterService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(PhotoFilterService);

    const user = await prisma.user.create({ data: { email: 'photo-filter-test@example.com', passwordHash: 'x' } });
    userId = user.id;
    const a = await prisma.photo.create({
      data: { userId, originalKey: 'k', cameraName: 'ILCE-7M4', lensName: 'FE 24-70mm F2.8 GM', focalLength: 35, aperture: 1.8 },
    });
    const b = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'X100VI', focalLength: 23, aperture: 2.0 } });
    const c = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: 'ILCE-7M4', focalLength: 85, aperture: 1.4 } });
    ids = { a: a.id, b: b.id, c: c.id };
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function idsViaPrismaWhere(filters: SharedPhotoFilters) {
    const where = service.toPrismaWhere(filters);
    const rows = await prisma.photo.findMany({ where: { ...where, userId }, select: { id: true } });
    return rows.map((r) => r.id).sort();
  }

  async function idsViaSql(filters: SharedPhotoFilters) {
    const conditions = service.toSqlConditions(filters);
    const whereSql = Prisma.join([...conditions, Prisma.sql`"userId" = ${userId}`], ' AND ');
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Photo" WHERE ${whereSql}`;
    return rows.map((r) => r.id).sort();
  }

  it('camera 필터가 Prisma where와 raw SQL 양쪽에서 같은 결과를 낸다', async () => {
    const filters = { cameraName: 'ILCE-7M4' };
    const expected = [ids.a, ids.c].sort();
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('focalLength 범위 필터가 양쪽에서 같은 결과를 낸다', async () => {
    const filters = { minFocalLength: 30, maxFocalLength: 50 };
    const expected = [ids.a];
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('lens + aperture 범위를 같이 걸어도 양쪽이 같다', async () => {
    const filters = { lensName: 'FE 24-70mm F2.8 GM', maxAperture: 2.0 };
    const expected = [ids.a];
    expect(await idsViaPrismaWhere(filters)).toEqual(expected);
    expect(await idsViaSql(filters)).toEqual(expected);
  });

  it('필터가 없으면 둘 다 이 유저의 ACTIVE 사진 전체를 반환한다', async () => {
    const expected = [ids.a, ids.b, ids.c].sort();
    expect(await idsViaPrismaWhere({})).toEqual(expected);
    expect(await idsViaSql({})).toEqual(expected);
  });
});
