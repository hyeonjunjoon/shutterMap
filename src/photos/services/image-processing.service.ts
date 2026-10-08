import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

export interface ProcessedImage {
  serving: Buffer;
  thumbnail: Buffer;
}

const HEIC_MIMETYPES = ['image/heic', 'image/heif'];
const THUMBNAIL_MAX_SIZE = 480;

@Injectable()
export class ImageProcessingService {
  async process(buffer: Buffer, mimetype: string): Promise<ProcessedImage> {
    const decodable = HEIC_MIMETYPES.includes(mimetype)
      ? Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 1 }))
      : buffer;

    const serving = await sharp(decodable).rotate().jpeg({ quality: 90 }).toBuffer();
    const thumbnail = await sharp(decodable)
      .rotate()
      .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return { serving, thumbnail };
  }
}
