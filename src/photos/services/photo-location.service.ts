import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Coordinates {
  lat: number;
  lng: number;
}

// PostGIS 왕복(geography → double precision) 부동소수 오차보다 넉넉한 허용치.
// 같은 좌표를 다시 저장한 것뿐인데 오차 때문에 "변경"으로 잘못 판단하면 안 된다.
const SAME_COORDINATE_EPSILON = 1e-6;

function isSameCoordinate(a: Coordinates, b: Coordinates): boolean {
  return Math.abs(a.lat - b.lat) < SAME_COORDINATE_EPSILON && Math.abs(a.lng - b.lng) < SAME_COORDINATE_EPSILON;
}

@Injectable()
export class PhotoLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoordinates(photoId: string): Promise<Coordinates | null> {
    const rows = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM "Photo" WHERE id = ${photoId} AND location IS NOT NULL
    `;
    return rows[0] ?? null;
  }

  async setLocation(
    photoId: string,
    userId: string,
    coords: Coordinates,
    source: LocationSource,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (photo.userId !== userId) throw new ForbiddenException('본인 사진만 수정할 수 있습니다.');

    const previous = await this.getCoordinates(photoId);
    const originChanged = !previous || !isSameCoordinate(previous, coords);

    // 원점이 실제로 바뀌면 기존 fuzzy 오프셋은 옛 좌표 기준이라 그대로 두면
    // "사용자가 떠나려 한 바로 그 장소"를 계속 가리키게 된다 — 함께 지운다.
    // 같은 좌표를 다시 저장한 경우엔 건드리지 않는다(재생성 자체가 평균-역산 위험).
    await this.prisma.$executeRaw`
      UPDATE "Photo"
      SET location = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography,
          "locationSource" = ${source}::"LocationSource",
          "fuzzyOffsetLat" = CASE WHEN ${originChanged} THEN NULL ELSE "fuzzyOffsetLat" END,
          "fuzzyOffsetLng" = CASE WHEN ${originChanged} THEN NULL ELSE "fuzzyOffsetLng" END
      WHERE id = ${photoId}
    `;
  }
}
