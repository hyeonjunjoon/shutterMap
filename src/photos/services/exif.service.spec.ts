import { ExifService } from './exif.service';
import { buildExifJpeg, buildPlainJpeg } from '../../../test/fixtures/build-exif-jpeg';

describe('ExifService.parse', () => {
  const service = new ExifService();

  it('extracts camera/lens/exposure fields and converts gps to decimal degrees', async () => {
    const buffer = await buildExifJpeg({
      make: 'SONY',
      model: 'ILCE-7M4',
      lensModel: 'FE 24-70mm F2.8 GM',
      focalLengthMm: 70,
      fNumber: 2.8,
      exposureTimeSeconds: 0.01,
      iso: 400,
      dateTimeOriginal: '2026:01:15 10:30:00',
      gpsLat: 37,
      gpsLng: 127,
    });

    const result = await service.parse(buffer);

    expect(result.cameraRaw).toBe('ILCE-7M4');
    expect(result.lensRaw).toBe('FE 24-70mm F2.8 GM');
    expect(result.focalLength).toBe(70);
    expect(result.aperture).toBe(2.8);
    expect(result.shutterSpeed).toBe('1/100');
    expect(result.iso).toBe(400);
    expect(result.takenAt?.toISOString()).toBe('2026-01-15T01:30:00.000Z');
    expect(result.gps).toEqual({ lat: 37, lng: 127 });
  });

  it('returns all-null fields for an image with no EXIF at all (e.g. a screenshot)', async () => {
    const buffer = await buildPlainJpeg();

    const result = await service.parse(buffer);

    expect(result).toEqual({
      cameraRaw: null,
      lensRaw: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      takenAt: null,
      gps: null,
    });
  });

  it('returns gps: null when the photo has exif but no gps data', async () => {
    const buffer = await buildExifJpeg({ model: 'X100VI' });

    const result = await service.parse(buffer);

    expect(result.cameraRaw).toBe('X100VI');
    expect(result.gps).toBeNull();
  });
});
