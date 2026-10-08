import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface SharedPhotoFilters {
  cameraName?: string;
  lensName?: string;
  minFocalLength?: number;
  maxFocalLength?: number;
  minAperture?: number;
  maxAperture?: number;
}

@Injectable()
export class PhotoFilterService {
  toPrismaWhere(filters: SharedPhotoFilters): Prisma.PhotoWhereInput {
    const where: Prisma.PhotoWhereInput = { status: 'ACTIVE' };

    if (filters.cameraName) where.cameraName = filters.cameraName;
    if (filters.lensName) where.lensName = filters.lensName;

    if (filters.minFocalLength != null || filters.maxFocalLength != null) {
      where.focalLength = {
        ...(filters.minFocalLength != null ? { gte: filters.minFocalLength } : {}),
        ...(filters.maxFocalLength != null ? { lte: filters.maxFocalLength } : {}),
      };
    }

    if (filters.minAperture != null || filters.maxAperture != null) {
      where.aperture = {
        ...(filters.minAperture != null ? { gte: filters.minAperture } : {}),
        ...(filters.maxAperture != null ? { lte: filters.maxAperture } : {}),
      };
    }

    return where;
  }

  toSqlConditions(filters: SharedPhotoFilters): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`"status" = 'ACTIVE'`];

    if (filters.cameraName) conditions.push(Prisma.sql`"cameraName" = ${filters.cameraName}`);
    if (filters.lensName) conditions.push(Prisma.sql`"lensName" = ${filters.lensName}`);
    if (filters.minFocalLength != null) conditions.push(Prisma.sql`"focalLength" >= ${filters.minFocalLength}`);
    if (filters.maxFocalLength != null) conditions.push(Prisma.sql`"focalLength" <= ${filters.maxFocalLength}`);
    if (filters.minAperture != null) conditions.push(Prisma.sql`"aperture" >= ${filters.minAperture}`);
    if (filters.maxAperture != null) conditions.push(Prisma.sql`"aperture" <= ${filters.maxAperture}`);

    return conditions;
  }
}
