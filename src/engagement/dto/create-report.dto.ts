import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ReportReason } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  // reason이 OTHER일 때만 detail을 필수로 만든다. ValidateIf 조건이 false면
  // 이 프로퍼티의 검증이 완전히 스킵된다(스파이크로 확인) — 다른 사유에선 detail이
  // 있어도 그냥 저장되고, 없어도 통과한다.
  @ValidateIf((dto: CreateReportDto) => dto.reason === ReportReason.OTHER)
  @IsString()
  @IsNotEmpty({ message: '기타 사유는 상세 내용을 입력해야 합니다.' })
  detail?: string;
}
