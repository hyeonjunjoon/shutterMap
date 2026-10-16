# ShutterMap 프론트엔드 1단계: 스캐폴드 + 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/` Next.js 프로젝트를 새로 만들고, 로그인/회원가입 화면과 전역 인증 상태(`GET /auth/me` 캐싱)·라우트 가드(`proxy.ts`)까지 동작하게 한다. 백엔드는 프론트가 다른 포트에서 호출할 수 있도록 CORS를 추가한다.

**Architecture:** Next.js App Router + Tailwind v4 + shadcn/ui(디자인 토큰은 `docs/designs/DESIGN.md`/`globals.css`) + TanStack Query(서버 상태) + next-themes(다크 기본). 백엔드(NestJS)의 비즈니스 로직은 건드리지 않고 `docs/api.md`에 이미 정의된 API만 호출한다 — 단, 프론트가 다른 origin에서 호출 가능하도록 CORS 설정 하나는 추가한다(Task 0). 인증은 Next.js가 JWT를 자체 검증하지 않고 매번 `GET /auth/me`로 NestJS에 위임한다.

**Tech Stack:** Next.js 16.4.0, React 19.3.0, TypeScript(create-next-app이 고정하는 `^5`, 7.x 아님), Tailwind CSS v4, shadcn/ui, `@tanstack/react-query` 5.104.2, `next-themes` 0.4.6, Vitest 5.0.3 + `@vitejs/plugin-react` 5.2.0 + `vite` 7.3.7(테스트용, `@vitejs/plugin-react@6.x`는 `vite@^8`을 요구하고 `@babel/core@8.0.0-rc` 충돌이 있어 피함 — 2026-10-12 스파이크로 확인) + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-frontend-design.md` (§2~§4, §7.4, §8), `docs/api.md`(Auth 섹션 전체, CORS/쿠키 메모), `docs/designs/DESIGN.md`/`docs/designs/globals.css`.

## Global Constraints

- Next.js는 API Route Handlers를 쓰지 않는다 — 모든 API 호출은 NestJS(`docs/api.md`)로 간다. (spec §2)
- Next.js는 JWT를 자체 검증하지 않는다 — 로그인 여부는 항상 `GET /auth/me` 호출 결과로 판단한다. (spec §4)
- 모든 API 요청은 `credentials: 'include'`를 반드시 보낸다 — 안 보내면 로그인해도 쿠키가 전송 안 돼 401이 난다. (`docs/api.md` 인증 방식)
- 에러 응답은 `{ statusCode, message, error }` 형태이고 `message`는 string 또는 string[] 둘 다 올 수 있다 — 두 경우 모두 처리한다. (`docs/api.md`)
- 카카오/구글 로그인 버튼은 `fetch`가 아니라 `<a href>` 전체 페이지 이동으로 구현한다(서버가 OAuth 제공자로 302 리다이렉트하므로) — 이것만 예외고, 그 외 내부 링크(로그인⇄회원가입)는 `next/link`를 쓴다.
- `POST /auth/register`는 성공 시 이미 로그인 세션 쿠키를 심어준다 — 가입 후 별도로 `POST /auth/login`을 또 호출하지 않는다. (`docs/api.md`, 백엔드 수정 완료됨)
- **포트 분리**: NestJS 백엔드는 `3000`, Next.js 프론트는 `3001`. 같은 포트를 쓰면 충돌하고, 다른 origin이 되는 순간 CORS가 반드시 필요해진다(Task 0).
- 미들웨어(`proxy.ts`, 2026-10-12 확인 — 아래 Task 4 참고)는 `session` 쿠키의 "존재 여부"만 확인한다(가벼운 UX 최적화) — 실제 유효성 검증은 페이지가 `GET /auth/me`로 다시 한다. 미들웨어만으로 인증을 신뢰하지 않는다. (spec §4)
- 다크 모드가 기본이지만, CSS 구조는 shadcn 표준(`:root`=라이트, `.dark`=오버라이드) 그대로 두고 `next-themes`의 `defaultTheme="dark"`로 기본값을 만든다. (`docs/designs/DESIGN.md`)
- 색상 토큰은 OKLCH. `--radius-photo`는 shadcn의 `@theme inline` 블록이 아니라 별도의 정적 `@theme { ... }` 블록에 직접 선언한다(라이트/다크로 안 바뀌는 고정값이라 var 간접참조가 필요 없음 — 2026-10-12 2차 스파이크로 재확인). 폰트는 shadcn이 만든 `@theme inline`의 기존 Geist 참조 줄을 새로 추가하지 않고 직접 교체한다. (`docs/designs/globals.css`)
- `web/`은 이 레포의 사이블링 폴더다(별도 레포 아님). (spec §3)
- **범위 내 결정**: spec §8이 말하는 "다른 요청의 401을 공통 인터셉터에서 가로채 토스트"는 이미 로그인한 사용자의 세션이 만료된 채로 보호된 액션(업로드/좋아요 등)을 시도하는 경우를 위한 것이다. 이 플랜엔 그런 액션이 아직 하나도 없다(로그인/가입 자체의 401은 "자격증명 틀림"이지 "세션 만료"가 아니라 페이지 인라인 에러로 처리하는 게 맞다). 그 공통 인터셉터는 테스트할 보호된 액션이 실제로 생기는 다음 플랜(업로드 등)에서 추가한다 — **넣을 위치는 `apiClient`를 감싸는 훅이 아니라, Task 3의 `providers.tsx`가 만드는 `QueryClient`의 `queryCache`/`mutationCache` 전역 `onError` 콜백이다.** `apiClient`는 지금처럼 프레임워크 비의존으로 순수하게 두고(테스트하기 쉽다), `new QueryClient()`(옵션 없음)에 나중에 이 옵션만 추가하면 된다 — 리팩터 불필요. 그 콜백을 실제로 쓸 때 주의할 것: (a) 받는 에러가 `ApiError`만이 아니라 `fetch` 자체가 던지는 네트워크 에러(raw `TypeError`)일 수도 있다 — `error instanceof ApiError && error.status === 401`로 좁혀야 한다(Login/Register 페이지의 catch 블록이 이미 이 패턴을 쓴다), (b) 401은 TanStack Query의 기본 재시도(3회, 지수 백오프) 대상에서 빼야 한다 — 어차피 재시도해도 계속 401만 받는다.
- **업로드 진행률**: `apiClient`는 `fetch` 기반이라 업로드 진행률(%) 이벤트를 못 받는다(`fetch`엔 그런 API가 없다). spec §7.3이 업로드 중 프로그레스 바를 요구하므로, 업로드 플랜은 `apiClient`를 재사용하지 않고 **`XMLHttpRequest` 기반 별도 업로드 함수(예: `uploadWithProgress()`)를 `lib/`에 새로 추가**한다 — `apiClient`의 에러 포맷/테스트 규칙(string/string[] message 처리 등)은 그대로 가져다 쓰되, 전송 메커니즘만 분리한다.
- 테스트용 `QueryClient`는 전부 `defaultOptions: { queries: { retry: false } }`로 만든다 — 기본값(최대 3회 재시도, 지수 백오프)이면 에러 케이스 테스트가 느려지거나 `waitFor` 타임아웃에 걸린다.
- **CORS/쿠키 domain**: 로컬 개발(웹 `:3001`/API `:3000`)은 호스트명이 같아서 쿠키 공유에 문제없지만, 배포 시 웹/API가 다른 호스트명이면 `domain` 속성이 없는 지금 쿠키 설정으로는 Next.js 쪾에서 쿠키가 전혀 안 보일 수 있다. 자세한 내용과 해결책은 `docs/api.md`의 "CORS/쿠키" 메모 참고 — 이 플랜은 로컬 개발이 되는 지점(CORS 추가)까지만 다루고, 배포 시 도메인 전략은 범위 밖이다.

## Review Focus

1. **`credentials: 'include'`를 빠뜨리면 로그인해도 모든 요청이 401로 보인다** — `docs/api.md`가 명시적으로 경고하는 가장 흔한 실수. Task 2의 `apiClient` 테스트가 모든 `fetch` 호출에 이 옵션이 실제로 들어가는지 직접 검증한다.
2. **에러 `message`가 string이 아니라 string[]로 오는 경우(검증 실패 시 여러 필드 동시 오류)** — 배열을 그대로 렌더링하면 화면이 깨진다. Task 2(`apiClient`)와 Task 6(회원가입 폼)에서 둘 다 실제로 테스트한다.
3. **`POST /auth/register`가 이미 로그인시켜주는데, 프론트가 모르고 또 `/auth/login`을 호출하면** 비밀번호를 중복으로 보내는 불필요한 요청이 생긴다. Task 6에서 "register 호출 뒤 `/auth/login`이 호출되지 않았는지"를 직접 단언한다.
4. **`proxy.ts`는 쿠키 "존재"만 보고 "유효성"은 못 본다** — 위조되거나 만료된 쿠키를 가진 요청은 통과하지만, 그 뒤 페이지가 `GET /auth/me`를 호출하면 401을 받는다. 이번 플랜엔 보호된 페이지 본체(`/upload`, `/me`)가 아직 없어서 "통과 후 실제 401을 받았을 때 다시 `/login`으로 보내는" 처리까지는 구현하지 않는다 — **다음 플랜(업로드/마이페이지)에서 반드시 페이지 레벨 재확인을 구현해야 한다**는 걸 Task 4의 주석으로 남겨둔다.
5. **에러 응답 바디가 비어있는 `200`(PATCH 성공 등)을 `.json()`으로 파싱하면 그 자체로 예외가 나고, 아예 JSON이 아닌 응답(프록시/502 HTML 페이지 등)도 마찬가지다** — 이번 플랜은 PATCH를 호출하지 않지만, `apiClient`는 다음 플랜들이 전부 재사용할 공용 함수라 지금 제대로 만들어야 한다. Task 2에서 빈 body 200과 비-JSON 응답 둘 다 테스트한다.
6. **CORS 없이는 로컬 개발조차 안 된다** — 포트를 분리하기로 했으므로(Global Constraints), 백엔드에 CORS를 안 붙이면 이 플랜의 로그인/가입 화면이 브라우저에서 전혀 동작하지 않는다. 자동 테스트(Vitest는 `fetch`를 모킹하므로 이 문제를 못 잡는다)가 아니라 Task 0에서 백엔드를 직접 고치고 실제 요청으로 확인한다.

---

## File Structure

```
shutter-map/                      (기존 백엔드 레포 루트)
├── src/main.ts                    (Modify — CORS 추가, Task 0)
├── .env                           (Modify — WEB_ORIGIN 추가, Task 0, 커밋 안 됨)
├── test/cors.e2e-spec.ts          (Create, Task 0)
└── web/                            (신규 — 이 레포의 사이블링 폴더)
    ├── app/
    │   ├── layout.tsx               (폰트 로딩 + <Providers>)
    │   ├── globals.css               (shadcn 생성 + DESIGN.md 토큰 오버라이드)
    │   ├── providers.tsx               (QueryClientProvider + ThemeProvider)
    │   ├── page.tsx                    (임시 홈 — 실제 탐색 화면은 다음 플랜)
    │   ├── page.test.tsx
    │   ├── login/
    │   │   ├── page.tsx
    │   │   └── page.test.tsx
    │   └── register/
    │       ├── page.tsx
    │       └── page.test.tsx
    ├── components/ui/                 (shadcn init + add input/label이 생성)
    ├── public/icons/
    │   ├── kakao-symbol.svg             (카카오 공식 디자인 가이드에서 받은 원본, Task 5)
    │   └── google-g-logo.svg            (구글 공식 브랜딩 가이드에서 받은 원본, Task 5)
    ├── hooks/
    │   ├── use-me.ts                   (GET /auth/me를 감싸는 TanStack Query 훅)
    │   └── use-me.test.tsx
    ├── lib/
    │   ├── api-client.ts               (공용 fetch 래퍼 — 모든 화면이 재사용)
    │   ├── api-client.test.ts
    │   ├── query-keys.ts               (쿼리 키 factory — 다음 플랜들이 재사용)
    │   └── utils.ts                    (shadcn init이 생성한 cn() 헬퍼, 이번 플랜은 손대지 않음)
    ├── proxy.ts                        (보호된 라우트 리다이렉트 — Next 16은 middleware.ts가 deprecated)
    ├── proxy.test.ts
    ├── components.json                 (shadcn 설정)
    ├── vitest.config.ts
    ├── vitest.setup.ts
    ├── .env.local.example
    ├── package.json
    └── tsconfig.json
