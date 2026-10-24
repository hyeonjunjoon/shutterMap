# 탐색 화면 — 갤러리 뷰 + 사진 상세 placeholder + 전역 에러 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` 라우트에 탐색 화면(지도/갤러리 탭, 지도는 placeholder)과 그 안의 갤러리 뷰(필터+정렬+무한스크롤)를 띄우고, `/photos/[id]`에 읽기 전용 사진 상세 placeholder를, 앱 전역에 `error.tsx`/`not-found.tsx`를 추가한다.

**Architecture:** 필터/탭 상태는 nuqs로 URL search params에 저장한다(플랜 B의 지도 뷰도 같은 파서를 재사용). 갤러리는 TanStack Query `useInfiniteQuery` + 네이티브 `IntersectionObserver`로 무한스크롤한다. 사진 상세는 좋아요/신고/소유자 기능 없이 서버 컴포넌트가 직접 `apiClient`로 1회 fetch해서 렌더링하는 placeholder다(다음 사이클에서 클라이언트 컴포넌트로 승격).

**Tech Stack:** Next.js 16.4.0 (App Router) · React 19.3.0 · TypeScript · Tailwind CSS v4 · shadcn/ui(`base-nova`, `@base-ui/react`) · TanStack Query v5.104.2 · nuqs ^2.10.2(신규) · Vitest + React Testing Library

**Spec:** [`docs/superpowers/specs/2026-10-12-frontend-design.md`](../specs/2026-10-12-frontend-design.md) §6, §7.1(갤러리 뷰+상세 placeholder 기술), §7.2 상단 placeholder 범위 노트, §8(전역 에러 UI) · [`docs/PRD.md`](../../PRD.md) 기능4/8 · [`docs/api.md`](../../api.md) `/discovery/gallery`, `/discovery/equipment`, `/photos/:id`

## Global Constraints

- nuqs는 `^2.10.2`로 설치한다(`npm view nuqs dist-tags` 확인됨, peerDependencies `next >=14.2.0` / `react ^19.0.0-0` — 현재 스택과 호환).
- TanStack Query 키에 `cursor`/페이지 파라미터를 절대 넣지 않는다 — `useInfiniteQuery`는 키를 하나로 고정하고 cursor를 `pageParam`으로만 받는다(`web/lib/query-keys.ts` 기존 주석 규칙).
- 쿼리 키는 **정규화된(기본값과 같은 필드는 제외) 필터 객체**를 쓴다.
- URL 갱신 디바운스(`limitUrlUpdates`, 300ms)는 **숫자 입력(초점거리/조리개)에만** 건다 — 카메라/렌즈/정렬은 드롭다운 단건 선택이라 즉시 반영.
- 지역(bbox)/촬영월 필터는 갤러리에 없다(지도 전용, 플랜 B 범위) — 이번 플랜의 공유 필터는 카메라/렌즈/초점거리/조리개/정렬뿐이다.
- UI 카피는 한국어, 기존 패턴대로 에러는 토스트가 아니라 인라인 `role="alert"` + 재시도 버튼(이 레포에 토스트 라이브러리가 없고, 로그인/가입 화면도 인라인 alert를 쓴다 — 새 의존성을 추가하지 않는다).
- 터치 타겟은 44px(h-11) + `touch-manipulation` — 기존 `Input`/`Button` 컴포넌트와 동일한 기준을 새 폼 요소(select 등)에도 맞춘다.
- 전역 에러 UI는 `app/error.tsx`/`app/not-found.tsx` 1개씩만 두고, 화면별 전용 에러 UI를 만들지 않는다.
- 각 태스크는 `npm test`(`web/`에서)가 통과해야 완료되고, 마지막 태스크에서 `npm run typecheck`와 `npm run build`까지 돌려 확인한다.

## Review Focus

- **잘못된/범위를 벗어난 URL 쿼리 파라미터** — 사용자가 URL을 직접 편집해 `minFocalLength=abc`나 `minFocalLength=100&maxFocalLength=50`(min≥max) 같은 값을 넣어도 앱이 깨지지 않고 "필터 없음"으로 조용히 폴백해야 한다. (Task 1)
- **장비 목록(`/discovery/equipment`)이 아직 로딩 중일 때 필터 드롭다운 조작** — 로딩 중 사용자가 드롭다운을 클릭하면 빈 목록이 아니라 비활성화된 상태여야 한다(스펙 §7.1 "필터 드롭다운은 equipment 로딩 중엔 비활성화"). (Task 5)
- **조건에 맞는 사진이 0개** — 빈 배열이 왔을 때 빈 그리드가 아니라 "아직 이 조건에 맞는 사진이 없습니다" 안내가 보여야 한다(PRD 기능4/8 수용기준). (Task 7)
- **빠른 연속 스크롤로 sentinel이 짧은 시간에 여러 번 교차** — 이미 다음 페이지를 가져오는 중인데 또 `fetchNextPage`가 불려서 중복 요청이 나가면 안 된다. (Task 7)
- **필터를 바꿨을 때 이전 필터의 캐시된 페이지가 새 필터 목록에 섞여 보이는 것** — 카메라 필터를 A→B로 바꾸면 A 조건의 사진이 화면에 남아있으면 안 되고, 정확히 B 조건의 사진만 보여야 한다(쿼리 키가 필터 전체를 반영하지 않으면 이 버그가 생긴다). (Task 7)

---

### Task 1: nuqs 설치 + URL 필터 상태 (`discovery-params.ts`)

**Files:**
- Modify: `web/package.json` (nuqs 추가)
- Modify: `web/app/providers.tsx` (NuqsAdapter 추가)
- Create: `web/lib/discovery-params.ts`
- Test: `web/lib/discovery-params.test.ts`

