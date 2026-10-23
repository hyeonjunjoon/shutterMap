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