```

---

## Task 0: 백엔드 CORS 설정 (프론트가 다른 포트에서 호출 가능하게)

**Files:**
- Modify: `src/main.ts`
- Modify: `.env` (로컬에서 직접 — 커밋되지 않는 파일)
- Create: `test/cors.e2e-spec.ts`

**Interfaces:**
- Consumes: `requireEnv`(`src/common/require-env.ts`, 기존)
- Produces: 없음(이 플랜의 다른 코드가 의존하지 않음) — 다만 Task 1 이후 `web/`에서 실제 브라우저로 로그인/가입을 테스트하려면 이 Task가 먼저 끝나 있어야 한다.

- [x] **Step 1: 실패하는 테스트 작성**

`test/cors.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { requireEnv } from '../src/common/require-env';

describe('CORS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts의 bootstrap()은 Test.createTestingModule 경로를 안 타므로(기존
    // cookieParser()도 각 e2e 테스트가 직접 다시 적용하는 것과 동일한 이유),
    // 여기서도 main.ts와 동일한 설정을 직접 적용해서 동작을 검증한다.
    app.enableCors({ origin: requireEnv('WEB_ORIGIN'), credentials: true });
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows the configured WEB_ORIGIN with credentials', async () => {
    const webOrigin = requireEnv('WEB_ORIGIN');
    const res = await request(app.getHttpServer()).get('/auth/me').set('Origin', webOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('omits Access-Control-Allow-Origin for an arbitrary, unconfigured origin', async () => {
    // "값이 evil.example.com이 아니다"처럼 약하게 비교하면 헤더가 아예 없어도
    // 통과해서 아무것도 증명 못한다 — 실제로 헤더가 비어있는지(undefined)를
    // 직접 확인한다.
    const res = await request(app.getHttpServer()).get('/auth/me').set('Origin', 'http://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

- [x] **Step 2: 테스트 실행 → 실패 확인**

```bash
npm run test:e2e -- test/cors.e2e-spec.ts
```
Expected: FAIL — `WEB_ORIGIN 환경변수가 설정되지 않았습니다.` (`.env`에 아직 없음).

- [x] **Step 3: `.env`에 `WEB_ORIGIN` 추가 + `main.ts`에 CORS 적용**

`.env`에 추가:

```
WEB_ORIGIN=http://localhost:3001
```

`src/main.ts`:

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { requireEnv } from './common/require-env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: requireEnv('WEB_ORIGIN'), credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [x] **Step 4: 테스트 실행 → 통과 확인**

```bash
npm run test:e2e -- test/cors.e2e-spec.ts
```
Expected: PASS 2/2.

- [x] **Step 5: 전체 백엔드 테스트 회귀 확인**

```bash
npm test && npm run test:e2e && npm run typecheck && npm run build
```
Expected: 전부 통과(기존 테스트 포함, 회귀 없음).

- [x] **Step 6: 커밋**

```bash
git add src/main.ts test/cors.e2e-spec.ts
git commit -m "feat: 프론트(WEB_ORIGIN)에서 호출 가능하도록 CORS 설정 추가"
```

(`.env`는 `.gitignore`에 포함돼 커밋되지 않는다 — 로컬에만 `WEB_ORIGIN` 추가.)

---

## Task 1: Next.js 스캐폴드 + Tailwind v4 + shadcn/ui + 디자인 토큰 + 테스트 도구

**Files:**
- Create: `web/` 전체(create-next-app + shadcn init이 생성하는 모든 파일)
- Modify: `web/app/globals.css` (DESIGN.md 토큰 오버라이드 적용)
- Modify: `web/package.json` (`dev`/`start` 포트 3001, `test` 스크립트 추가)
- Create: `web/app/layout.tsx` (폰트 로딩 — Providers는 Task 3에서 추가)
- Create: `web/vitest.config.ts`, `web/vitest.setup.ts`
- Create: `web/app/page.tsx`, `web/app/page.test.tsx`
- Create: `web/.env.local.example`

**Interfaces:**
- Produces: `web/` 프로젝트(아래 Task들이 전부 이 안에 파일을 추가한다). `web/app/layout.tsx`의 `RootLayout` — Task 3이 이 파일을 수정해 `<Providers>`로 children을 감싼다.

- [x] **Step 1: Next.js 프로젝트 생성**

리포 루트(`shutter-map/`)에서:

```bash
npx --yes create-next-app@16.4.0 web --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
```

- [x] **Step 2: 빌드 확인**

```bash
cd web && npm run build
```
Expected: `Compiled successfully`로 끝남 (에러 없음).

- [x] **Step 3: shadcn/ui 초기화**

```bash
cd web && npx --yes shadcn@latest init -d
```
Expected: `Project initialization completed.` — `components.json`, `components/ui/button.tsx`, `lib/utils.ts` 생성, `app/globals.css` 갱신.

- [x] **Step 4: 나머지 의존성 설치 (버전 고정 — 스파이크로 검증된 조합)**

```bash
cd web && npm install next-themes@0.4.6 @tanstack/react-query@5.104.2 pretendard@1.3.9
npm install -D vite@7.3.7 @vitejs/plugin-react@5.2.0 vitest@5.0.3 @testing-library/react@16.3.3 @testing-library/jest-dom @testing-library/user-event jsdom @types/node@latest
```
Expected: 에러 없이 설치됨. (`@vitejs/plugin-react`의 `latest`인 6.x를 쓰면 `vite@^8`을 요구하면서 `@babel/core@8.0.0-rc` 충돌이 난다 — 반드시 5.2.0으로 고정)

- [x] **Step 5: 개발 포트를 3001로 고정 (백엔드가 3000을 쓰므로 충돌 방지)**

`web/package.json`의 `"scripts"`를 아래로 교체:

```json
"dev": "next dev --port 3001",
"build": "next build",
"start": "next start --port 3001",
"lint": "eslint"
```

- [x] **Step 6: DESIGN.md 토큰을 globals.css에 적용**

`web/app/globals.css`를 열어서(shadcn init이 만든 `:root { ... }` / `.dark { ... }` 블록은 그대로 두고) 아래만 바꾼다:

1. `@theme inline { ... }` 블록 안에서 아래 두 줄을 **찾아서 직접 교체**(새 줄 추가 아님):
   - `--font-sans: var(--font-sans);` → `--font-sans: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;`
   - `--font-mono: var(--font-geist-mono);` → `--font-mono: var(--font-ibm-plex-mono), ui-monospace, monospace;`
2. `@theme inline { ... }` 블록 **바로 다음에 새로운 정적 블록**을 추가(`inline` 아님):
   ```css
   @theme {
     --radius-photo: 0.125rem;
   }
   ```
3. `:root { ... }` 블록에서 아래 값을 찾아 교체:
   ```css
   --primary: oklch(0.666 0.179 58.318);
   --primary-foreground: oklch(0.145 0 0);
   --ring: oklch(0.666 0.179 58.318);
   --radius: 0.5rem;
   ```
4. `.dark { ... }` 블록에서 아래 값을 찾아 교체:
   ```css
   --primary: oklch(0.769 0.188 70.08);
   --primary-foreground: oklch(0.145 0 0);
   --ring: oklch(0.769 0.188 70.08);
   ```

(정확한 값/이유는 `docs/designs/DESIGN.md`, `docs/designs/globals.css` 참고 — 둘 다 2026-10-12 스파이크로 검증된 내용이다. `--radius-photo`를 `@theme inline`이 아니라 별도 정적 `@theme` 블록에 넣는 이유: 라이트/다크로 안 바뀌는 고정값이라 var 간접참조가 필요 없다.)

- [x] **Step 7: 루트 레이아웃에 폰트 로딩 적용**

`web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';

const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-ibm-plex-mono' });

export const metadata: Metadata = {
  title: 'ShutterMap',
  description: '카메라 작례 지도 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={ibmPlexMono.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

(shadcn이 만든 `@layer base`에 `html { @apply font-sans; }`가 이미 있어서 상속으로도 적용되긴 하지만, `<body>`에도 `font-sans`를 명시해두면 어디에 적용되는지 코드에서 바로 보이고 상속 경로가 중간에 끊길 걱정도 없다. `antialiased`는 폰트 렌더링을 더 매끄럽게 한다.)

(`suppressHydrationWarning`은 Task 3에서 붙일 `next-themes`가 서버 렌더 이후 `<html>`에 `class="dark"`를 즉시 추가하기 때문에 필요 — 지금 당장은 안 써도 미리 넣어둔다.)

- [x] **Step 8: 테스트 도구 설정**

`web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

`web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`web/package.json`의 `"scripts"`에 추가:

```json
"test": "vitest run"
```

- [x] **Step 9: 실패하는 홈페이지 테스트 작성**

`web/app/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

describe('Home page', () => {
  it('renders the ShutterMap heading', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'ShutterMap' })).toBeDefined();
  });
});
```

- [x] **Step 10: 테스트 실행 → 실패 확인**

```bash
cd web && npm test
```
Expected: FAIL — `app/page.tsx`가 아직 "ShutterMap" 제목을 안 가지고 있음(create-next-app의 기본 템플릿 내용).

- [x] **Step 11: 홈페이지 구현**

`web/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main>
      <h1>ShutterMap</h1>
    </main>
  );
}
```

- [x] **Step 12: 테스트 실행 → 통과 확인**

```bash
cd web && npm test
```
Expected: PASS 1/1.

- [x] **Step 13: 환경변수 예시 파일 작성**

`web/.env.local.example`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

로컬 개발용 `web/.env.local`도 같은 내용으로 직접 만든다(이 파일은 `.gitignore`에 이미 포함돼 커밋되지 않음 — create-next-app 기본 설정 확인됨). 웹 자신은 3001에서 뜬다(Step 5) — 이 값은 "웹이 호출할 API 주소"이지 웹 자신의 포트가 아니다.

- [x] **Step 14: 빌드 후 디자인 토큰이 실제로 반영됐는지 확인**

이 세션엔 실제 브라우저 도구가 없어서, 컴파일된 CSS 파일을 직접 읽어서 확인한다(브라우저에서 렌더링했을 때 쓰일 값과 동일한 파일):

```bash
cd web && npm run build
CSS_FILE=$(find .next/static/css -name "*.css" | head -1)
grep -o "rounded-photo{[^}]*}" "$CSS_FILE"
grep -o "\-\-font-sans:[^;]*" "$CSS_FILE" | head -1
```
Expected: 첫 줄은 `.rounded-photo{border-radius:.125rem}` 비슷한 결과, 둘째 줄은 `Pretendard`가 포함된 값. 둘 중 하나라도 안 나오면 Step 6을 다시 확인한다.

- [x] **Step 15: 테스트 재확인 + 커밋**

```bash
cd web && npm test && npm run build
```
Expected: 둘 다 성공.

```bash
cd /path/to/shutter-map
git add web/
git commit -m "feat(web): Next.js 스캐폴드 + Tailwind v4 + shadcn/ui + 디자인 토큰 + Vitest 설정"
```

---

## Task 2: 공용 API 클라이언트

**Files:**
- Create: `web/lib/api-client.ts`
- Test: `web/lib/api-client.test.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_API_BASE_URL` (Task 1에서 `.env.local`에 설정됨)
- Produces: `apiClient<T>(path: string, options?: RequestInit): Promise<T>`, `ApiError` 클래스(`.status: number`, `.message: string`) — Task 3, 5, 6이 전부 이걸 가져다 쓴다. `options`를 그대로 `fetch`에 스프레드하므로 `{ signal }`(AbortSignal)을 넘기면 TanStack Query의 `useInfiniteQuery`/`useQuery` 자동 취소가 추가 코드 없이 바로 동작한다(다음 플랜의 지도 뷰포트 팬닝·무한스크롤이 이 경로를 쓴다). 다음 플랜(업로드)은 진행률 표시가 필요해서 이 함수를 재사용하지 않고 별도 함수를 쓴다(Global Constraints "업로드 진행률" 참고) — `FormData` body 자체는 지원하지만 업로드 전용 경로는 아니다.

- [x] **Step 1: 실패하는 테스트 작성**

`web/lib/api-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

