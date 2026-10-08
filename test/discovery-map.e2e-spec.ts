import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoFilterService } from '../src/discovery/services/photo-filter.service';
import { DiscoveryMapService } from '../src/discovery/services/discovery-map.service';

describe('DiscoveryMapService.getPins', () => {
  let prisma: PrismaService;
  let service: DiscoveryMapService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoFilterService, DiscoveryMapService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DiscoveryMapService);

    const user = await prisma.user.create({ data: { email: 'discovery-map-test@example.com', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const bounds = { minLat: 36.9, maxLat: 37.1, minLng: 126.9, maxLng: 127.1 };

  async function seedPhoto(data: {
    cameraName?: string;
    visibility?: 'EXACT' | 'FUZZY' | 'HIDDEN';
    lat?: number;
    lng?: number;
    fuzzyOffset?: [number, number];
    takenAt?: Date;
  }) {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', cameraName: data.cameraName, visibility: data.visibility ?? 'EXACT', takenAt: data.takenAt },
    });
    if (data.lat != null && data.lng != null) {
      await prisma.$executeRaw`UPDATE "Photo" SET location = ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)::geography WHERE id = ${photo.id}`;
    }
    if (data.fuzzyOffset) {
      await prisma.$executeRaw`UPDATE "Photo" SET "fuzzyOffsetLat" = ${data.fuzzyOffset[0]}, "fuzzyOffsetLng" = ${data.fuzzyOffset[1]} WHERE id = ${photo.id}`;
    }
    return photo;
  }

  it('returns EXACT photos with their real coordinates, within bounds', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    const pin = pins.find((p) => p.id === photo.id);
    expect(pin?.lat).toBeCloseTo(37.0, 5);
    expect(pin?.lng).toBeCloseTo(127.0, 5);
  });

  it('returns FUZZY photos with their stored offset, not the real coordinates', async () => {
    const photo = await seedPhoto({ visibility: 'FUZZY', lat: 37.0, lng: 127.0, fuzzyOffset: [37.002, 127.002] });
    const pins = await service.getPins(bounds, {});
    const pin = pins.find((p) => p.id === photo.id);
    expect(pin?.lat).toBeCloseTo(37.002, 5);
    expect(pin?.lng).toBeCloseTo(127.002, 5);
  });

  it('excludes HIDDEN-visibility photos entirely', async () => {
    const photo = await seedPhoto({ visibility: 'HIDDEN', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('excludes photos outside the viewport bounds', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 0, lng: 0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('excludes FUZZY photos that have a location but no fuzzy offset yet (defensive null-safety)', async () => {
    const photo = await seedPhoto({ visibility: 'FUZZY', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('applies the camera filter', async () => {
    const match = await seedPhoto({ cameraName: 'X100VI', visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const other = await seedPhoto({ cameraName: 'ILCE-7M4', visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const pins = await service.getPins(bounds, { cameraName: 'X100VI' });
    expect(pins.find((p) => p.id === match.id)).toBeDefined();
    expect(pins.find((p) => p.id === other.id)).toBeUndefined();
  });

  it('applies the month filter', async () => {
    const march = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0, takenAt: new Date('2026-03-10T00:00:00Z') });
    const july = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0, takenAt: new Date('2026-07-10T00:00:00Z') });
    const pins = await service.getPins(bounds, { month: 3 });
    expect(pins.find((p) => p.id === march.id)).toBeDefined();
    expect(pins.find((p) => p.id === july.id)).toBeUndefined();
  });

  it('returns an empty array when nothing matches (not an error)', async () => {
    const pins = await service.getPins(bounds, { cameraName: 'NoSuchCamera' });
    expect(pins).toEqual([]);
  });

  it('rejects an invalid bounds (min >= max) with 400', async () => {
    await expect(service.getPins({ minLat: 38, maxLat: 37, minLng: 126.9, maxLng: 127.1 }, {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it('filters by the projected (public) coordinate, not the real one — a tiny bbox around the real point must NOT reveal a FUZZY photo', async () => {
    // 리뷰에서 발견: bbox 필터가 실제 좌표로 포함 여부를 판단하면, 공개 좌표는 숨겨도
    // 좁은 bbox를 반복 조회해서 실제 위치를 정밀하게 역산(bisection)할 수 있다.
    const photo = await seedPhoto({ visibility: 'FUZZY', lat: 37.0, lng: 127.0, fuzzyOffset: [37.004, 127.004] });

    const tinyBoxAroundRealPoint = { minLat: 36.9999, maxLat: 37.0001, minLng: 126.9999, maxLng: 127.0001 };
    const resultsNearReal = await service.getPins(tinyBoxAroundRealPoint, {});
    expect(resultsNearReal.find((p) => p.id === photo.id)).toBeUndefined();

    const tinyBoxAroundOffsetPoint = { minLat: 37.0039, maxLat: 37.0041, minLng: 127.0039, maxLng: 127.0041 };
    const resultsNearOffset = await service.getPins(tinyBoxAroundOffsetPoint, {});
    expect(resultsNearOffset.find((p) => p.id === photo.id)).toBeDefined();
  });

  it('does not return a HIDDEN-status (moderated) photo even if it matches every other condition', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    await prisma.photo.update({ where: { id: photo.id }, data: { status: 'HIDDEN' } });

    const pins = await service.getPins(bounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeUndefined();
  });

  it('does not crash on a near-world-width viewport and still finds a pin inside it', async () => {
    const photo = await seedPhoto({ visibility: 'EXACT', lat: 37.0, lng: 127.0 });
    const worldBounds = { minLat: -80, maxLat: 80, minLng: -179, maxLng: 179 };

    const pins = await service.getPins(worldBounds, {});
    expect(pins.find((p) => p.id === photo.id)).toBeDefined();
  });
});
