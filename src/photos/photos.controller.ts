import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { PhotoLocationService } from './services/photo-location.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { PhotosService } from './photos.service';
import { SetLocationDto } from './dto/set-location.dto';
import { SetVisibilityDto } from './dto/set-visibility.dto';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class PhotosController {
  constructor(
    private readonly photoUploadService: PhotoUploadService,
    private readonly photoLocationService: PhotoLocationService,
    private readonly photoVisibilityService: PhotoVisibilityService,
    private readonly photosService: PhotosService,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @Patch(':id/location')
  async setLocation(@Param('id') id: string, @Body() dto: SetLocationDto, @Req() req: AuthedRequest) {
    await this.photoLocationService.setLocation(id, req.user.id, { lat: dto.lat, lng: dto.lng }, 'MANUAL');
    // 업로드 경로(PhotoUploadService)와 동일한 규칙: 위치가 막 생겼는데 공개범위가
    // 이미(혹은 기본값으로) FUZZY면 여기서 오프셋을 채워야 지도에 핀이 뜬다.
    await this.photoVisibilityService.ensureFuzzyOffset(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/visibility')
  setVisibility(@Param('id') id: string, @Body() dto: SetVisibilityDto, @Req() req: AuthedRequest) {
    return this.photoVisibilityService.setVisibility(id, req.user.id, dto.visibility);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.photosService.getDetail(id);
  }
}
