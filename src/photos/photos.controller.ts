import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UnsupportedMediaTypeException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhotoUploadService } from './services/photo-upload.service';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class PhotosController {
  constructor(private readonly photoUploadService: PhotoUploadService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          callback(new UnsupportedMediaTypeException(`지원하지 않는 파일 형식입니다: ${file.mimetype}`), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[] | undefined, @Req() req: AuthedRequest) {
    if (!files || files.length === 0) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }
    return this.photoUploadService.uploadPhotos(req.user.id, files);
  }
}
