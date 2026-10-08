---
category: database-issues
tags: [prisma, postgis, partial-index, gist, migration, drift]
related_files:
  - prisma/schema.prisma
  - prisma/migrations
---

# Prisma가 표현 못 하는 부분(partial) 인덱스는 schema.prisma에 안 선언해도 drift가 안 남

## 문제
지도 뷰포트 조회 성능을 위해 `visibility <> 'HIDDEN' AND status = 'ACTIVE' AND location IS NOT NULL` 조건의 **부분 GIST 인덱스**가 필요했다. Prisma 스키마 문법(`@@index`)은 일반 인덱스는 선언할 수 있어도 `WHERE` 조건이 붙는 부분 인덱스는 표현할 방법이 없다. schema.prisma에 선언하지 않고 마이그레이션 파일만으로 인덱스를 만들면, 나중에 `prisma migrate dev`가 "스키마에 없는 걸 지워야 한다"며 drift로 보고 지우려 들지 않을지 확신이 없었다 — [postgis-migration-drift.md](postgis-migration-drift.md)에서 이미 "Prisma가 모르는 DB 상태"가 drift를 일으킨 적이 있어서 더 조심스러웠다.

## 원인
Prisma의 `migrate dev`는 **실제 DB를 들여다보고 비교하는 게 아니라**, 지금까지의 마이그레이션 파일들을 shadow DB에 재생(replay)한 결과와 현재 schema.prisma를 비교해서 diff를 만든다. 즉 "schema.prisma가 선언 안 한 것"과 "DB에 있지만 마이그레이션 히스토리로 설명되는 것"은 서로 충돌하지 않는다 — 전에 겪은 drift는 마이그레이션 히스토리 **밖에서**(psql로 직접) DB를 바꿔서 생긴 문제였고, 이번엔 마이그레이션 파일을 통해서 들어가므로 애초에 다른 상황이었다.

## 해결책
확신 없이 넘기지 않고 **스크래치 DB에 실제로 재현**해서 확인했다 — 기존 마이그레이션을 전부 적용한 뒤, 손으로 쓴 부분 인덱스 마이그레이션을 추가 적용하고, 그 다음 `prisma migrate dev`를 스키마 변경 없이 다시 돌려서 "Already in sync, no schema change or pending migration was found"가 나오는지 확인했다. 실제로 drift 없이 깨끗했다.

```bash
npx prisma migrate dev --create-only --name add_photo_location_gist_index
# 생성된 빈 migration.sql에 CREATE INDEX ... USING GIST (...) WHERE ... 직접 작성
npx prisma migrate dev   # 적용
npx prisma migrate dev   # 스키마 변경 없이 다시 — "Already in sync"면 안전
```

schema.prisma에는 "이 인덱스는 손으로 쓴 마이그레이션으로만 관리된다"는 주석만 남겼다.

## 다음 작업 전 체크할 것
- [ ] **Prisma 스키마 문법으로 표현 안 되는 DB 객체(부분 인덱스, 특정 오퍼레이터 클래스 등)가 필요하면: 빈 마이그레이션을 만들고 손으로 SQL을 쓰는 방식을 쓰되, "확신 없으면 스크래치 DB에서 drift 여부를 직접 확인한다"([spike-test-before-planning.md](../design-patterns/spike-test-before-planning.md)와 같은 원칙).**
- [ ] 이 패턴은 "마이그레이션 파일을 통해서 들어간 DB 변경"에만 안전하다 — `psql`/Prisma Studio로 직접 DB를 건드리는 것과는 다르다([postgis-migration-drift.md](postgis-migration-drift.md) 참고, 둘을 혼동하지 않는다).
- [ ] schema.prisma가 모르는 DB 객체는 Prisma의 다른 도구(예: `prisma db pull`로 스키마를 역생성)를 돌리면 어떻게 나오는지 아직 확인 안 했다 — 실제로 그 명령을 쓸 일이 생기면 먼저 확인한다.