function mockFetchOnce(status: number, body: unknown, rawText?: string) {
  const text = rawText !== undefined ? rawText : body === undefined ? '' : JSON.stringify(body);
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response);
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    mockFetchOnce(200, { id: 'u1', email: 'a@b.com' });
    const result = await apiClient('/auth/me');
    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('returns null for an empty 200 body without throwing', async () => {
    mockFetchOnce(200, undefined);
    const result = await apiClient('/photos/x/visibility', { method: 'PATCH' });
    expect(result).toBeNull();
  });

  it('throws ApiError (not a raw SyntaxError) when the body is not valid JSON', async () => {
    mockFetchOnce(502, undefined, '<html>Bad Gateway</html>');
    await expect(apiClient('/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the string message on a 401', async () => {
    mockFetchOnce(401, {
      statusCode: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      error: 'Unauthorized',
    });
    await expect(apiClient('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    mockFetchOnce(401, {
      statusCode: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      error: 'Unauthorized',
    });
    await expect(apiClient('/auth/login', { method: 'POST' })).rejects.toThrow(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    );
  });

  it('joins a string[] message on a 400 validation error', async () => {
    mockFetchOnce(400, {
      statusCode: 400,
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      error: 'Bad Request',
    });
    await expect(apiClient('/auth/register', { method: 'POST' })).rejects.toThrow(
      'email must be an email, password must be longer than or equal to 8 characters',
    );
  });

  it('sends credentials: include on every request', async () => {
    mockFetchOnce(200, { ok: true });
    await apiClient('/auth/me');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not set Content-Type when the body is FormData (브라우저가 자동으로 boundary를 붙인 multipart를 설정해야 함)', async () => {
    mockFetchOnce(201, [{ id: 'p1' }]);
    const formData = new FormData();
    formData.append('files', new Blob(['x']), 'a.jpg');
    await apiClient('/photos', { method: 'POST', body: formData });

    const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callOptions.headers['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when the body is a plain object/string (FormData 아님)', async () => {
    mockFetchOnce(200, { ok: true });
    await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) });

    const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callOptions.headers['Content-Type']).toBe('application/json');
  });
});
```

- [x] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd web && npx vitest run lib/api-client.test.ts
```
Expected: FAIL — `Cannot find module './api-client'`.

