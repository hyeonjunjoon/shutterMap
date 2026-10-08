import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExifService } from './services/exif.service';
import { ImageProcessingService } from './services/image-processing.service';
import { R2StorageService, S3_CLIENT, createR2Client } from './services/r2-storage.service';
import { PhotoLocationService } from './services/photo-location.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { PhotoUploadService } from './services/photo-upload.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ExifService,
    ImageProcessingService,
    R2StorageService,
    { provide: S3_CLIENT, useFactory: createR2Client },
    PhotoLocationService,
    PhotoVisibilityService,
    PhotoUploadService,
  ],
  exports: [PhotoLocationService, PhotoVisibilityService, PhotoUploadService, R2StorageService],
})
export class PhotosModule {}