**Interfaces:**
- Produces: `discoveryFilterParsers`(nuqs 파서 맵), `viewParser`, `SORT_OPTIONS: readonly ['latest','likes']`, `VIEW_OPTIONS: readonly ['gallery','map']`, `type GallerySort = 'latest'|'likes'`, `type DiscoveryView = 'gallery'|'map'`, `interface NormalizedDiscoveryFilters { cameraName?: string; lensName?: string; minFocalLength?: number; maxFocalLength?: number; minAperture?: number; maxAperture?: number; sort: GallerySort }`, `normalizeDiscoveryFilters(raw): NormalizedDiscoveryFilters` — 전부 `web/lib/discovery-params.ts`에서.

- [ ] **Step 1: nuqs 설치**

Run: `cd web && npm view nuqs dist-tags && npm install nuqs@^2.10.2`
Expected: `dist-tags`에 `latest: 2.10.2`(또는 그 이상) 출력, 설치 성공, `package.json`의 `dependencies`에 `"nuqs": "^2.10.2"` 추가됨.

- [ ] **Step 2: Providers에 NuqsAdapter 추가**

`web/app/providers.tsx`를 다음으로 교체:

```tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
```

- [ ] **Step 3: 실패하는 테스트 작성 (`web/lib/discovery-params.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import {
  discoveryFilterParsers,
  viewParser,
  normalizeDiscoveryFilters,
} from './discovery-params';

describe('discoveryFilterParsers', () => {
  it('parses a valid integer', () => {
    expect(discoveryFilterParsers.minFocalLength.parse('70')).toBe(70);
  });

  it('returns null (= treated as absent) for a non-numeric value', () => {
    expect(discoveryFilterParsers.minFocalLength.parse('abc')).toBeNull();
  });

  it('returns null (= falls back to default) for an out-of-enum sort value', () => {
    expect(discoveryFilterParsers.sort.parse('weird')).toBeNull();
  });

  it('view parser falls back on an unknown value', () => {
    expect(viewParser.parse('satellite')).toBeNull();
  });
});

describe('normalizeDiscoveryFilters', () => {
  const base = {
    cameraName: null,
    lensName: null,
    minFocalLength: null,
    maxFocalLength: null,
    minAperture: null,
    maxAperture: null,
    sort: 'latest' as const,
  };

  it('keeps a valid focal length range', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 24, maxFocalLength: 70 });
    expect(result.minFocalLength).toBe(24);
    expect(result.maxFocalLength).toBe(70);
  });

  it('drops both bounds when min >= max (invalid range)', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 100, maxFocalLength: 50 });
    expect(result.minFocalLength).toBeUndefined();
    expect(result.maxFocalLength).toBeUndefined();
  });

  it('keeps a one-sided range (min only)', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 70 });
    expect(result.minFocalLength).toBe(70);
    expect(result.maxFocalLength).toBeUndefined();
  });

  it('drops an invalid aperture range the same way', () => {
    const result = normalizeDiscoveryFilters({ ...base, minAperture: 8, maxAperture: 1.8 });
    expect(result.minAperture).toBeUndefined();
    expect(result.maxAperture).toBeUndefined();
  });

  it('omits empty-string camera/lens names', () => {
    const result = normalizeDiscoveryFilters({ ...base, cameraName: '' });
    expect(result.cameraName).toBeUndefined();
  });

  it('passes through a non-empty camera name and sort', () => {
    const result = normalizeDiscoveryFilters({ ...base, cameraName: 'ILCE-7M4', sort: 'likes' });
    expect(result.cameraName).toBe('ILCE-7M4');
    expect(result.sort).toBe('likes');
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd web && npx vitest run lib/discovery-params.test.ts`
Expected: FAIL — `Cannot find module './discovery-params'` (파일이 아직 없음)

- [ ] **Step 5: `web/lib/discovery-params.ts` 구현**

```ts
import { parseAsString, parseAsInteger, parseAsFloat, parseAsStringEnum } from 'nuqs/server';
import { debounce } from 'nuqs';

export const SORT_OPTIONS = ['latest', 'likes'] as const;
export type GallerySort = (typeof SORT_OPTIONS)[number];

export const VIEW_OPTIONS = ['gallery', 'map'] as const;
export type DiscoveryView = (typeof VIEW_OPTIONS)[number];

// 갤러리/지도 공유 필터. month(촬영월)는 지도 전용이라 여기 없음 — 플랜 B에서
// 지도 전용 파서에 추가한다. 숫자 입력(초점거리/조리개)만 300ms 디바운스를
// 건다 — 카메라/렌즈/정렬은 드롭다운 단건 선택이라 즉시 반영해야 자연스럽다.
export const discoveryFilterParsers = {
  cameraName: parseAsString,
  lensName: parseAsString,
  minFocalLength: parseAsInteger.withOptions({ limitUrlUpdates: debounce(300) }),
  maxFocalLength: parseAsInteger.withOptions({ limitUrlUpdates: debounce(300) }),
  minAperture: parseAsFloat.withOptions({ limitUrlUpdates: debounce(300) }),
  maxAperture: parseAsFloat.withOptions({ limitUrlUpdates: debounce(300) }),
  sort: parseAsStringEnum<GallerySort>([...SORT_OPTIONS]).withDefault('latest'),
};

// 탭 전환은 history: 'push'(뒤로가기로 이전 탭에 돌아갈 수 있어야 함) — 필터는
// nuqs 기본값인 'replace'를 그대로 쓴다(필터 한 번 바꿀 때마다 히스토리가
// 쌓이면 뒤로가기가 쓸모없어진다).
export const viewParser = parseAsStringEnum<DiscoveryView>([...VIEW_OPTIONS])
  .withDefault('gallery')
  .withOptions({ history: 'push' });

export interface NormalizedDiscoveryFilters {
  cameraName?: string;
  lensName?: string;
  minFocalLength?: number;
  maxFocalLength?: number;
  minAperture?: number;
  maxAperture?: number;
  sort: GallerySort;
}

interface RawDiscoveryFilters {
  cameraName: string | null;
  lensName: string | null;
  minFocalLength: number | null;
  maxFocalLength: number | null;
  minAperture: number | null;
  maxAperture: number | null;
  sort: GallerySort;
}

// "둘 다 있는데 min >= max"일 때만 둘 다 기본값(= 필터 없음)으로 되돌린다 —
// 한쪽만 있는 경우(예: "70mm 이상"만 지정)는 유효한 단방향 범위라 그대로 둔다.
function normalizeRange(min: number | null, max: number | null): { min?: number; max?: number } {
  if (min != null && max != null && min >= max) return {};
  const result: { min?: number; max?: number } = {};
  if (min != null) result.min = min;
  if (max != null) result.max = max;
  return result;
}

export function normalizeDiscoveryFilters(raw: RawDiscoveryFilters): NormalizedDiscoveryFilters {
  const focal = normalizeRange(raw.minFocalLength, raw.maxFocalLength);
  const aperture = normalizeRange(raw.minAperture, raw.maxAperture);
  const result: NormalizedDiscoveryFilters = { sort: raw.sort };
  if (raw.cameraName) result.cameraName = raw.cameraName;
  if (raw.lensName) result.lensName = raw.lensName;
  if (focal.min !== undefined) result.minFocalLength = focal.min;
  if (focal.max !== undefined) result.maxFocalLength = focal.max;
  if (aperture.min !== undefined) result.minAperture = aperture.min;
  if (aperture.max !== undefined) result.maxAperture = aperture.max;
  return result;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd web && npx vitest run lib/discovery-params.test.ts`
Expected: PASS, 전부 초록

- [ ] **Step 7: 커밋**

```bash
cd web && git add package.json package-lock.json app/providers.tsx lib/discovery-params.ts lib/discovery-params.test.ts
git commit -m "feat(web): nuqs 도입, 탐색 화면 URL 필터 파싱/검증 추가"
```

---

### Task 2: 쿼리 키 확장 (`query-keys.ts`)

**Files:**
- Modify: `web/lib/query-keys.ts`
- Test: `web/lib/query-keys.test.ts` (신규)

**Interfaces:**
- Consumes: `NormalizedDiscoveryFilters` (Task 1, `web/lib/discovery-params.ts`)
- Produces: `queryKeys.discovery.gallery(filters: NormalizedDiscoveryFilters)`, `queryKeys.discovery.equipment`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// web/lib/query-keys.test.ts
import { describe, it, expect } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys.discovery', () => {
  it('builds a gallery key that includes the filters object', () => {
    const key = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'ILCE-7M4' });
    expect(key).toEqual(['discovery', 'gallery', { sort: 'latest', cameraName: 'ILCE-7M4' }]);
  });

  it('builds distinct keys for different filters (no accidental cache collision)', () => {
    const a = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'A' });
    const b = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'B' });
    expect(a).not.toEqual(b);
  });

  it('exposes a fixed equipment key', () => {
    expect(queryKeys.discovery.equipment).toEqual(['discovery', 'equipment']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run lib/query-keys.test.ts`
Expected: FAIL — `queryKeys.discovery` is undefined

- [ ] **Step 3: `web/lib/query-keys.ts` 수정**

```ts
import type { NormalizedDiscoveryFilters } from './discovery-params';

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
  discovery: {
    gallery: (filters: NormalizedDiscoveryFilters) => ['discovery', 'gallery', filters] as const,
    equipment: ['discovery', 'equipment'] as const,
  },
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run lib/query-keys.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd web && git add lib/query-keys.ts lib/query-keys.test.ts
git commit -m "feat(web): 탐색 화면용 쿼리 키 추가"
```

---

### Task 3: discovery API 클라이언트 (`discovery-api.ts`)

**Files:**
- Create: `web/lib/discovery-api.ts`
- Test: `web/lib/discovery-api.test.ts`

**Interfaces:**
- Consumes: `apiClient`, `ApiError` (`web/lib/api-client.ts`, 기존), `NormalizedDiscoveryFilters` (Task 1)
- Produces: `interface GalleryPhoto { id: string; cameraName: string | null; lensName: string | null; thumbnailUrl: string; likeCount: number; createdAt: string }`, `interface GalleryPage { items: GalleryPhoto[]; nextCursor: string | null }`, `interface EquipmentOptions { cameraNames: string[]; lensNames: string[] }`, `fetchGallery(filters: NormalizedDiscoveryFilters, cursor: string | null): Promise<GalleryPage>`, `fetchEquipment(): Promise<EquipmentOptions>` — 전부 `web/lib/discovery-api.ts`에서.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// web/lib/discovery-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGallery, fetchEquipment } from './discovery-api';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('fetchGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests /discovery/gallery with sort and omits unset filters', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery({ sort: 'latest' }, null);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/discovery/gallery?sort=latest');
    expect(url).not.toContain('cursor=');
    expect(url).not.toContain('cameraName=');
  });

  it('includes cursor only when it is not null', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery({ sort: 'latest' }, 'abc-cursor');
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('cursor=abc-cursor');
  });

  it('includes all set filter fields', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery(
      { sort: 'likes', cameraName: 'ILCE-7M4', minFocalLength: 24, maxFocalLength: 70 },
      null,
    );
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('sort=likes');
    expect(url).toContain('cameraName=ILCE-7M4');
    expect(url).toContain('minFocalLength=24');
    expect(url).toContain('maxFocalLength=70');
  });

  it('returns the parsed page', async () => {
    const page = { items: [{ id: 'p1', cameraName: 'A', lensName: null, thumbnailUrl: 'u', likeCount: 2, createdAt: '2026-01-01' }], nextCursor: 'c2' };
    mockFetchOnce(200, page);
    const result = await fetchGallery({ sort: 'latest' }, null);
    expect(result).toEqual(page);
  });
});

describe('fetchEquipment', () => {
  it('requests /discovery/equipment and returns the parsed body', async () => {
    mockFetchOnce(200, { cameraNames: ['ILCE-7M4'], lensNames: [] });
    const result = await fetchEquipment();
    expect(result).toEqual({ cameraNames: ['ILCE-7M4'], lensNames: [] });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/discovery/equipment');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run lib/discovery-api.test.ts`
Expected: FAIL — `Cannot find module './discovery-api'`

- [ ] **Step 3: `web/lib/discovery-api.ts` 구현**

```ts
import { apiClient } from './api-client';
import type { NormalizedDiscoveryFilters } from './discovery-params';

export interface GalleryPhoto {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  thumbnailUrl: string;
  likeCount: number;
  createdAt: string;
}

export interface GalleryPage {
  items: GalleryPhoto[];
  nextCursor: string | null;
}

export interface EquipmentOptions {
  cameraNames: string[];
  lensNames: string[];
}

export async function fetchGallery(
  filters: NormalizedDiscoveryFilters,
  cursor: string | null,
): Promise<GalleryPage> {
  const params = new URLSearchParams();
  params.set('sort', filters.sort);
  if (filters.cameraName) params.set('cameraName', filters.cameraName);
  if (filters.lensName) params.set('lensName', filters.lensName);
  if (filters.minFocalLength !== undefined) params.set('minFocalLength', String(filters.minFocalLength));
  if (filters.maxFocalLength !== undefined) params.set('maxFocalLength', String(filters.maxFocalLength));
  if (filters.minAperture !== undefined) params.set('minAperture', String(filters.minAperture));
  if (filters.maxAperture !== undefined) params.set('maxAperture', String(filters.maxAperture));
  // cursor가 null이면 파라미터 자체를 넣지 않는다 — "cursor=null" 같은 값을
  // 보내면 백엔드가 그걸 유효하지 않은 cursor로 취급할 수 있다.
  if (cursor) params.set('cursor', cursor);
  return apiClient<GalleryPage>(`/discovery/gallery?${params.toString()}`);
}

export async function fetchEquipment(): Promise<EquipmentOptions> {
  return apiClient<EquipmentOptions>('/discovery/equipment');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run lib/discovery-api.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd web && git add lib/discovery-api.ts lib/discovery-api.test.ts
git commit -m "feat(web): /discovery/gallery, /discovery/equipment 클라이언트 추가"
```

---

### Task 4: `useEquipment` 훅

**Files:**
- Create: `web/hooks/use-equipment.ts`
- Test: `web/hooks/use-equipment.test.tsx`

**Interfaces:**
- Consumes: `fetchEquipment`, `EquipmentOptions` (Task 3), `queryKeys.discovery.equipment` (Task 2)
- Produces: `useEquipment(): UseQueryResult<EquipmentOptions>` from `web/hooks/use-equipment.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/hooks/use-equipment.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEquipment } from './use-equipment';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useEquipment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is loading initially, then resolves with the equipment list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: ['ILCE-7M4'], lensNames: ['FE 24-70mm F2.8 GM'] }),
    } as Response);

    const { result } = renderHook(() => useEquipment(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ cameraNames: ['ILCE-7M4'], lensNames: ['FE 24-70mm F2.8 GM'] });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run hooks/use-equipment.test.tsx`
Expected: FAIL — `Cannot find module './use-equipment'`

- [ ] **Step 3: `web/hooks/use-equipment.ts` 구현**

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchEquipment, type EquipmentOptions } from '@/lib/discovery-api';
import { queryKeys } from '@/lib/query-keys';

export function useEquipment() {
  return useQuery<EquipmentOptions>({
    queryKey: queryKeys.discovery.equipment,
    queryFn: fetchEquipment,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run hooks/use-equipment.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd web && git add hooks/use-equipment.ts hooks/use-equipment.test.tsx
git commit -m "feat(web): useEquipment 훅 추가"
```

---

### Task 5: 필터 바 (`filter-bar.tsx`) + 모바일 바텀시트(Drawer)

**Files:**
- Create: `web/components/ui/drawer.tsx` (via `npx shadcn add drawer`)
- Create: `web/app/filter-bar.tsx`
- Test: `web/app/filter-bar.test.tsx`

**Interfaces:**
- Consumes: `discoveryFilterParsers`, `SORT_OPTIONS`, `GallerySort` (Task 1), `useEquipment` (Task 4), `Button` (`web/components/ui/button.tsx`, 기존), `Input`, `Label` (기존)
- Produces: `FilterBar` component from `web/app/filter-bar.tsx`

- [ ] **Step 1: shadcn Drawer 설치**

Run: `cd web && npx shadcn add drawer`
Expected: `web/components/ui/drawer.tsx`가 생성되고(`Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerTitle` 등 export), `package.json`에 `vaul` 의존성이 추가됨. 생성된 파일을 열어 export된 컴포넌트 이름을 확인한다(버전에 따라 이름이 다를 수 있음 — 아래 Step에서 실제 이름으로 맞춘다).

- [ ] **Step 2: 실패하는 테스트 작성**

```tsx
// web/app/filter-bar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { FilterBar } from './filter-bar';

function renderWithProviders(searchParams = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<FilterBar />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams })({ children })}
      </QueryClientProvider>
    ),
  });
}