- [x] **Step 3: 구현**

`web/lib/api-client.ts`:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  // FormData일 때 Content-Type을 직접 지정하면 브라우저가 자동으로 붙이는
  // multipart boundary가 빠져서 서버가 파싱을 못 한다 — 아예 설정 안 하고
  // 브라우저에게 맡긴다(다음 플랜의 사진 업로드가 이 경로를 쓴다).
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  // NestJS의 PATCH 엔드포인트 다수가 200 + 빈 body를 돌려준다 — 빈 문자열을
  // .json()으로 바로 파싱하면 그 자체로 SyntaxError가 나서, text()로 먼저
  // 받아 빈 문자열인지 확인한다. JSON이 아닌 응답(프록시 에러 페이지 등)도
  // 같은 이유로 try/catch로 감싸 ApiError로 통일한다.
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, '서버 응답을 해석할 수 없습니다.');
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractErrorMessage(body));
  }

  return body as T;
}
```

- [x] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd web && npx vitest run lib/api-client.test.ts
```
Expected: PASS 8/8.

- [x] **Step 5: 커밋**

```bash
git add web/lib/api-client.ts web/lib/api-client.test.ts
git commit -m "feat(web): 공용 API 클라이언트 (credentials:include, FormData 지원, 에러 포맷/비JSON 응답 처리)"
```

