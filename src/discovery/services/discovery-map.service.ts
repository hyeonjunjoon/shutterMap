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
// 500m 반경 fuzzy 오프셋을 덮을 만큼 넉넉한 여유(약 1.1km) — 실제 좌표 기준 GIST
// prefilter가 "공개 좌표는 bounds 안인데 실제 좌표는 살짝 밖"인 FUZZY 사진을 먼저
// 걸러내지 않게 한다. 최종 포함 여부는 이 prefilter가 아니라 아래 공개 좌표
// BETWEEN 비교로만 결정된다 — 실제 좌표로 포함 여부가 갈리면 좁은 bbox를 반복
// 조회해서 fuzzy 사진의 실제 위치를 역산(bisection)할 수 있기 때문.
const FUZZY_MARGIN_DEGREES = 0.01;
// ST_MakeEnvelope(...)::geography는 폭이 180도에 가까우면 "antipodal edge" 에러를
// 낸다 — 그 정도로 넓은(거의 지구 전체) 뷰포트는 geography 인덱스 prefilter를 쓰지
// 않고 아래 BETWEEN 비교만으로 거른다. 결과는 항상 정확하고, 이 경우만 인덱스
// 스캔 대신 더 넓게 훑는다.
const WIDE_SPAN_THRESHOLD_DEGREES = 90;

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
    conditions.push(Prisma.sql`visibility <> 'HIDDEN'`);
    conditions.push(Prisma.sql`location IS NOT NULL`);

    const isWideSpan =
      bounds.maxLat - bounds.minLat >= WIDE_SPAN_THRESHOLD_DEGREES ||
      bounds.maxLng - bounds.minLng >= WIDE_SPAN_THRESHOLD_DEGREES;
    if (!isWideSpan) {
      conditions.push(Prisma.sql`
        location && ST_MakeEnvelope(
          ${bounds.minLng - FUZZY_MARGIN_DEGREES}, ${bounds.minLat - FUZZY_MARGIN_DEGREES},
          ${bounds.maxLng + FUZZY_MARGIN_DEGREES}, ${bounds.maxLat + FUZZY_MARGIN_DEGREES},
          4326
        )::geography
      `);
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<{ id: string; lat: number; lng: number }[]>`
      SELECT id, lat, lng FROM (
        SELECT id, "createdAt",
          CASE WHEN visibility = 'EXACT' THEN ST_Y(location::geometry) ELSE "fuzzyOffsetLat" END AS lat,
          CASE WHEN visibility = 'EXACT' THEN ST_X(location::geometry) ELSE "fuzzyOffsetLng" END AS lng
        FROM "Photo"
        WHERE ${whereSql}
      ) AS projected
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND lat BETWEEN ${bounds.minLat} AND ${bounds.maxLat}
        AND lng BETWEEN ${bounds.minLng} AND ${bounds.maxLng}
      ORDER BY "createdAt" DESC
      LIMIT ${MAX_MAP_RESULTS}
    `;

    return rows.map((row) => ({ id: row.id, lat: row.lat, lng: row.lng }));
  }
}