describe('FilterBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the camera/lens dropdowns while equipment is loading', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // 영원히 안 끝나는 fetch = 로딩 중 고정
    renderWithProviders();
    expect(screen.getByLabelText('카메라')).toBeDisabled();
    expect(screen.getByLabelText('렌즈')).toBeDisabled();
  });

  it('enables the dropdowns once equipment resolves, with the fetched options', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: ['ILCE-7M4'], lensNames: ['FE 24-70mm F2.8 GM'] }),
    } as Response);
    renderWithProviders();

    const cameraSelect = await screen.findByLabelText('카메라');
    expect(cameraSelect).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'ILCE-7M4' })).toBeDefined();
  });

  it('updates the min focal length field from its URL default', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: [], lensNames: [] }),
    } as Response);
    renderWithProviders('?minFocalLength=24');
    const input = (await screen.findByLabelText('초점거리 최소(mm)')) as HTMLInputElement;
    expect(input.value).toBe('24');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd web && npx vitest run app/filter-bar.test.tsx`
Expected: FAIL — `Cannot find module './filter-bar'`

- [ ] **Step 4: `web/app/filter-bar.tsx` 구현**

```tsx
'use client';

import { useState } from 'react';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, type GallerySort } from '@/lib/discovery-params';
import { useEquipment } from '@/hooks/use-equipment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from '@/components/ui/drawer';