---

## Task 3: 전역 인증 상태 (`useMe`) + Providers

**Files:**
- Create: `web/lib/query-keys.ts`
- Create: `web/hooks/use-me.ts`
- Test: `web/hooks/use-me.test.tsx`
- Create: `web/app/providers.tsx`
- Modify: `web/app/layout.tsx` (Task 1에서 만든 파일에 `<Providers>` 추가)

**Interfaces:**
- Consumes: `apiClient`, `ApiError` (Task 2)
- Produces: `queryKeys.me` — 다음 플랜(탐색/상세/업로드/마이페이지)이 각자 다른 키 모양을 발명하지 않도록, 쿼리 키를 전부 `web/lib/query-keys.ts` 한 곳에서 관리한다(아래 Step 1 참고). `useMe(): UseQueryResult<Me | null>` — `Me = { id: string; email: string; ownedCameraName: string | null; ownedCameraRaw: string | null }`. `Providers` 컴포넌트 — children을 `QueryClientProvider` + `ThemeProvider`로 감싼다.

- [x] **Step 1: 쿼리 키 factory 작성**

`web/lib/query-keys.ts`:

```ts
// 쿼리 키를 한 곳에서 관리한다 — 다음 플랜(탐색/상세/업로드/마이페이지)이 각자
// 다른 모양의 키를 발명하면 캐시 무효화가 어긋난다.
//
// cursor/페이지 파라미터는 절대 키에 넣지 않는다 — useInfiniteQuery는 키를
// 하나로 고정하고 cursor를 queryFn의 pageParam 인자로만 받는다. 키에 cursor를
// 넣으면 페이지마다 별도 캐시 엔트리가 생겨서 useInfiniteQuery의 pages 배열
// 누적을 못 쓰게 된다(예: 마이페이지 목록, 갤러리 무한스크롤이 여기 해당).
// 필터 객체는 키에 넣는 게 맞다 — 필터가 바뀌면 실제로 다른 쿼리니까.
export const queryKeys = {
  me: ['me'] as const,
};
```

