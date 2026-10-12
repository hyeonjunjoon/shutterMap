import { IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

// PRD 기능1 수용기준: EXIF 파싱 실패/누락 필드는 사용자가 직접 입력/수정할 수
// 있어야 한다. 전부 선택 — 보낸 필드만 부분 업데이트한다.
export class UpdatePhotoMetadataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cameraName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lensName?: string;

  @IsOptional()
  @IsNumber()
  focalLength?: number;

  @IsOptional()
  @IsNumber()
  aperture?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  shutterSpeed?: string;

  @IsOptional()
  @IsNumber()
  iso?: number;

  @IsOptional()
  @IsISO8601()
  takenAt?: string;

  // note는 비워서 지우는 것도 허용 — IsNotEmpty를 걸지 않는다.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
