import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

export enum GallerySort {
  LATEST = 'latest',
  LIKES = 'likes',
}

export class GalleryQueryDto {
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
  @IsEnum(GallerySort)
  sort?: GallerySort;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