이 플랜은 `me` 하나만 쓴다 — 아직 존재하지 않는 화면의 키(`photo`, `discovery.gallery` 등)를 미리 만들어두지 않는다(다음 플랜이 실제로 필요할 때 이 파일에 같은 패턴으로 추가한다).

- [x] **Step 2: 실패하는 테스트 작성**

`web/hooks/use-me.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMe } from './use-me';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  // retry:false — 기본값(재시도 + 지수 백오프)이면 500 에러 테스트가
  // waitFor 타임아웃에 걸린다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the user on success', async () => {
    mockedApiClient.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      ownedCameraName: null,
      ownedCameraRaw: null,
    });
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() =>
      expect(result.current.data).toEqual({
        id: 'u1',
        email: 'a@b.com',
        ownedCameraName: null,
        ownedCameraRaw: null,
      }),
    );
    expect(result.current.isError).toBe(false);
  });

  it('returns null (not an error) when the API returns 401', async () => {
    mockedApiClient.mockRejectedValue(new ApiError(401, '인증 필요'));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a real error (500) as isError', async () => {
    mockedApiClient.mockRejectedValue(new ApiError(500, '서버 오류'));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [x] **Step 3: 테스트 실행 → 실패 확인**

```bash
cd web && npx vitest run hooks/use-me.test.tsx
```
Expected: FAIL — `Cannot find module './use-me'`.

- [x] **Step 4: `useMe` 구현**

`web/hooks/use-me.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Me {
  id: string;
  email: string;
  ownedCameraName: string | null;
  ownedCameraRaw: string | null;
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await apiClient<Me>('/auth/me');
      } catch (error) {
        // 비로그인(401)은 에러가 아니라 정상 상태다 — 토스트/에러 바운더리로
        // 새지 않게 여기서 null로 변환한다.
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  });
}
```

- [x] **Step 5: 테스트 실행 → 통과 확인**

```bash
cd web && npx vitest run hooks/use-me.test.tsx
```
Expected: PASS 3/3.

- [x] **Step 6: Providers 작성 + 루트 레이아웃에 연결**

`web/app/providers.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

`web/app/layout.tsx`의 import 아래에 추가:

```tsx
import { Providers } from './providers';
```

`<body>` 부분을 아래로 교체:

```tsx
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
```

- [x] **Step 7: 전체 테스트 + 빌드 확인**

```bash
cd web && npm test && npm run build
```
Expected: 테스트 전부 통과(Task 1의 홈페이지 테스트 포함, 회귀 없음), 빌드 성공.

- [x] **Step 8: 커밋**

```bash
git add web/lib/query-keys.ts web/hooks/use-me.ts web/hooks/use-me.test.tsx web/app/providers.tsx web/app/layout.tsx
git commit -m "feat(web): useMe 훅 + QueryClientProvider/ThemeProvider — 전역 로그인 상태"
```

---

## Task 4: 라우트 가드 (`proxy.ts`)

**2026-10-12 확인**: Next.js 16은 `middleware.ts` 파일명 규칙을 **deprecated** 처리했다(소스 확인: `warnOnce`로 "The 'middleware' file convention is deprecated. Please use 'proxy' instead." 경고, `middleware.ts`와 `proxy.ts`가 동시에 있으면 **빌드 에러**). 파일명은 `proxy.ts`, 내보내는 함수 이름도 `middleware`가 아니라 `proxy`여야 한다(아니면 "The Proxy file must export a function named `proxy` or a default function" 에러). `config.matcher` 내보내는 방식은 그대로다.

**Files:**
- Create: `web/proxy.ts`
- Test: `web/proxy.test.ts`

**Interfaces:**
- Consumes: 없음(이 플랜의 다른 코드에 의존하지 않음 — `next/server`만 사용)
- Produces: `proxy(request: NextRequest): NextResponse` — `/upload`, `/me` 경로를 쿠키 존재 여부로 보호. 다음 플랜(업로드/마이페이지)이 이 보호 목록에 실제 페이지를 추가한다.

