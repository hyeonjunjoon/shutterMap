---
category: integration-issues
tags: [class-validator, validateif, nestjs, conditional-validation, decorator-composition]
related_files:
  - src/engagement/dto/create-report.dto.ts
---

# class-validator의 @ValidateIf를 한 프로퍼티에 두 번 쌓으면 조건이 AND로 합쳐진다

## 문제
신고 `detail` 필드에 독립된 두 규칙이 필요했다: (1) 값이 있으면 항상 문자열/길이(1000자)를 검증, (2) `reason`이 `OTHER`일 때만 공백 제외 비어있지 않아야 함. 이걸 `@ValidateIf(detail !== undefined) @IsString() @MaxLength(1000) @ValidateIf(reason === OTHER) @IsNotEmpty()`처럼 한 프로퍼티에 `@ValidateIf`를 두 번 쌓아서 "독립된 두 게이트"로 구현했다. fresh reviewer가 실제로 입력을 넣어보기 전까지 몰랐는데, `reason`이 `OTHER`가 아닐 때 숫자나 객체 같은 잘못된 타입의 `detail`을 보내도 **타입 체크(`@IsString`)까지 같이 스킵돼** 통과했고, 그 값이 그대로 `prisma.report.create`까지 내려가 `PrismaClientValidationError`로 500이 났다.

## 원인
같은 프로퍼티에 여러 `@ValidateIf`를 적용하면 "각자 가까운 validator만 게이팅"하는 게 아니라, 그 프로퍼티의 **모든 validator가 모든 ValidateIf 조건의 AND**로 묶인다. 두 번째 `@ValidateIf(reason===OTHER)`가 붙는 순간 첫 번째 `@ValidateIf(detail!==undefined)` 아래 있던 `@IsString()`/`@MaxLength()`까지 "reason이 OTHER여야만 실행"되는 것으로 바뀐다. 데코레이터를 코드에서 위→아래로 읽는 순서와, 실제 검증이 게이팅되는 범위가 다르다는 게 함정이다.

## 해결책
스크래치에서 스파이크로 9가지 입력 조합을 먼저 돌려 실제 동작을 확인한 뒤, 두 규칙을 하나의 커스텀 `@Validate(ValidatorConstraint)`로 합쳤다 — 조건 분기를 `validate()` 메서드 안에서 직접 쓰면 "항상 검증"과 "조건부 검증"을 섞어도 서로 간섭하지 않는다.

```ts
@ValidatorConstraint({ name: 'reportDetailRule' })
class ReportDetailRuleConstraint implements ValidatorConstraintInterface {
  validate(detail: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateReportDto;
    if (detail === undefined) return dto.reason !== ReportReason.OTHER;
    if (typeof detail !== 'string') return false;
    if (detail.length > MAX_DETAIL_LENGTH) return false;
    if (dto.reason === ReportReason.OTHER) return detail.trim().length > 0;
    return true;
  }
}
```

## 다음 작업 전 체크할 것
- [ ] **한 프로퍼티에 "항상 적용되는 검증"과 "조건부로만 적용되는 검증"을 동시에 걸어야 하면, `@ValidateIf`를 두 번 쌓지 않는다.** 커스텀 `@Validate(ValidatorConstraintInterface)` 하나로 합쳐서 로직을 직접 분기한다.
- [ ] `@ValidateIf`가 하나뿐이어도 "조건이 false면 그 프로퍼티의 검증이 전부 스킵된다"는 걸 전제로 설계한다 — 잘못된 타입의 값이 그대로 다음 레이어(DB 등)까지 내려갈 수 있다.
- [ ] class-validator 데코레이터 조합이 조금이라도 복잡해지면(조건부+복수 규칙), 커밋 전에 스크래치에서 실제 입력 조합을 `validate()`로 직접 돌려 확인한다 ([spike-test-before-planning.md](../design-patterns/spike-test-before-planning.md)와 동일 원칙).
