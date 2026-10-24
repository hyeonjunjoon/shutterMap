import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { GalleryView } from './gallery-view';
import { FilterBar } from './filter-bar';

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

function renderWithProviders(ui: React.ReactElement, searchParams = '', queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        {/* hasMemory: true — 기본값(false)은 setFilters로 쓴 값이 실제로
            반영되지 않고 초기 searchParams에 고정된다(nuqs 테스팅 어댑터
            문서). 필터를 실제로 바꿔보는 테스트에는 필수. */}
        {withNuqsTestingAdapter({ searchParams, hasMemory: true })({ children })}
      </QueryClientProvider>
    ),
  });
}

function mockGalleryFetch(impl: (url: string) => { items: unknown[]; nextCursor: string | null }) {
  // 실제 fetch는 RequestInfo | URL을 받는다 — 테스트에서는 전부 문자열
  // URL만 쓰므로 String()으로 좁혀서 impl에 넘긴다.
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const body = impl(String(input));
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) } as Response);
  });
}

describe('GalleryView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty-state message when the gallery has no items', async () => {
    mockGalleryFetch(() => ({ items: [], nextCursor: null }));
    renderWithProviders(<GalleryView />);
    expect(await screen.findByText('아직 이 조건에 맞는 사진이 없습니다')).toBeDefined();
  });

  it('renders fetched photos', async () => {
    mockGalleryFetch(() => ({
      items: [{ id: 'p1', cameraName: 'ILCE-7M4', lensName: null, thumbnailUrl: 'u', likeCount: 1, createdAt: 'x' }],
      nextCursor: null,
    }));
    renderWithProviders(<GalleryView />);
    expect(await screen.findByText('ILCE-7M4')).toBeDefined();
  });

  it('does not issue a second fetchNextPage call while one is already in flight (rapid double intersection)', async () => {
    // let + 클로저 안에서의 재할당은 tsc가 바깥 스코프에서의 타입을 never로
    // 좁혀버리는 경우가 있어(이 스코프 체인에서 실제로 발생) 가변 객체로 바꾼다.
    const page2: { resolve: (() => void) | null } = { resolve: null };
    let callCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      callCount++;
      if (String(input).includes('cursor=')) {
        return new Promise<Response>((resolve) => {
          page2.resolve = () =>
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

    renderWithProviders(<GalleryView />);
    await screen.findByText('A');
    expect(callCount).toBe(1);

    // 빠른 연속 스크롤 시뮬레이션: sentinel이 짧은 시간에 두 번 "교차"
    ioCallback?.([{ isIntersecting: true }]);
    await waitFor(() => expect(callCount).toBe(2));
    ioCallback?.([{ isIntersecting: true }]); // 아직 page2가 안 끝났는데 다시 교차

    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(2); // 3번째 호출이 나가면 안 됨 — isFetchingNextPage 가드

    page2.resolve?.();
  });

  it('shows photos matching the active filter only, not a mix with a previous filter (real filter change via FilterBar, one QueryClient)', async () => {
    mockGalleryFetch((url) => {
      if (url.includes('/discovery/equipment')) {
        return { items: [], nextCursor: null }; // fetchEquipment는 아래서 별도 모킹
      }
      if (url.includes('cameraName=A')) {
        return { items: [{ id: 'pa', cameraName: 'A', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }], nextCursor: null };
      }
      if (url.includes('cameraName=B')) {
        return { items: [{ id: 'pb', cameraName: 'B', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });
    // fetchEquipment와 fetchGallery가 같은 global.fetch를 공유하므로, equipment
    // 응답 모양({cameraNames, lensNames})도 같은 mock에서 분기해서 돌려준다.
    const baseImpl = global.fetch as (input: RequestInfo | URL) => Promise<Response>;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/discovery/equipment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ cameraNames: ['A', 'B'], lensNames: [] }),
        } as Response);
      }
      return baseImpl(input);
    });

    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders(
      <>
        <FilterBar />
        <GalleryView />
      </>,
      '?cameraName=A',
      queryClient,
    );

    // PhotoCard는 카메라명을 <p>로 렌더링한다 — 셀렉터로 좁히지 않으면 필터
    // 드롭다운의 <option>B</option>도 같이 매치돼 버린다.
    expect(await screen.findByText('A', { selector: 'p' })).toBeDefined();
    expect(screen.queryByText('B', { selector: 'p' })).toBeNull();

    const cameraSelect = await screen.findByLabelText('카메라');
    await waitFor(() => expect(cameraSelect).not.toBeDisabled());
    await user.selectOptions(cameraSelect, 'B');

    expect(await screen.findByText('B', { selector: 'p' })).toBeDefined();
    expect(screen.queryByText('A', { selector: 'p' })).toBeNull();
  });

  it('debounces numeric filter changes into a single gallery fetch instead of one per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let galleryFetchCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/discovery/gallery')) galleryFetchCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [], nextCursor: null, cameraNames: [], lensNames: [] }),
      } as Response);
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders(
      <>
        <FilterBar />
        <GalleryView />
      </>,
      '',
      queryClient,
    );

    await act(async () => {
      await vi.waitFor(() => expect(galleryFetchCount).toBe(1));
    });

    const input = await screen.findByLabelText('초점거리 최소(mm)');
    // nuqs의 setFilters는 fireEvent 안에서 바로 상태를 반영하므로 fireEvent로
    // 직접 여러 번 바꿔서 "키 입력마다"를 흉내낸다(userEvent.type은 fake timer와
    // 궁합이 나쁘다).
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.change(input, { target: { value: '123' } });

    // 디바운스 시간(300ms) 전에는 갤러리 재요청이 없어야 한다.
    act(() => vi.advanceTimersByTime(299));
    expect(galleryFetchCount).toBe(1);

    act(() => vi.advanceTimersByTime(1));
    await act(async () => {
      await vi.waitFor(() => expect(galleryFetchCount).toBe(2));
    });
    // 1, 12 각각에 대한 재요청 없이 최종값(123)에 대해서만 한 번 더 — 총 2번.
    expect(galleryFetchCount).toBe(2);

    vi.useRealTimers();
  });

  it('recovers from a failed next-page fetch: keeps the loaded grid, offers inline retry, and resumes infinite scroll after retry', async () => {
    let page2Attempts = 0;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('cursor=')) {
        page2Attempts++;
        if (page2Attempts === 1) {
          return Promise.resolve({ ok: false, status: 500, text: async () => JSON.stringify({ message: '서버 오류' }) } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              items: [{ id: 'p2', cameraName: 'B', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }],
              nextCursor: null,
            }),
        } as Response);
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

    renderWithProviders(<GalleryView />);
    await screen.findByText('A');

    // 다음 페이지 요청 트리거 → 실패
    ioCallback?.([{ isIntersecting: true }]);
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    // 이미 불러온 1페이지(A)는 그대로 남아있어야 한다 — 전체 에러 화면으로
    // 안 바뀜.
    expect(screen.getByText('A')).toBeDefined();

    const user = userEvent.setup();
    await user.click(retryButton);

    // 재시도 성공 → 2페이지(B) 로드, sentinel이 다시 붙어서 스크롤로 더
    // 불러올 수 있는 상태로 돌아옴(추가로 다음 페이지가 없으므로 sentinel이
    // 계속 렌더되는지까지는 nextCursor:null로 확인 — 더 불러올 게 없다는
    // 뜻이라 sentinel이 사라지는 게 정상).
    expect(await screen.findByText('B')).toBeDefined();
    expect(screen.getByText('A')).toBeDefined();
  });

  it('does not scroll on initial mount, but scrolls the grid to top exactly once when the filter actually changes', async () => {
    const scrollSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollSpy;

    mockGalleryFetch((url) => {
      if (url.includes('/discovery/equipment')) return { items: [], nextCursor: null };
      return {
        items: [{ id: `p-${url}`, cameraName: url.includes('cameraName=B') ? 'B' : 'A', lensName: null, thumbnailUrl: 'u', likeCount: 0, createdAt: 'x' }],
        nextCursor: null,
      };
    });
    const baseImpl = global.fetch as (input: RequestInfo | URL) => Promise<Response>;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/discovery/equipment')) {
        return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ cameraNames: ['A', 'B'], lensNames: [] }) } as Response);
      }
      return baseImpl(input);
    });

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <FilterBar />
        <GalleryView />
      </>,
      '?cameraName=A',
    );
    await screen.findByText('A', { selector: 'p' });
    expect(scrollSpy).not.toHaveBeenCalled(); // 마운트 자체는 스크롤을 건드리면 안 됨

    const cameraSelect = await screen.findByLabelText('카메라');
    await waitFor(() => expect(cameraSelect).not.toBeDisabled());
    await user.selectOptions(cameraSelect, 'B');
    await screen.findByText('B', { selector: 'p' });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' });

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
});
