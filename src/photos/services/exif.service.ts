import { Injectable } from '@nestjs/common';
import exifr from 'exifr';

export interface ParsedExif {
  cameraRaw: string | null;
  lensRaw: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: Date | null;
  gps: { lat: number; lng: number } | null;
}

function formatShutterSpeed(exposureTimeSeconds: number | undefined): string | null {
  if (exposureTimeSeconds == null) return null;
  if (exposureTimeSeconds >= 1) return `${exposureTimeSeconds}s`;
  return `1/${Math.round(1 / exposureTimeSeconds)}`;
}

interface ExifrTags {
  Model?: string;
  LensModel?: string;
  FocalLength?: number;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  DateTimeOriginal?: Date;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class ExifService {
  async parse(buffer: Buffer): Promise<ParsedExif> {
    const tags: ExifrTags | undefined = await exifr
      .parse(buffer, { gps: true, tiff: true, exif: true })
      .catch(() => undefined);

    if (!tags) {
      return {
        cameraRaw: null,
        lensRaw: null,
        focalLength: null,
        aperture: null,
        shutterSpeed: null,
        iso: null,
        takenAt: null,
        gps: null,
      };
    }

    const gps =
      typeof tags.latitude === 'number' && typeof tags.longitude === 'number'
        ? { lat: tags.latitude, lng: tags.longitude }
        : null;

    return {
      cameraRaw: tags.Model ?? null,
      lensRaw: tags.LensModel ?? null,
      focalLength: tags.FocalLength ?? null,
      aperture: tags.FNumber ?? null,
      shutterSpeed: formatShutterSpeed(tags.ExposureTime),
      iso: tags.ISO ?? null,
      takenAt: tags.DateTimeOriginal ?? null,
      gps,
    };
  }
}
