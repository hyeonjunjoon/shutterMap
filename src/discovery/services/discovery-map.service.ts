import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoFilterService, SharedPhotoFilters } from './photo-filter.service';

export interface MapFilters extends SharedPhotoFilters {
  month?: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface PhotoPin {
  id: string;
  lat: number;
  lng: number;
}

const MAX_MAP_RESULTS = 2000;

@Injectable()
export class DiscoveryMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoFilterService: PhotoFilterService,
  ) {}

  async getPins(bounds: MapBounds, filters: MapFilters): Promise<PhotoPin[]> {
    if (bounds.minLat >= bounds.maxLat || bounds.minLng >= bounds.maxLng) {
      throw new BadRequestException('유효하지 않은 지도 범위입니다.');
    }

    const conditions = this.photoFilterService.toSqlConditions(filters);
    if (filters.month != null) {
      conditions.push(Prisma.sql`EXTRACT(MONTH FROM "takenAt") = ${filters.month}`);
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<{ id: string; lat: number | null; lng: number | null }[]>`
      SELECT id,
        CASE WHEN visibility = 'EXACT' THEN ST_Y(location::geometry) ELSE "fuzzyOffsetLat" END AS lat,
        CASE WHEN visibility = 'EXACT' THEN ST_X(location::geometry) ELSE "fuzzyOffsetLng" END AS lng
      FROM "Photo"
      WHERE ${whereSql}
        AND visibility <> 'HIDDEN'
        AND location IS NOT NULL
        AND location && ST_MakeEnvelope(${bounds.minLng}, ${bounds.minLat}, ${bounds.maxLng}, ${bounds.maxLat}, 4326)::geography
      LIMIT ${MAX_MAP_RESULTS}
    `;

    return rows
      .filter((row) => row.lat != null && row.lng != null)
      .map((row) => ({ id: row.id, lat: row.lat as number, lng: row.lng as number }));
  }
}
