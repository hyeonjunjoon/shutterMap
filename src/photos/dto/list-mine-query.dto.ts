import { IsOptional, IsString, Matches } from 'class-validator';

// 양의 정수 문자열만 허용 — discovery-gallery와 동일한 규칙(0/음수/소수 거부).
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export class ListMineQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Matches(POSITIVE_INTEGER_PATTERN)
  limit?: string;
}
