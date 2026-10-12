import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { R2StorageService } from './services/r2-storage.service';

export interface MyPhotoItem {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  thumbnailUrl: string;
  status: string;
  visibility: string;
  likeCount: number;
  createdAt: Date;
}

export interface MyPhotoPage {
  items: MyPhotoItem[];
  nextCursor: string | null;
}

const DEFAULT_MINE_LIMIT = 20;
// 로그인한 사용자 본인 조회라도, 한 번에 긁어가는 양은 갤러리와 동일하게 제한한다.
const MAX_MINE_LIMIT = 50;

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

  // 마이페이지용 — 본인 사진만, DELETED는 제외(ACTIVE+HIDDEN은 포함해서 운영자가
  // 비공개 처리한 것도 본인은 볼 수 있게 한다). Discovery의 공개 조회(status=ACTIVE
  // 하드코딩)와는 별도 경로 — 인증 분기를 공개 필터에 섞지 않는다.
  async listMine(userId: string, cursor: string | undefined, requestedLimit: number = DEFAULT_MINE_LIMIT): Promise<MyPhotoPage> {
    const limit = Math.min(requestedLimit, MAX_MINE_LIMIT);

    const photos = await this.prisma.photo.findMany({
      where: { userId, status: { in: ['ACTIVE', 'HIDDEN'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        cameraName: true,
        lensName: true,
        thumbnailKey: true,
        status: true,
        visibility: true,
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
        status: photo.status,
        visibility: photo.visibility,
        likeCount: photo._count.likes,
        createdAt: photo.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  // 소프트 삭제 — status만 DELETED로 바꾼다. 원본/서빙 이미지는 R2에 그대로
  // 남고(재업로드로 대체한다는 설계), Like/Report 등 참조 행도 그대로 둔다
  // (실제 row를 지우면 FK 제약 위반/신고 이력 소실 위험이 있다).
  async deletePhoto(photoId: string, userId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (photo.userId !== userId) throw new ForbiddenException('본인 사진만 삭제할 수 있습니다.');

    await this.prisma.photo.update({ where: { id: photoId }, data: { status: 'DELETED' } });
  }
}
