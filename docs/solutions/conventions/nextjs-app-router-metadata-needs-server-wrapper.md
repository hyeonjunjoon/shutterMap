---
category: conventions
tags: [nextjs, app-router, metadata, use-client, server-component, next16]
related_files:
  - web/app/login/page.tsx
  - web/app/login/login-form.tsx
  - web/app/register/page.tsx
  - web/app/register/register-form.tsx
---

# `'use client'` 파일은 `export const metadata`를 못 쓴다 — 서버 래퍼로 분리

## 문제
로그인/가입 페이지에 탭 타이틀("로그인 | ShutterMap")을 넣으려고 `export const metadata`를 폼 로직이 들어있는 파일 맨 위에 추가했는데, 그 파일은 `useState`/`useEffect`를 쓰느라 이미 `'use client'`였다. 빌드가 깨졌다(Next.js가 금지).

## 원인
Next.js App Router에서 `metadata` export는 서버에서만 평가된다. `'use client'`가 붙은 파일은 클라이언트 컴포넌트이므로 그 규칙상 `metadata`를 같은 파일에서 export할 수 없다 — 인터랙티브 로직과 메타데이터는 같은 파일에 공존할 수 없는 조합이다.

## 해결책
페이지를 두 파일로 쪼갰다:
- `page.tsx` — `'use client'` 없는 얇은 서버 컴포넌트. `metadata` export만 담당하고, 클라이언트 컴포넌트를 import해서 렌더만 한다.
- `login-form.tsx`/`register-form.tsx` — `'use client'`가 붙은, 기존의 모든 인터랙티브 로직(상태, 이벤트 핸들러, ref)을 담당.

```tsx
// page.tsx
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: '로그인' };

export default function LoginPage() {
  return <LoginForm />;
}
```

루트 레이아웃의 `metadata.title`을 `{ default: 'ShutterMap', template: '%s | ShutterMap' }`로 설정해둬서, 각 페이지의 `title: '로그인'`이 자동으로 "로그인 | ShutterMap"이 된다.

## 다음 작업 전 체크할 것
- [ ] **페이지에 `metadata`(타이틀, description 등)를 넣어야 하는데 그 페이지가 이미 `'use client'`(상태/이펙트/이벤트 핸들러가 있음)라면, 처음부터 "서버 `page.tsx` + 클라이언트 `*-form.tsx`" 2파일 구조로 간다.** 하나의 파일에 둘 다 넣으려고 시도하다 빌드 에러로 알게 되는 걸 미리 피한다.
- [ ] 새 페이지에 탭 타이틀이 필요하면 루트 레이아웃의 `metadata.title.template`이 이미 설정돼 있는지 먼저 확인하고, 없으면 그것부터 설정한다 — 매 페이지에서 "| ShutterMap"을 직접 반복해 적지 않는다.
