---
category: integration-issues
tags: [prisma, dependency-version, breaking-change, npm]
related_files:
  - prisma/schema.prisma
  - prisma7.config.ts
  - src/prisma/prisma.service.ts
---

# Prisma 7의 변경사항들 (버전 가정이 깨진 사례)

## 문제
Prisma를 설치하자마자 세 가지가 동시에 깨졌다:
1. `npm install -D prisma`가 `8.0.0-rc.20`을 설치했다 (npm `latest` 태그가 RC임).
2. `prisma init`을 돌리니 `schema.prisma`/`.env`를 만들어주는 게 아니라 "AI-agent skills"라는 걸 `.claude/skills/`, `.windsurf/skills/`, `.agents/skills/`에 설치했다.
3. `schema.prisma`에 `datasource.url = env("DATABASE_URL")`을 쓰니 `P1012` 에러로 거부당했다.

## 원인
- npm의 `latest` dist-tag가 항상 "안정 버전"을 가리키는 건 아니다. 이 시점 Prisma는 8.0을 RC로 배포 중이었고, `prev` 태그(`7.10.0`)가 실제 마지막 안정판이었다.
- Prisma 7부터 `prisma init`이 완전히 다른 워크플로(설정 파일 중심, 에이전트 스킬 동기화)로 바뀌었다.
- Prisma 7부터 connection URL을 schema 파일이 아니라 `prisma.config.ts`/클라이언트 생성자(`adapter`)에서 받는다. `PrismaClient`도 드라이버 어댑터(`@prisma/adapter-pg` 등) 없이는 인스턴스화가 안 된다.

## 해결책
- `npm view prisma dist-tags`로 `latest`/`prev` 확인 후, `npm install prisma@7.10.0 @prisma/client@7.10.0`으로 고정.
- `prisma init`이 설치한 `.claude/skills/`, `.windsurf/`, `.agents/`, `skills-lock.json`은 전부 삭제 (이 레포 AI 툴링은 gstack+Superpowers로 이미 정해져 있어서 불필요).
- `schema.prisma`의 `datasource` 블록에서 `url` 제거, `extensions = [postgis]`만 유지.
- `@prisma/adapter-pg` + `pg` 설치 후 `PrismaService`에서 `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`로 생성.

## 다음 작업 전 체크할 것
- [ ] 메이저 버전 업그레이드 전에는 `npm view <pkg> dist-tags`로 `latest`가 실제 안정판인지 먼저 확인한다.
- [ ] Prisma 스키마를 새로 만지는 작업이면, 이 레포는 `PrismaClient`를 드라이버 어댑터로 생성한다는 걸 기억한다 (schema에 `url` 넣지 않는다).
- [ ] Prisma를 업그레이드할 일이 생기면 `prisma init`을 다시 돌리지 말고, 이미 있는 `prisma/schema.prisma` + `prisma7.config.ts`를 직접 고친다.
