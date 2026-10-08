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
});
