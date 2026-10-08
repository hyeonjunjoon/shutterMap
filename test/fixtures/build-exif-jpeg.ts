import piexif from 'piexifjs';
import sharp from 'sharp';

export interface ExifFixtureOptions {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLengthMm?: number;
  fNumber?: number;
  exposureTimeSeconds?: number;
  iso?: number;
  dateTimeOriginal?: string; // 'YYYY:MM:DD HH:mm:ss'
  gpsLat?: number; // 정수 도 단위로만 쓸 것 (DMS 반올림 오차 회피)
  gpsLng?: number;
}

function toDmsRational(decimalDegrees: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(decimalDegrees);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 100), 100]];
}

export async function buildExifJpeg(options: ExifFixtureOptions): Promise<Buffer> {
  const baseJpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();

  const zeroth: Record<number, unknown> = {};
  if (options.model) zeroth[piexif.ImageIFD.Model] = options.model;
  if (options.make) zeroth[piexif.ImageIFD.Make] = options.make;

  const exifIfd: Record<number, unknown> = {};
  if (options.lensModel) exifIfd[piexif.ExifIFD.LensModel] = options.lensModel;
  if (options.focalLengthMm != null) exifIfd[piexif.ExifIFD.FocalLength] = [options.focalLengthMm * 10, 10];
  if (options.fNumber != null) exifIfd[piexif.ExifIFD.FNumber] = [options.fNumber * 10, 10];
  if (options.exposureTimeSeconds != null) {
    exifIfd[piexif.ExifIFD.ExposureTime] =
      options.exposureTimeSeconds >= 1
        ? [options.exposureTimeSeconds, 1]
        : [1, Math.round(1 / options.exposureTimeSeconds)];
  }
  if (options.iso != null) exifIfd[piexif.ExifIFD.ISOSpeedRatings] = options.iso;
  if (options.dateTimeOriginal) exifIfd[piexif.ExifIFD.DateTimeOriginal] = options.dateTimeOriginal;

  const exifObj: Record<string, unknown> = { '0th': zeroth, Exif: exifIfd };

  if (options.gpsLat != null && options.gpsLng != null) {
    const gpsIfd: Record<number, unknown> = {};
    gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = options.gpsLat >= 0 ? 'N' : 'S';
    gpsIfd[piexif.GPSIFD.GPSLatitude] = toDmsRational(options.gpsLat);
    gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = options.gpsLng >= 0 ? 'E' : 'W';
    gpsIfd[piexif.GPSIFD.GPSLongitude] = toDmsRational(options.gpsLng);
    exifObj.GPS = gpsIfd;
  }

  const exifBytes = piexif.dump(exifObj);
  const inserted = piexif.insert(exifBytes, baseJpeg.toString('binary'));
  return Buffer.from(inserted, 'binary');
}

export async function buildPlainJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}