- [x] **Step 1: 실패하는 테스트 작성**

`web/proxy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy (route guard)', () => {
  it('redirects to /login when visiting /upload without a session cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/upload'));
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects to /login when visiting /me without a session cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/me'));
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes through /upload when a session cookie is present (존재만 확인 — 유효성은 페이지가 재확인)', () => {
    const req = new NextRequest(new URL('http://localhost:3001/upload'), {
      headers: { cookie: 'session=fake-jwt' },
    });
    const res = proxy(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect public paths like / without a cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/'));
    const res = proxy(req);
    expect(res.status).toBe(200);
  });
});
```

- [x] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd web && npx vitest run proxy.test.ts
```
Expected: FAIL — `Cannot find module './proxy'`.

- [x] **Step 3: 구현**

`web/proxy.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/upload', '/me'];

// 쿠키 "존재"만 확인한다 — 위조/만료 여부는 모른다. 그건 이 proxy가 할 일이
// 아니라, 통과한 뒤 페이지가 GET /auth/me를 호출해서 NestJS에 다시 확인한다
// (spec §4: "인증 검증은 전부 NestJS"). /upload, /me 페이지 본체는 아직 없고
// 다음 플랜에서 추가된다 — 그 플랜에서 반드시 "me가 null이면 /login으로"
// 페이지 레벨 재확인을 같이 구현해야 한다.
//
// 파일명이 middleware.ts가 아니라 proxy.ts인 이유, 함수 이름이 middleware가
// 아니라 proxy인 이유: Next.js 16부터 "middleware" 파일 규칙은 deprecated다
// (2026-10-12 확인).
export function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isProtected && !request.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/upload/:path*', '/me/:path*'],
};
```

- [x] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd web && npx vitest run proxy.test.ts
```
Expected: PASS 4/4.

- [x] **Step 5: 커밋**

```bash
git add web/proxy.ts web/proxy.test.ts
git commit -m "feat(web): /upload, /me 보호 라우트 proxy.ts (쿠키 존재 여부만 확인)"
```

---

## Task 5: 로그인 화면

**Files:**
- Create: `web/app/login/page.tsx`
- Test: `web/app/login/page.test.tsx`
- Modify: `web/components/ui/` (shadcn `input`, `label` 컴포넌트 추가 — 아직 없음)
- Create: `web/public/icons/kakao-symbol.svg`, `web/public/icons/google-g-logo.svg` (각 사 공식 브랜드 리소스)

**Interfaces:**
- Consumes: `apiClient`, `ApiError`(Task 2), `useMe`, `queryKeys`(Task 3), shadcn `Button`(Task 1에서 이미 생성됨)
- Produces: `/login` 라우트. 로그인 성공 시 `queryKeys.me` 쿼리를 무효화하고 `/`로 이동.

- [x] **Step 1: shadcn Input/Label 컴포넌트 추가**

```bash
cd web && npx --yes shadcn@latest add input label
```
Expected: `components/ui/input.tsx`, `components/ui/label.tsx` 생성.

- [x] **Step 2: 카카오/구글 공식 브랜드 아이콘 준비**

두 회사 모두 심볼/로고 자체는 직접 그리거나 변형하면 안 된다 — 카카오는 "심볼의 형태, 비율, 색상은 변경할 수 없다"고 명시하고, 구글은 "G" 로고에 항상 표준 멀티컬러를 포함해야 한다고 명시한다. 그래서 심볼만 공식 리소스에서 그대로 받고, 버튼 컨테이너/레이블(한국어 텍스트)은 우리가 직접 구성한다(둘 다 가이드가 허용하는 범위).

