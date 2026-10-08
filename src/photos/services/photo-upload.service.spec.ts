import { Test } from '@nestjs/testing';
import { PhotoUploadService } from './photo-upload.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExifService } from './exif.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { PhotoLocationService } from './photo-location.service';
import { PhotoVisibilityService } from './photo-visibility.service';

function fakeFile(mimetype: string): Express.Multer.File {
  return {
    buffer: Buffer.from('fake'),
    mimetype,
    originalname: 'a.jpg',
  } as Express.Multer.File;
}

describe('PhotoUploadService.uploadPhotos', () => {
  let service: PhotoUploadService;
  let prisma: {
    photo: { create: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let exifService: { parse: jest.Mock };
  let imageProcessingService: { process: jest.Mock };
  let r2: { uploadBuffer: jest.Mock; uploadOriginal: jest.Mock };
  let photoLocationService: { setLocation: jest.Mock };
  let photoVisibilityService: { ensureFuzzyOffset: jest.Mock };

  beforeEach(async () => {
    prisma = {
      photo: { create: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ ownedCameraName: null }), update: jest.fn() },
    };
    exifService = {
      parse: jest.fn().mockResolvedValue({
        cameraRaw: 'ILCE-7M4',
        lensRaw: 'FE 24-70mm F2.8 GM',
        focalLength: 70,
        aperture: 2.8,
        shutterSpeed: '1/100',
        iso: 400,
        takenAt: new Date('2026-01-15T01:30:00.000Z'),
        gps: { lat: 37.5, lng: 127.0 },
      }),
    };
    imageProcessingService = {
      process: jest.fn().mockResolvedValue({ serving: Buffer.from('s'), thumbnail: Buffer.from('t') }),
    };
    r2 = {
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
      uploadOriginal: jest.fn().mockResolvedValue(undefined),
    };
    photoLocationService = { setLocation: jest.fn().mockResolvedValue(undefined) };
    photoVisibilityService = { ensureFuzzyOffset: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PhotoUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExifService, useValue: exifService },
        { provide: ImageProcessingService, useValue: imageProcessingService },
        { provide: R2StorageService, useValue: r2 },
        { provide: PhotoLocationService, useValue: photoLocationService },
        { provide: PhotoVisibilityService, useValue: photoVisibilityService },
      ],
    }).compile();
    service = moduleRef.get(PhotoUploadService);
  });

  it('uploads serving/thumbnail to the public bucket and the original to the private bucket', async () => {
    const results = await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    // serving + thumbnail only — the original must NEVER go through the public-bucket upload path
    expect(r2.uploadBuffer).toHaveBeenCalledTimes(2);
    expect(r2.uploadOriginal).toHaveBeenCalledTimes(1);
    const [originalKey] = r2.uploadOriginal.mock.calls[0];
    expect(originalKey).toMatch(/\/original\.jpg$/);

    const createArgs = prisma.photo.create.mock.calls[0][0].data;
    expect(createArgs.userId).toBe('user-1');
    expect(createArgs.cameraRaw).toBe('ILCE-7M4');
    expect(createArgs.lensRaw).toBe('FE 24-70mm F2.8 GM');
    expect(results).toEqual([
      { id: expect.any(String), cameraRaw: 'ILCE-7M4', lensRaw: 'FE 24-70mm F2.8 GM', hasLocation: true },
    ]);
  });

  it('sets location and ensures a fuzzy offset when the exif has gps', async () => {
    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(photoLocationService.setLocation).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      { lat: 37.5, lng: 127.0 },
      'EXIF',
    );
    expect(photoVisibilityService.ensureFuzzyOffset).toHaveBeenCalledTimes(1);
  });

  it('skips setLocation/ensureFuzzyOffset when the exif has no gps (screenshot case)', async () => {
    exifService.parse.mockResolvedValue({
      cameraRaw: null,
      lensRaw: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      takenAt: null,
      gps: null,
    });

    const results = await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(photoLocationService.setLocation).not.toHaveBeenCalled();
    expect(photoVisibilityService.ensureFuzzyOffset).not.toHaveBeenCalled();
    expect(results[0].hasLocation).toBe(false);
  });

  it('sets the user ownedCameraName on first upload if not already set', async () => {
    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { ownedCameraRaw: 'ILCE-7M4', ownedCameraName: 'ILCE-7M4' },
    });
  });

  it('does not overwrite ownedCameraName when the user already has one', async () => {
    prisma.user.findUnique.mockResolvedValue({ ownedCameraName: 'Sony A7 IV' });

    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
