import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Photo, PhotoVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoLocationService } from './photo-location.service';

const FUZZY_RADIUS_METERS = 500;
const METERS_PER_LAT_DEGREE = 111_320;

export interface PublicLocation {
  lat: number;
  lng: number;
}

function randomFuzzyOffset(lat: number, lng: number): PublicLocation {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.sqrt(Math.random()) * FUZZY_RADIUS_METERS; // 면적 기준 균등분포
  const deltaLat = (distance * Math.cos(angle)) / METERS_PER_LAT_DEGREE;
  const metersPerLngDegree = METERS_PER_LAT_DEGREE * Math.cos((lat * Math.PI) / 180);
  const deltaLng = (distance * Math.sin(angle)) / metersPerLngDegree;
  return { lat: lat + deltaLat, lng: lng + deltaLng };
}

@Injectable()
export class PhotoVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoLocationService: PhotoLocationService,
  ) {}

  async setVisibility(photoId: string, userId: string, visibility: PhotoVisibility): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (photo.userId !== userId) throw new ForbiddenException('본인 사진만 수정할 수 있습니다.');

    if (visibility === 'FUZZY') {
      await this.ensureFuzzyOffset(photoId);
    }
    await this.prisma.photo.update({ where: { id: photoId }, data: { visibility } });
  }

  // location이 있고 오프셋이 아직 없을 때만 1회 생성한다. 원자적 UPDATE ... WHERE
  // "fuzzyOffsetLat" IS NULL 덕분에, 동시에 두 번 호출돼도 한쪽만 실제로 값을 쓰고
  // 나머지는 영향받은 행이 0개라 조용히 넘어간다 — 재생성 없음.
  async ensureFuzzyOffset(photoId: string): Promise<void> {
    const origin = await this.photoLocationService.getCoordinates(photoId);
    if (!origin) return;

    const offset = randomFuzzyOffset(origin.lat, origin.lng);
    await this.prisma.$executeRaw`
      UPDATE "Photo"
      SET "fuzzyOffsetLat" = ${offset.lat}, "fuzzyOffsetLng" = ${offset.lng}
      WHERE id = ${photoId} AND "fuzzyOffsetLat" IS NULL
    `;
  }

  async toPublicLocation(photo: Photo): Promise<PublicLocation | null> {
    if (photo.visibility === 'HIDDEN') return null;
    if (photo.visibility === 'EXACT') {
      return this.photoLocationService.getCoordinates(photo.id);
    }
    if (photo.fuzzyOffsetLat == null || photo.fuzzyOffsetLng == null) return null;
    return { lat: photo.fuzzyOffsetLat, lng: photo.fuzzyOffsetLng };
  }
}
