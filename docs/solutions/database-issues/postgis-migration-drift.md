---
category: database-issues
tags: [postgis, prisma-migrate, postgresql, destructive-operation]
related_files:
  - prisma/schema.prisma
  - prisma/migrations
---

# PostGIS 수동 설치로 생긴 마이그레이션 drift

## 문제
`npx prisma migrate dev --name init`을 처음 돌렸을 때 "Drift detected"가 뜨고, "We need to reset the public schema"라며 멈췄다.

## 원인
Prisma 설치/스키마 작성 전에, DB가 PostGIS를 지원하는지 미리 확인하려고 `psql`로 직접 `CREATE EXTENSION postgis;`를 실행해뒀다. 그 결과 마이그레이션 기록(히스토리)이 하나도 없는 상태에서 DB에는 이미 `postgis` 확장이 올라가 있는 상태가 됐고, Prisma는 "마이그레이션 파일이 설명하는 상태"와 "실제 DB 상태"가 다르다고 판단해 drift로 봤다.

추가로, `npx prisma migrate reset --force`를 실행하려 하니 Prisma 7이 **AI 에이전트가 호출했다는 걸 감지해서 거부**했다 — 사용자의 명시적 동의 없이는 destructive 명령을 실행하지 못하게 막는 안전장치다. 사용자 동의 후 `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` 환경변수(사용자의 동의 메시지 원문)를 넘겨야 통과됐다.

## 해결책
- 로컬 개발 DB가 비어있는 걸 확인한 뒤(`psql -l`, 테이블 없음), 사용자에게 명시적으로 확인받고 `prisma migrate reset --force` 실행.
- 그 다음 `prisma migrate dev --name init`을 다시 돌리면 마이그레이션 히스토리와 DB 상태가 처음부터 일치하게 맞춰진다.

## 다음 작업 전 체크할 것
- [ ] Prisma로 관리할 DB에는 **Prisma 마이그레이션을 통하지 않고 직접 `CREATE EXTENSION`/`ALTER TABLE` 등을 실행하지 않는다.** 확장 설치가 필요하면 schema.prisma의 `extensions = [...]`로 선언하고 마이그레이션이 만들게 한다.
- [ ] `migrate reset`처럼 데이터를 지우는 명령은 AI가 알아서 재시도하지 못한다 — 사용자 동의가 막히면 그게 의도된 안전장치라는 걸 기억한다.
- [ ] 새로운 로컬 DB를 셋업할 때는 `createdb` → (확장 수동 설치 없이) → `prisma migrate dev` 순서로만 간다.