const selectClassName =
  'h-11 w-full touch-manipulation rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50';

function FilterFields() {
  const [filters, setFilters] = useQueryStates(discoveryFilterParsers);
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="filter-camera">카메라</Label>
        <select
          id="filter-camera"
          disabled={equipmentLoading}
          value={filters.cameraName ?? ''}
          onChange={(e) => setFilters({ cameraName: e.target.value || null })}
          className={selectClassName}
        >
          <option value="">전체</option>
          {equipment?.cameraNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-lens">렌즈</Label>
        <select
          id="filter-lens"
          disabled={equipmentLoading}
          value={filters.lensName ?? ''}
          onChange={(e) => setFilters({ lensName: e.target.value || null })}
          className={selectClassName}
        >
          <option value="">전체</option>
          {equipment?.lensNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-min-focal">초점거리 최소(mm)</Label>
          <Input
            id="filter-min-focal"
            type="number"
            value={filters.minFocalLength ?? ''}
            onChange={(e) => setFilters({ minFocalLength: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max-focal">초점거리 최대(mm)</Label>
          <Input
            id="filter-max-focal"
            type="number"
            value={filters.maxFocalLength ?? ''}
            onChange={(e) => setFilters({ maxFocalLength: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-min-aperture">조리개 최소(F)</Label>
          <Input
            id="filter-min-aperture"
            type="number"
            step="0.1"
            value={filters.minAperture ?? ''}
            onChange={(e) => setFilters({ minAperture: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max-aperture">조리개 최대(F)</Label>
          <Input
            id="filter-max-aperture"
            type="number"
            step="0.1"
            value={filters.maxAperture ?? ''}
            onChange={(e) => setFilters({ maxAperture: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-sort">정렬</Label>
        <select
          id="filter-sort"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as GallerySort })}
          className={selectClassName}
        >
          <option value="latest">최신순</option>
          <option value="likes">좋아요순</option>
        </select>
      </div>
    </div>
  );
}

export function FilterBar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* 데스크톱/태블릿: 인라인 필터 바 */}
      <div className="hidden md:block">
        <FilterFields />
      </div>
      {/* 모바일: "필터" 버튼 → 바텀시트(드래그로 닫기 지원은 Drawer 기본 동작) */}
      <div className="md:hidden">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline">필터</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>필터</DrawerTitle>
            <div className="px-4 pb-4">
              <FilterFields />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
```

**주의:** Step 1에서 생성된 `drawer.tsx`가 `DrawerTrigger`에 `asChild` prop을 지원하지 않는 경우(Base UI 기반 컴포넌트는 Radix의 `asChild` 대신 `render` prop을 쓸 수 있음), 생성된 파일을 직접 열어 실제 API에 맞게 위 코드의 `DrawerTrigger` 사용부만 수정한다 — 나머지 구조는 그대로 둔다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && npx vitest run app/filter-bar.test.tsx`
Expected: PASS (설치된 Drawer의 실제 API에 맞춰 Step 4를 조정했다면 그 상태로 통과)

- [ ] **Step 6: 커밋**

```bash
cd web && git add components.json package.json package-lock.json components/ui/drawer.tsx app/filter-bar.tsx app/filter-bar.test.tsx
git commit -m "feat(web): 탐색 필터 바 + 모바일 바텀시트(Drawer) 추가"
```

---

### Task 6: 썸네일 카드 (`photo-card.tsx`)

**Files:**
- Create: `web/app/photo-card.tsx`
- Test: `web/app/photo-card.test.tsx`

**Interfaces:**
- Consumes: `GalleryPhoto` (Task 3)
- Produces: `PhotoCard({ photo: GalleryPhoto })`, `PhotoCardSkeleton()` from `web/app/photo-card.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/app/photo-card.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoCard, PhotoCardSkeleton } from './photo-card';
import type { GalleryPhoto } from '@/lib/discovery-api';

const photo: GalleryPhoto = {
  id: 'p1',
  cameraName: 'ILCE-7M4',
  lensName: 'FE 24-70mm F2.8 GM',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  likeCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PhotoCard', () => {
  it('links to the photo detail page', () => {
    render(<PhotoCard photo={photo} />);
    expect(screen.getByRole('link')).toHaveProperty('href', expect.stringContaining('/photos/p1'));
  });

  it('shows camera name, lens name, and like count', () => {
    render(<PhotoCard photo={photo} />);
    expect(screen.getByText('ILCE-7M4')).toBeDefined();
    expect(screen.getByText('FE 24-70mm F2.8 GM')).toBeDefined();
    expect(screen.getByText('좋아요 3')).toBeDefined();
  });

  it('falls back to a placeholder when cameraName is null', () => {
    render(<PhotoCard photo={{ ...photo, cameraName: null }} />);
    expect(screen.getByText('카메라 정보 없음')).toBeDefined();
  });
});

describe('PhotoCardSkeleton', () => {
  it('renders without crashing', () => {
    render(<PhotoCardSkeleton />);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run app/photo-card.test.tsx`
Expected: FAIL — `Cannot find module './photo-card'`

- [ ] **Step 3: `web/app/photo-card.tsx` 구현**

```tsx
import Link from 'next/link';
import type { GalleryPhoto } from '@/lib/discovery-api';

export function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  return (
    <Link
      href={`/photos/${photo.id}`}
      className="block touch-manipulation overflow-hidden rounded-[var(--radius-photo)] border border-border"
    >
      {/* width/height를 DB에 저장하지 않아 원본 비율을 모른다(TODOS.md 기록) —
          고정 4:3 컨테이너 + object-contain(크롭 없이 레터박스)으로 이 갭을
          피한다. 스켈레톤도 같은 비율이라 레이아웃 시프트가 생기지 않는다. */}
      <div className="aspect-[4/3] bg-muted">
        <img src={photo.thumbnailUrl} alt="" className="h-full w-full object-contain" />
      </div>
      <div className="space-y-0.5 p-2 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">{photo.cameraName ?? '카메라 정보 없음'}</p>
        {photo.lensName && <p className="truncate">{photo.lensName}</p>}
        <p>좋아요 {photo.likeCount}</p>
      </div>
    </Link>
  );
}

export function PhotoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-photo)] border border-border">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-1.5 p-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run app/photo-card.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd web && git add app/photo-card.tsx app/photo-card.test.tsx
git commit -m "feat(web): 갤러리 썸네일 카드 + 스켈레톤 추가"
```

---

### Task 7: 갤러리 뷰 (`gallery-view.tsx`) — 무한스크롤

**Files:**
- Create: `web/app/gallery-view.tsx`
- Test: `web/app/gallery-view.test.tsx`

**Interfaces:**
- Consumes: `discoveryFilterParsers`, `normalizeDiscoveryFilters` (Task 1), `queryKeys.discovery.gallery` (Task 2), `fetchGallery`, `GalleryPage` (Task 3), `PhotoCard`, `PhotoCardSkeleton` (Task 6), `Button` (기존)
- Produces: `GalleryView` component from `web/app/gallery-view.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/app/gallery-view.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { GalleryView } from './gallery-view';

// jsdom은 IntersectionObserver가 없다 — observe()를 호출하면 콜백을 캡처해두고
// 테스트에서 직접 그 콜백을 불러 "교차함"을 시뮬레이션한다.
let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
beforeEach(() => {
  ioCallback = null;
  class MockIntersectionObserver {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      ioCallback = cb;
    }
    observe() {}
    disconnect() {}
  }
  // @ts-expect-error jsdom 테스트 전용 스텁
  global.IntersectionObserver = MockIntersectionObserver;
});

function renderWithProviders(searchParams = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<GalleryView />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams })({ children })}
      </QueryClientProvider>
    ),
  });
}

function mockGalleryFetch(impl: (url: string) => { items: unknown[]; nextCursor: string | null }) {
  global.fetch = vi.fn((url: string) => {
    const body = impl(url);
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) } as Response);
  });
}

describe('GalleryView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty-state message when the gallery has no items', async () => {
    mockGalleryFetch(() => ({ items: [], nextCursor: null }));
    renderWithProviders();
    expect(await screen.findByText('아직 이 조건에 맞는 사진이 없습니다')).toBeDefined();
  });

  it('renders fetched photos', async () => {
    mockGalleryFetch(() => ({
      items: [{ id: 'p1', cameraName: 'ILCE-7M4', lensName: null, thumbnailUrl: 'u', likeCount: 1, createdAt: 'x' }],
      nextCursor: null,
    }));
    renderWithProviders();
    expect(await screen.findByText('ILCE-7M4')).toBeDefined();
  });

  it('does not issue a second fetchNextPage call while one is already in flight (rapid double intersection)', async () => {
    let page2Resolve: (() => void) | null = null;
    let callCount = 0;
    global.fetch = vi.fn((url: string) => {
      callCount++;
      if (String(url).includes('cursor=')) {
        return new Promise((resolve) => {
          page2Resolve = () =>
            resolve({ ok: true, status: 200, text: async () => JSON.stringify({ items: [], nextCursor: null }) } as Response);
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            items: [{ id: 'p1', cameraName: 'A', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }],
            nextCursor: 'c2',
          }),
      } as Response);
    });

    renderWithProviders();
    await screen.findByText('A');
    expect(callCount).toBe(1);

    // 빠른 연속 스크롤 시뮬레이션: sentinel이 짧은 시간에 두 번 "교차"
    ioCallback?.([{ isIntersecting: true }]);
    await waitFor(() => expect(callCount).toBe(2));
    ioCallback?.([{ isIntersecting: true }]); // 아직 page2가 안 끝났는데 다시 교차

    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(2); // 3번째 호출이 나가면 안 됨 — isFetchingNextPage 가드

    page2Resolve?.();
  });

  it('shows photos matching the active filter only, not a mix with a previous filter', async () => {
    mockGalleryFetch((url) => {
      if (url.includes('cameraName=A')) {
        return { items: [{ id: 'pa', cameraName: 'A', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }], nextCursor: null };
      }
      if (url.includes('cameraName=B')) {
        return { items: [{ id: 'pb', cameraName: 'B', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });

    const { rerender } = renderWithProviders('?cameraName=A');
    expect(await screen.findByText('A')).toBeDefined();
    expect(screen.queryByText('B')).toBeNull();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams: '?cameraName=B' })({ children: <GalleryView /> })}
      </QueryClientProvider>,
    );
    expect(await screen.findByText('B')).toBeDefined();
    expect(screen.queryByText('A')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run app/gallery-view.test.tsx`
Expected: FAIL — `Cannot find module './gallery-view'`

- [ ] **Step 3: `web/app/gallery-view.tsx` 구현**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, normalizeDiscoveryFilters } from '@/lib/discovery-params';
import { fetchGallery } from '@/lib/discovery-api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { PhotoCard, PhotoCardSkeleton } from './photo-card';

export function GalleryView() {
  const [rawFilters] = useQueryStates(discoveryFilterParsers);
  const filters = normalizeDiscoveryFilters(rawFilters);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.discovery.gallery(filters),
    queryFn: ({ pageParam }) => fetchGallery(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 정렬·필터가 바뀌면(= 쿼리 키가 바뀌면) 그리드 스크롤을 맨 위로.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    gridRef.current?.scrollIntoView({ block: 'start' });
  }, [filterKey]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          목록을 불러오지 못했습니다.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const photos = data?.pages.flatMap((page) => page.items) ?? [];

  if (photos.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">아직 이 조건에 맞는 사진이 없습니다</p>;
  }

  return (
    <div>
      <div ref={gridRef} className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} />
        ))}
      </div>
      <div ref={sentinelRef} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run app/gallery-view.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd web && git add app/gallery-view.tsx app/gallery-view.test.tsx
git commit -m "feat(web): 갤러리 무한스크롤 뷰 추가"
```

---

### Task 8: 탐색 화면 조립 (`discovery-view.tsx` + `app/page.tsx`)

**Files:**
- Create: `web/app/discovery-view.tsx`
- Modify: `web/app/page.tsx`
- Modify: `web/app/page.test.tsx`
- Test: `web/app/discovery-view.test.tsx`

**Interfaces:**
- Consumes: `viewParser`, `VIEW_OPTIONS` (Task 1), `FilterBar` (Task 5), `GalleryView` (Task 7)
- Produces: `DiscoveryView` component from `web/app/discovery-view.tsx`; `/` 라우트가 이를 렌더링

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/app/discovery-view.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { DiscoveryView } from './discovery-view';

function renderWithProviders(searchParams = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<DiscoveryView />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams })({ children })}
      </QueryClientProvider>
    ),
  });
}

describe('DiscoveryView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [], nextCursor: null, cameraNames: [], lensNames: [] }),
    } as Response);
  });

  it('shows the gallery tab by default', () => {
    renderWithProviders();
    expect(screen.getByRole('tab', { name: '갤러리', selected: true })).toBeDefined();
  });

  it('shows a map placeholder when the map tab is active via URL', () => {
    renderWithProviders('?view=map');
    expect(screen.getByText('지도 준비 중')).toBeDefined();
  });

  it('switches to the map placeholder when the 지도 tab is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders();
    await user.click(screen.getByRole('tab', { name: '지도' }));
    expect(await screen.findByText('지도 준비 중')).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run app/discovery-view.test.tsx`
Expected: FAIL — `Cannot find module './discovery-view'`

- [ ] **Step 3: `web/app/discovery-view.tsx` 구현**

```tsx
'use client';

import { useQueryState } from 'nuqs';
import { viewParser, VIEW_OPTIONS, type DiscoveryView as DiscoveryViewType } from '@/lib/discovery-params';
import { FilterBar } from './filter-bar';
import { GalleryView } from './gallery-view';

const TAB_LABEL: Record<DiscoveryViewType, string> = {
  gallery: '갤러리',
  map: '지도',
};

export function DiscoveryView() {
  const [view, setView] = useQueryState('view', viewParser);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div role="tablist" className="flex gap-2">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className="touch-manipulation rounded-lg px-3 py-2 text-sm font-medium aria-selected:bg-secondary aria-selected:text-secondary-foreground"
          >
            {TAB_LABEL[option]}
          </button>
        ))}
      </div>
      <FilterBar />
      {/* 지도 뷰는 플랜 B에서 구현한다 — 그때까지는 자리만 잡아둔다. */}
      {view === 'map' ? (
        <p className="py-8 text-center text-sm text-muted-foreground">지도 준비 중</p>
      ) : (
        <GalleryView />
      )}
    </div>
  );
}
```

- [ ] **Step 4: `web/app/page.tsx` 교체**

```tsx
import { Suspense } from 'react';
import { DiscoveryView } from './discovery-view';

export default function Home() {
  // DiscoveryView는 nuqs(내부적으로 useSearchParams)를 쓴다 — Next.js는 이걸
  // 쓰는 컴포넌트를 Suspense로 감싸도록 요구한다.
  return (
    <Suspense fallback={null}>
      <DiscoveryView />
    </Suspense>
  );
}
```

- [ ] **Step 5: `web/app/page.test.tsx` 교체**

기존 "ShutterMap" 제목 테스트는 더 이상 유효하지 않다(그 `<h1>`이 실제 화면으로 교체됨) — 탐색 화면이 기본으로 뜨는지로 바꾼다.

```tsx
// web/app/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Page from './page';

describe('Home page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [], nextCursor: null, cameraNames: [], lensNames: [] }),
    } as Response);
  });

  it('renders the discovery gallery tab by default', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('tab', { name: '갤러리' })).toBeDefined();
  });
});
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd web && npx vitest run app/discovery-view.test.tsx app/page.test.tsx`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
cd web && git add app/discovery-view.tsx app/discovery-view.test.tsx app/page.tsx app/page.test.tsx
git commit -m "feat(web): 탐색 화면(지도/갤러리 탭) 조립, '/' 라우트 교체"
```

---

### Task 9: 전역 에러 UI (`error.tsx`, `not-found.tsx`)

**Files:**
- Create: `web/app/error.tsx`
- Create: `web/app/not-found.tsx`
- Test: `web/app/error.test.tsx`
- Test: `web/app/not-found.test.tsx`

**Interfaces:**
- Consumes: `Button`, `buttonVariants` (`web/components/ui/button.tsx`, 기존)
- Produces: `app/error.tsx`의 기본 export(Next.js Error Boundary 규약: `{ error, reset }` props), `app/not-found.tsx`의 기본 export

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/app/error.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalError from './error';

describe('GlobalError', () => {
  it('shows a Korean error message and calls reset on click', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    expect(screen.getByText('문제가 생겼어요')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
```

```tsx
// web/app/not-found.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound', () => {
  it('shows a Korean not-found message and a link home', () => {
    render(<NotFound />);
    expect(screen.getByText('찾을 수 없습니다')).toBeDefined();
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveProperty('href', expect.stringContaining('/'));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run app/error.test.tsx app/not-found.test.tsx`
Expected: FAIL — 두 모듈 다 없음

- [ ] **Step 3: `web/app/error.tsx` 구현**

```tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="text-sm text-muted-foreground">페이지를 불러오는 중 오류가 발생했습니다.</p>
      <Button onClick={() => reset()}>다시 시도</Button>
    </main>
  );
}
```

- [ ] **Step 4: `web/app/not-found.tsx` 구현**

```tsx
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">요청하신 페이지가 존재하지 않거나 삭제됐습니다.</p>
      <Link href="/" className={buttonVariants({})}>
        홈으로
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && npx vitest run app/error.test.tsx app/not-found.test.tsx`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd web && git add app/error.tsx app/error.test.tsx app/not-found.tsx app/not-found.test.tsx
git commit -m "feat(web): 전역 error/not-found UI 추가"
```

---

### Task 10: 사진 상세 placeholder (`/photos/[id]`)

**Files:**
- Create: `web/app/photos/[id]/page.tsx`
- Create: `web/app/photos/[id]/photo-detail-card.tsx`
- Test: `web/app/photos/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `ApiError` (`web/lib/api-client.ts`, 기존)
- Produces: `app/photos/[id]/page.tsx`의 기본 export(async Server Component), `interface PhotoDetail`, `PhotoDetailCard({ photo: PhotoDetail })` from `web/app/photos/[id]/photo-detail-card.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// web/app/photos/[id]/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PhotoDetailPage from './page';

vi.mock('next/navigation', () => ({
  // 실제 notFound()는 던지고 return하지 않는다 — 테스트에서도 같은 동작을
  // 흉내내야 그 뒤 코드가 실행되지 않는 걸 검증할 수 있다.
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('PhotoDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the photo on success', async () => {
    mockFetchOnce(200, {
      id: 'p1',
      cameraName: 'ILCE-7M4',
      lensName: 'FE 24-70mm F2.8 GM',
      focalLength: 70,
      aperture: 1.8,
      shutterSpeed: '1/100',
      iso: 400,
      servingUrl: 'https://example.com/serving.jpg',
    });
    const jsx = await PhotoDetailPage({ params: Promise.resolve({ id: 'p1' }) });
    render(jsx);
    expect(screen.getByText('ILCE-7M4')).toBeDefined();
    expect(screen.getByText('F1.8')).toBeDefined();
  });

  it('calls notFound() on a 404 (and does not render)', async () => {
    mockFetchOnce(404, { statusCode: 404, message: '사진을 찾을 수 없습니다.', error: 'Not Found' });
    await expect(PhotoDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('rethrows on a non-404 error (caught by the global error boundary)', async () => {
    mockFetchOnce(500, { statusCode: 500, message: '서버 오류', error: 'Internal Server Error' });
    await expect(PhotoDetailPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow('서버 오류');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run "app/photos/[id]/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: `web/app/photos/[id]/photo-detail-card.tsx` 구현**

```tsx
export interface PhotoDetail {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  servingUrl: string;
}

export function PhotoDetailCard({ photo }: { photo: PhotoDetail }) {
  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* 치수를 모르므로(width/height 미저장, TODOS.md 기록) Next의 최적화
          <Image>(width/height 또는 fill 필요) 대신 원본 비율 그대로 렌더링하는
          일반 <img>를 쓴다. */}
      <img
        src={photo.servingUrl}
        alt=""
        style={{ width: '100%', height: 'auto' }}
        className="rounded-[var(--radius-photo)]"
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm tabular-nums">
        <dt className="text-muted-foreground">카메라</dt>
        <dd>{photo.cameraName ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">렌즈</dt>
        <dd>{photo.lensName ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">초점거리</dt>
        <dd>{photo.focalLength != null ? `${photo.focalLength}mm` : '정보 없음'}</dd>
        <dt className="text-muted-foreground">조리개</dt>
        <dd>{photo.aperture != null ? `F${photo.aperture}` : '정보 없음'}</dd>
        <dt className="text-muted-foreground">셔터스피드</dt>
        <dd>{photo.shutterSpeed ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">ISO</dt>
        <dd>{photo.iso ?? '정보 없음'}</dd>
      </dl>
    </main>
  );
}
```

- [ ] **Step 4: `web/app/photos/[id]/page.tsx` 구현**

```tsx
import { notFound } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { PhotoDetailCard, type PhotoDetail } from './photo-detail-card';

export default async function PhotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let photo: PhotoDetail;
  try {
    photo = await apiClient<PhotoDetail>(`/photos/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <PhotoDetailCard photo={photo} />;
}
```

**참고(TODOS.md에 이미 기록됨, 새로 추가하지 않음):** 서버 컴포넌트의 `apiClient` 호출은 쿠키를 안 실어서 `likedByMe`가 항상 `false`로 보인다 — 이 placeholder엔 좋아요 버튼이 없어 영향 없고, 다음 사이클(좋아요 버튼 추가)에서 클라이언트 컴포넌트로 승격하며 같이 고친다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && npx vitest run "app/photos/[id]/page.test.tsx"`
Expected: PASS

- [ ] **Step 6: 전체 검증 (typecheck + build)**

Run: `cd web && npm test && npm run typecheck && npm run build`
Expected: 전체 테스트 PASS, 타입 에러 없음, 빌드 성공. 실패하면 원인을 고치고(새 코드의 타입/빌드 에러만 — 범위 밖 기존 경고는 그대로 둠) 다시 실행.

- [ ] **Step 7: 커밋**

```bash
cd web && git add "app/photos/[id]/page.tsx" "app/photos/[id]/photo-detail-card.tsx" "app/photos/[id]/page.test.tsx"
git commit -m "feat(web): 사진 상세 placeholder(/photos/[id]) 추가"
```