1. [카카오 로그인 디자인 가이드](https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide)에서 카카오 심볼(말풍선) SVG를 받아 `web/public/icons/kakao-symbol.svg`로 저장.
2. [Sign in with Google 브랜딩 가이드라인](https://developers.google.com/identity/branding-guidelines)의 에셋 다운로드에서 "G" 로고 SVG만 받아 `web/public/icons/google-g-logo.svg`로 저장(버튼 전체 이미지가 아니라 로고만 — 레이블은 "구글로 로그인"을 직접 쓴다).

```bash
ls web/public/icons/kakao-symbol.svg web/public/icons/google-g-logo.svg
```
Expected: 두 파일 모두 존재.

- [x] **Step 3: 실패하는 테스트 작성**

`web/app/login/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './page';
import { apiClient, ApiError } from '@/lib/api-client';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.resolve({ ok: true });
    });
  });

  it('renders labeled inputs with the right autoComplete, and OAuth links as real <a> tags (fetch가 아니라 전체 페이지 이동이어야 함)', () => {
    renderWithQuery(<LoginPage />);

    const emailInput = screen.getByLabelText('이메일');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    const passwordInput = screen.getByLabelText('비밀번호');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');

    const kakaoLink = screen.getByRole('link', { name: /카카오로 로그인/ });
    expect(kakaoLink.tagName).toBe('A');
    expect(kakaoLink.getAttribute('href')).toContain('/auth/kakao');

    const googleLink = screen.getByRole('link', { name: /구글로 로그인/ });
    expect(googleLink.tagName).toBe('A');
    expect(googleLink.getAttribute('href')).toContain('/auth/google');
  });

  it('logs in and redirects to / on success', async () => {
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  it('shows the error message on 401', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(new ApiError(401, '이메일 또는 비밀번호가 올바르지 않습니다.'));
    });
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.'),
    );
  });

  it('shows a stable-width loading state while submitting (텍스트만 바뀌고 버튼은 비활성화)', async () => {
    let resolveLogin!: () => void;
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return new Promise((resolve) => {
        resolveLogin = () => resolve({ ok: true });
      });
    });
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const loadingButton = await screen.findByRole('button', { name: '로그인 중...' });
    expect(loadingButton).toBeDisabled();

    resolveLogin();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });
});
```

- [x] **Step 4: 테스트 실행 → 실패 확인**

```bash
cd web && npx vitest run app/login/page.test.tsx
```
Expected: FAIL — `Cannot find module './page'`.

- [x] **Step 5: 구현**

`web/app/login/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/use-me';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-black">로그인</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* w-full: 로딩 중 텍스트("로그인" → "로그인 중...")가 길어져도
              버튼 폭이 컨테이너 폭(max-w-sm)에 고정돼 있어 레이아웃이 흔들리지 않는다. */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        {/* 카카오/구글은 서버가 OAuth 제공자로 302 리다이렉트하므로 next/link가
            아니라 실제 <a> 전체 페이지 이동이어야 한다 — fetch로 부르면 안 됨.
            컨테이너 색상/radius/레이블 색상은 각 사 공식 가이드 수치를 그대로
            따른다(docs/designs/DESIGN.md가 아니라 각 사 브랜드 규정이 우선).
            심볼/로고 자체는 Step 2에서 받은 원본 그대로, 비율만 유지한다. */}
        <div className="space-y-2">
          <a
            href={`${API_BASE_URL}/auth/kakao`}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3 text-sm font-medium text-black/85"
          >
            {/* 고정 18px 아이콘이라 next/image 최적화 파이프라인이 필요 없다 —
                그걸 쓰면 next.config에 dangerouslyAllowSVG를 추가해야 해서
                평범한 <img>가 더 적은 변경으로 끝난다. */}
            <img src="/icons/kakao-symbol.svg" alt="" width={18} height={18} />
            카카오로 로그인
          </a>
          <a
            href={`${API_BASE_URL}/auth/google`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#747775] bg-white py-3 text-sm font-medium text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]"
          >
            <img src="/icons/google-g-logo.svg" alt="" width={18} height={18} />
            구글로 로그인
          </a>
        </div>

        <p className="text-center text-sm">
          계정이 없으신가요?{' '}
          <Link href="/register" className="underline">
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [x] **Step 6: 테스트 실행 → 통과 확인**

```bash
cd web && npx vitest run app/login/page.test.tsx
```
Expected: PASS 4/4.

- [x] **Step 7: 커밋**

```bash
git add web/app/login/ web/components/ui/input.tsx web/components/ui/label.tsx web/public/icons/
git commit -m "feat(web): 로그인 화면"
```

---

## Task 6: 회원가입 화면

**Files:**
- Create: `web/app/register/page.tsx`
- Test: `web/app/register/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `ApiError`(Task 2), `useMe`, `queryKeys`(Task 3), shadcn `Button`/`Input`/`Label`(Task 1, Task 5)
- Produces: `/register` 라우트. 가입 성공 시(백엔드가 이미 로그인시켜줌) `queryKeys.me` 쿼리를 무효화하고 `/`로 이동 — `/auth/login`을 별도로 호출하지 않는다.

- [x] **Step 1: 실패하는 테스트 작성**

`web/app/register/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterPage from './page';
import { apiClient, ApiError } from '@/lib/api-client';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.resolve({ id: 'u1', email: 'a@b.com' });
    });
  });

  it('labels inputs with autoComplete="new-password", and registers+redirects without calling /auth/login separately (백엔드가 가입 시 이미 로그인시켜줌)', async () => {
    renderWithQuery(<RegisterPage />);
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('autoComplete', 'new-password');

    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    const calledPaths = mockedApiClient.mock.calls.map((call) => call[0]);
    expect(calledPaths).not.toContain('/auth/login');
  });

  it('shows the error message on 409 (duplicate email)', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(new ApiError(409, '이미 가입된 이메일입니다.'));
    });
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다.'));
  });

  it('shows a joined string[] validation message on 400', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(
        new ApiError(400, 'email must be an email, password must be longer than or equal to 8 characters'),
      );
    });
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'bad');
    await userEvent.type(screen.getByLabelText('비밀번호'), '1');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/email must be an email/));
  });

  it('shows a stable-width loading state while submitting (텍스트만 바뀌고 버튼은 비활성화)', async () => {
    let resolveRegister!: () => void;
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return new Promise((resolve) => {
        resolveRegister = () => resolve({ id: 'u1', email: 'a@b.com' });
      });
    });
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    const loadingButton = await screen.findByRole('button', { name: '가입 중...' });
    expect(loadingButton).toBeDisabled();

    resolveRegister();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });
});
```

- [x] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd web && npx vitest run app/register/page.test.tsx
```
Expected: FAIL — `Cannot find module './page'`.

- [x] **Step 3: 구현**

`web/app/register/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/use-me';

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // 백엔드가 가입과 동시에 로그인 세션 쿠키를 심어준다(docs/api.md) —
      // 별도로 /auth/login을 또 호출하지 않는다.
      await apiClient('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-black">회원가입</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* w-full: 로딩 중 텍스트("가입하기" → "가입 중...")가 길어져도
              버튼 폭이 컨테이너 폭(max-w-sm)에 고정돼 있어 레이아웃이 흔들리지 않는다. */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '가입 중...' : '가입하기'}
          </Button>
        </form>
        <p className="text-center text-sm">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [x] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd web && npx vitest run app/register/page.test.tsx
```
Expected: PASS 4/4.

- [x] **Step 5: 전체 테스트 + 빌드 확인**

```bash
cd web && npm test && npm run build
```
Expected: 전체 테스트 통과(지금까지의 모든 Task 포함, 회귀 없음), 빌드 성공.

- [x] **Step 6: 커밋**

```bash
git add web/app/register/
git commit -m "feat(web): 회원가입 화면"
```
