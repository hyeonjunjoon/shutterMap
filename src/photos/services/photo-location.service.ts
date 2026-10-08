import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Coordinates {
  lat: number;
  lng: number;
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

    await this.prisma.$executeRaw`
      UPDATE "Photo"
      SET location = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography,
          "locationSource" = ${source}::"LocationSource"
      WHERE id = ${photoId}
    `;
  }
}
