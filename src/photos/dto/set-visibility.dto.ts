import { IsEnum } from 'class-validator';
import { PhotoVisibility } from '@prisma/client';

export class SetVisibilityDto {
  @IsEnum(PhotoVisibility)
  visibility: PhotoVisibility;
}
