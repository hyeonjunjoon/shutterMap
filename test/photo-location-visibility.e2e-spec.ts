import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';
import { PhotoVisibilityService } from '../src/photos/services/photo-visibility.service';

describe('PhotoLocationService + PhotoVisibilityService', () => {
  let prisma: PrismaService;
  let locationService: PhotoLocationService;
  let visibilityService: PhotoVisibilityService;
  let ownerId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoLocationService, PhotoVisibilityService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    locationService = moduleRef.get(PhotoLocationService);
    visibilityService = moduleRef.get(PhotoVisibilityService);

    const owner = await prisma.user.create({ data: { email: 'photo-loc-owner@example.com', passwordHash: 'x' } });
    const other = await prisma.user.create({ data: { email: 'photo-loc-other@example.com', passwordHash: 'x' } });
    ownerId = owner.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: { in: [ownerId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherUserId] } } });
    await prisma.$disconnect();
  });

  async function createBarePhoto() {
    return prisma.photo.create({ data: { userId: ownerId, originalKey: 'k' } });
  }

  it('returns null coordinates for a photo with no location yet', async () => {
    const photo = await createBarePhoto();
    const coords = await locationService.getCoordinates(photo.id);
    expect(coords).toBeNull();
  });

  it('sets and reads back a location (longitude/latitude order correct)', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'MANUAL');

    const coords = await locationService.getCoordinates(photo.id);
    expect(coords?.lat).toBeCloseTo(37.5, 5);
    expect(coords?.lng).toBeCloseTo(127.0, 5);

    const updated = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(updated.locationSource).toBe('MANUAL');
  });

  it('rejects setLocation from a non-owner with 403', async () => {
    const photo = await createBarePhoto();
    await expect(
      locationService.setLocation(photo.id, otherUserId, { lat: 1, lng: 1 }, 'MANUAL'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('toPublicLocation returns null for a photo with no location (not yet set)', async () => {
    const photo = await createBarePhoto();
    const result = await visibilityService.toPublicLocation(photo);
    expect(result).toBeNull();
  });

  it('ensureFuzzyOffset does nothing when the photo has no location', async () => {
    const photo = await createBarePhoto();
    await visibilityService.ensureFuzzyOffset(photo.id);
    const reloaded = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(reloaded.fuzzyOffsetLat).toBeNull();
  });

  it('generates a fuzzy offset once and never regenerates it on repeated calls', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    await visibilityService.ensureFuzzyOffset(photo.id);
    const first = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(first.fuzzyOffsetLat).not.toBeNull();

    await visibilityService.ensureFuzzyOffset(photo.id);
    const second = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(second.fuzzyOffsetLat).toBe(first.fuzzyOffsetLat);
    expect(second.fuzzyOffsetLng).toBe(first.fuzzyOffsetLng);
  });

  it('setVisibility to FUZZY generates the offset, and EXACT reveals the real coordinates', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    await visibilityService.setVisibility(photo.id, ownerId, 'FUZZY');
    const fuzzyPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    const fuzzyLocation = await visibilityService.toPublicLocation(fuzzyPhoto);
    expect(fuzzyLocation).not.toBeNull();
    expect(fuzzyLocation).not.toEqual({ lat: 37.5, lng: 127.0 }); // 원본 그대로 노출되면 안 됨

    await visibilityService.setVisibility(photo.id, ownerId, 'EXACT');
    const exactPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    const exactLocation = await visibilityService.toPublicLocation(exactPhoto);
    expect(exactLocation?.lat).toBeCloseTo(37.5, 5);
    expect(exactLocation?.lng).toBeCloseTo(127.0, 5);
  });

  it('toPublicLocation returns null for HIDDEN visibility', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');
    await visibilityService.setVisibility(photo.id, ownerId, 'HIDDEN');

    const hiddenPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(await visibilityService.toPublicLocation(hiddenPhoto)).toBeNull();
  });

  it('rejects setVisibility from a non-owner with 403', async () => {
    const photo = await createBarePhoto();
    await expect(
      visibilityService.setVisibility(photo.id, otherUserId, 'HIDDEN'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
