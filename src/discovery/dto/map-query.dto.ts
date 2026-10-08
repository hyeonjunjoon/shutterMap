import { IsLatitude, IsLongitude, IsNumberString, IsOptional, IsString } from 'class-validator';

export class MapQueryDto {
  @IsLatitude()
  minLat: string;

  @IsLatitude()
  maxLat: string;

  @IsLongitude()
  minLng: string;

  @IsLongitude()
  maxLng: string;

  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  lensName?: string;

  @IsOptional()
  @IsNumberString()
  minFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  maxFocalLength?: string;

  @IsOptional()
  @IsNumberString()
  minAperture?: string;

  @IsOptional()
  @IsNumberString()
  maxAperture?: string;

  @IsOptional()
  @IsNumberString()
  month?: string;
}
