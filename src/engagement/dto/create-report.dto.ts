import {
  IsEnum,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ReportReason } from '@prisma/client';

const MAX_DETAIL_LENGTH = 1000;

// detail의 두 가지 규칙(타입/길이는 항상, 공백 아님은 OTHER일 때만)을 하나의
// 커스텀 검증기로 묶었다 — 같은 프로퍼티에 @ValidateIf를 두 번 쌓으면 조건이
// AND로 합쳐져 전체 검증기가 한 묶음으로 스킵/실행되는 것을 스파이크로 확인했고
// (reason이 OTHER가 아닐 때 타입 체크까지 같이 스킵돼 숫자 detail이 그대로
// Prisma까지 내려가 500이 났다), 독립된 두 규칙은 분리할 수 없어 커스텀 검증기로
// 바꿨다.
@ValidatorConstraint({ name: 'reportDetailRule' })
class ReportDetailRuleConstraint implements ValidatorConstraintInterface {
  validate(detail: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateReportDto;
    if (detail === undefined) {
      return dto.reason !== ReportReason.OTHER;
    }
    if (typeof detail !== 'string') return false;
    if (detail.length > MAX_DETAIL_LENGTH) return false;
    if (dto.reason === ReportReason.OTHER) return detail.trim().length > 0;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateReportDto;
    return dto.reason === ReportReason.OTHER
      ? '기타 사유는 상세 내용을 입력해야 합니다.'
      : 'detail은 1000자 이하의 문자열이어야 합니다.';
  }
}

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @Validate(ReportDetailRuleConstraint)
  detail?: string;
}
