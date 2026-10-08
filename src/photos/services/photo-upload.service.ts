import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExifService } from './exif.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { PhotoLocationService } from './photo-location.service';
import { PhotoVisibilityService } from './photo-visibility.service';

export interface UploadedPhotoResult {
  id: string;
  cameraRaw: string | null;
  lensRaw: string | null;
  hasLocation: boolean;
}

@Injectable()
export class PhotoUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exifService: ExifService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly r2: R2StorageService,
    private readonly photoLocationService: PhotoLocationService,
    private readonly photoVisibilityService: PhotoVisibilityService,
  ) {}

  async uploadPhotos(userId: string, files: Express.Multer.File[]): Promise<UploadedPhotoResult[]> {
    const results: UploadedPhotoResult[] = [];

    for (const file of files) {
      const id = randomUUID();
      const exif = await this.exifService.parse(file.buffer);
      const processed = await this.imageProcessingService.process(file.buffer, file.mimetype);

      const originalExt = file.mimetype === 'image/png' ? 'png' : 'jpg';
      const originalKey = `photos/${userId}/${id}/original.${originalExt}`;
      const servingKey = `photos/${userId}/${id}/serving.jpg`;
      const thumbnailKey = `photos/${userId}/${id}/thumbnail.jpg`;

      // 원본은 GPS가 그대로 남아 있어 비공개 버킷으로만 업로드한다 — 공개 버킷으로
      // 보내면 공개 URL로 원본을 추측해 fuzzy/hidden을 무력화할 수 있다.
      await this.r2.uploadOriginal(originalKey, file.buffer, file.mimetype);
      await this.r2.uploadBuffer(servingKey, processed.serving, 'image/jpeg');
      await this.r2.uploadBuffer(thumbnailKey, processed.thumbnail, 'image/jpeg');

      await this.prisma.photo.create({
        data: {
          id,
          userId,
          originalKey,
          servingKey,
          thumbnailKey,
          cameraRaw: exif.cameraRaw,
          cameraName: exif.cameraRaw,
          lensRaw: exif.lensRaw,
          lensName: exif.lensRaw,
          focalLength: exif.focalLength,
          aperture: exif.aperture,
          shutterSpeed: exif.shutterSpeed,
          iso: exif.iso,
          takenAt: exif.takenAt,
        },
      });

      if (exif.gps) {
        await this.photoLocationService.setLocation(id, userId, exif.gps, 'EXIF');
        await this.photoVisibilityService.ensureFuzzyOffset(id);
      }

      await this.maybeSetOwnedCamera(userId, exif.cameraRaw);

      results.push({ id, cameraRaw: exif.cameraRaw, lensRaw: exif.lensRaw, hasLocation: exif.gps != null });
    }

    return results;
  }

  private async maybeSetOwnedCamera(userId: string, cameraRaw: string | null): Promise<void> {
    if (!cameraRaw) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.ownedCameraName) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { ownedCameraRaw: cameraRaw, ownedCameraName: cameraRaw },
    });
  }
}
