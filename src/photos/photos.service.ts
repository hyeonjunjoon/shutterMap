import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { R2StorageService } from './services/r2-storage.service';

export interface PhotoDetailView {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: Date | null;
  note: string | null;
  location: { lat: number; lng: number } | null;
  locationLabel: 'exact' | 'approximate' | 'hidden';
  servingUrl: string;
  thumbnailUrl: string;
  userId: string;
  likeCount: number;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoVisibilityService: PhotoVisibilityService,
    private readonly r2: R2StorageService,
  ) {}

  async getDetail(photoId: string): Promise<PhotoDetailView> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== 'ACTIVE') {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    const location = await this.photoVisibilityService.toPublicLocation(photo);
    const locationLabel: 'exact' | 'approximate' | 'hidden' =
      photo.visibility === 'HIDDEN' ? 'hidden' : photo.visibility === 'EXACT' ? 'exact' : 'approximate';
    const likeCount = await this.prisma.like.count({ where: { photoId } });

    return {
      id: photo.id,
      cameraName: photo.cameraName,
      lensName: photo.lensName,
      focalLength: photo.focalLength,
      aperture: photo.aperture,
      shutterSpeed: photo.shutterSpeed,
      iso: photo.iso,
      takenAt: photo.takenAt,
      note: photo.note,
      location,
      locationLabel,
      servingUrl: photo.servingKey ? this.r2.buildPublicUrl(photo.servingKey) : '',
      thumbnailUrl: photo.thumbnailKey ? this.r2.buildPublicUrl(photo.thumbnailKey) : '',
      userId: photo.userId,
      likeCount,
    };
  }
}
