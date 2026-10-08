import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';
import { PhotoVisibilityService } from '../src/photos/services/photo-visibility.service';

const EMAIL = 'photos-detail-user@example.com';

describe('GET /photos/:id', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photoLocationService: PhotoLocationService;
  let photoVisibilityService: PhotoVisibilityService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    photoLocationService = moduleRef.get(PhotoLocationService);
    photoVisibilityService = moduleRef.get(PhotoVisibilityService);

    const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns 404 for a non-existent photo', async () => {
    await request(app.getHttpServer()).get('/photos/does-not-exist').expect(404);
  });

  it('returns exact coordinates for EXACT visibility', async () => {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', servingKey: 's', thumbnailKey: 't', cameraName: 'ILCE-7M4', visibility: 'EXACT' },
    });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.cameraName).toBe('ILCE-7M4');
    expect(res.body.location.lat).toBeCloseTo(37.5, 5);
    expect(res.body.locationLabel).toBe('exact');
  });

  it('returns fuzzy (offset) coordinates for FUZZY visibility, not the real ones', async () => {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', visibility: 'FUZZY' },
    });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');
    await photoVisibilityService.ensureFuzzyOffset(photo.id);

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).not.toEqual({ lat: 37.5, lng: 127.0 });
    expect(res.body.locationLabel).toBe('approximate');
  });

  it('returns no location for HIDDEN visibility', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'HIDDEN' } });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).toBeNull();
    expect(res.body.locationLabel).toBe('hidden');
  });

  it('returns null location (not an error) for a photo with no location set yet', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k' } });

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).toBeNull();
  });

  it('returns 404 for a photo moderated to HIDDEN status (not the same as visibility HIDDEN)', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', status: 'HIDDEN' } });

    await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(404);
  });
});
