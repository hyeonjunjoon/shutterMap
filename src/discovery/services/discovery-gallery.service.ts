import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from './photo-filter.service';
import { R2StorageService } from '../../photos/services/r2-storage.service';

export type GallerySortOption = 'latest' | 'likes';

export interface GalleryItem {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  thumbnailUrl: string;
  likeCount: number;
  createdAt: Date;
}

export interface GalleryPage {
  items: GalleryItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
// 인증 없이 호출 가능한 전역 조회라서, 클라이언트가 큰 수를 요청해도 한 번에
// 긁어가는 양을 제한한다.
const MAX_LIMIT = 50;

@Injectable()
export class DiscoveryGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoFilterService: PhotoFilterService,
    private readonly r2: R2StorageService,
  ) {}

  async getGallery(
    filters: SharedPhotoFilters,
    sort: GallerySortOption,
    cursor: string | undefined,
    requestedLimit: number = DEFAULT_LIMIT,
  ): Promise<GalleryPage> {
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const where = this.photoFilterService.toPrismaWhere(filters);
    const orderBy =
      sort === 'likes'
        ? [{ likes: { _count: 'desc' as const } }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

    const photos = await this.prisma.photo.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        cameraName: true,
        lensName: true,
        thumbnailKey: true,
        createdAt: true,
        _count: { select: { likes: true } },
      },
    });

    const hasMore = photos.length > limit;
    const page = hasMore ? photos.slice(0, limit) : photos;

    return {
      items: page.map((photo) => ({
        id: photo.id,
        cameraName: photo.cameraName,
        lensName: photo.lensName,
        thumbnailUrl: photo.thumbnailKey ? this.r2.buildPublicUrl(photo.thumbnailKey) : '',
        likeCount: photo._count.likes,
        createdAt: photo.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
