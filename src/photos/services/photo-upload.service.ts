import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExifService, ParsedExif } from './exif.service';
import { ImageProcessingService, ProcessedImage } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { PhotoLocationService } from './photo-location.service';
import { PhotoVisibilityService } from './photo-visibility.service';

export interface UploadedPhotoResult {
  id: string;
  cameraRaw: string | null;
  lensRaw: string | null;
  hasLocation: boolean;
}

interface PreparedFile {
  file: Express.Multer.File;
  exif: ParsedExif;
  processed: ProcessedImage;
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
    // 1단계: 전부 디코딩/파싱부터 끝낸다. multer의 fileFilter는 클라이언트가 보낸
    // mimetype만 보고, 실제 바이트가 손상됐는지는 sharp/heic-convert가 디코딩할
    // 때야 드러난다 — 배치 중간에서 터지면 앞서 올린 파일만 R2/DB에 남는 부분 성공이
    // 생기므로, 업로드·저장은 전부 성공적으로 디코딩된 뒤에만 시작한다.
    const prepared: PreparedFile[] = [];
    for (const file of files) {
      const exif = await this.exifService.parse(file.buffer);
      let processed: ProcessedImage;
      try {
        processed = await this.imageProcessingService.process(file.buffer, file.mimetype);
      } catch {
        throw new BadRequestException(`이미지를 처리할 수 없습니다: ${file.originalname}`);
      }
      prepared.push({ file, exif, processed });
    }

    // 2단계: 검증이 끝난 파일만 업로드/저장한다.
    const results: UploadedPhotoResult[] = [];
    for (const { file, exif, processed } of prepared) {
      const id = randomUUID();

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
