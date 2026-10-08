import { IsEnum, IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

// 양의 정수 문자열만 허용 — 0/음수/소수는 findMany({ take })에 그대로 넘기면
// 깨지거나(0, 음수) 조용히 반올림되는(소수) 값이라 애초에 거부한다.
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

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
  @Matches(POSITIVE_INTEGER_PATTERN)
  limit?: string;
}
