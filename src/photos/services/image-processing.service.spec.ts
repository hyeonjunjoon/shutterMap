import sharp from 'sharp';
import exifr from 'exifr';
import { ImageProcessingService } from './image-processing.service';
import { buildExifJpeg } from '../../../test/fixtures/build-exif-jpeg';

jest.mock('heic-convert', () => jest.fn());
import heicConvert from 'heic-convert';

describe('ImageProcessingService.process', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
    jest.clearAllMocks();
  });

  it('strips exif/gps and resizes the thumbnail for a jpeg', async () => {
    const input = await buildExifJpeg({ model: 'ILCE-7M4', gpsLat: 37, gpsLng: 127 });

    const result = await service.process(input, 'image/jpeg');

    const servingTags = await exifr.parse(result.serving, { gps: true }).catch(() => undefined);
    expect(servingTags).toBeUndefined();

    const thumbMeta = await sharp(result.thumbnail).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(480);
    expect(thumbMeta.height).toBeLessThanOrEqual(480);
  });

  it('routes heic/heif files through heic-convert before processing', async () => {
    const plainJpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    (heicConvert as unknown as jest.Mock).mockResolvedValue(plainJpeg);

    const result = await service.process(Buffer.from('fake-heic-bytes'), 'image/heic');

    expect(heicConvert).toHaveBeenCalledWith({
      buffer: Buffer.from('fake-heic-bytes'),
      format: 'JPEG',
      quality: 1,
    });
    const meta = await sharp(result.serving).metadata();
    expect(meta.format).toBe('jpeg');
  });
});
