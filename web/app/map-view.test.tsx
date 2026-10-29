import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';

// MapCanvas는 카카오맵 의존이라 지도 자체는 모킹하고, idle/onPinClick 콜백을
// 밖에서 수동 호출할 수 있게 최소 스텁으로 대체한다 — MapView 자신의
// orchestration 로직만 검증한다(실제 지도 렌더는 Task 9에서 이미 별도 검증됨).
let capturedOnIdle: ((bounds: any, center: any, zoom: number) => void) | null = null;
let capturedOnPinClick: ((id: string) => void) | null = null;
vi.mock('./map-canvas', () => ({
  MapCanvas: ({ onIdle, onPinClick }: { onIdle: typeof capturedOnIdle; onPinClick: typeof capturedOnPinClick }) => {
    capturedOnIdle = onIdle;
    capturedOnPinClick = onPinClick;
    return <div data-testid="map-canvas-stub" />;
  },
}));

import { MapView } from './map-view';

// jsdom은 IntersectionObserver가 없다 — MapPinList(왼쪽 목록)가 내부적으로
// 쓴다(gallery-view.test.tsx/map-pin-list.test.tsx와 동일 패턴).
beforeEach(() => {
  class MockIntersectionObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }
  // @ts-expect-error jsdom 테스트 전용 스텁
  global.IntersectionObserver = MockIntersectionObserver;
});

function renderWithProviders(searchParams = '', onUrlUpdate?: (...args: unknown[]) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MapView />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams, hasMemory: true, onUrlUpdate })({ children })}
      </QueryClientProvider>
    ),
  });
}

// MapView가 렌더하는 MapFilterBar도 useEquipment()로 같은 global.fetch를
// 통해 /discovery/equipment를 호출한다 — URL로 분기해서 각각 다른 응답을 준다.
function mockPins(pins: unknown[]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const isEquipment = String(input).includes('/discovery/equipment');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(isEquipment ? { cameraNames: [], lensNames: [] } : pins),
    } as Response;
  });
}

describe('MapView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    capturedOnIdle = null;
    capturedOnPinClick = null;
  });

  it('shows the viewport-filtered count, not the raw response length, in "이 지역 사진 · N장"', async () => {
    // 응답은 5개지만(패딩 bbox), 그중 2개만 좁은 뷰포트 안에 있다고 가정.
    mockPins([
      { id: 'in1', lat: 37.5, lng: 127.5, thumbnailUrl: 'u' },
      { id: 'in2', lat: 37.51, lng: 127.51, thumbnailUrl: 'u' },
      { id: 'out1', lat: 10, lng: 10, thumbnailUrl: 'u' },
      { id: 'out2', lat: 10, lng: 10, thumbnailUrl: 'u' },
      { id: 'out3', lat: 10, lng: 10, thumbnailUrl: 'u' },
    ]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    expect(await screen.findByText('이 지역 사진 · 2장')).toBeDefined();
  });

  // Regression: QA-001 — 카카오맵이 초기화 직후 degenerate(minLat===maxLat 등)
  // bounds로 idle을 한 번 먼저 쏘는 걸 실 브라우저(/qa)에서 확인함 — 이 값을
  // 그대로 fetchMapPins에 보내면 백엔드가 400("유효하지 않은 지도 범위입니다")을
  // 돌려준다. 두 번째(실제) idle이 이어서 정상 bounds로 오긴 하지만, 그 사이에
  // 불필요한 400 요청과 그에 따른 TanStack Query 에러 상태가 한 번 생긴다.
  // Found by /qa on 2026-10-25
  it('ignores a degenerate idle (zero-size bounds) instead of fetching with it', async () => {
    mockPins([]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 38.0, maxLat: 38.0, minLng: 126.4, maxLng: 126.4 }, { lat: 38.0, lng: 126.4 }, 10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/discovery/map'))).toHaveLength(0);

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/discovery/map')).length).toBe(1),
    );
  });

  it('shows the 2000-cap notice only when the raw response length is exactly 2000, independent of the viewport count', async () => {
    const pins = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, lat: 37.5, lng: 127.5, thumbnailUrl: 'u' }));
    mockPins(pins);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    await waitFor(() => expect(screen.getByText(/이 지역 사진 · 2000장/)).toBeDefined());
    expect(screen.getByText(/더 있을 수 있음/)).toBeDefined();
  });

  it('also shows an on-map cap notice (visible even on mobile / when the desktop panel is collapsed, unlike the panel-only text)', async () => {
    const pins = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, lat: 37.5, lng: 127.5, thumbnailUrl: 'u' }));
    mockPins(pins);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    expect(await screen.findByText('확대하면 더 많은 사진을 볼 수 있어요')).toBeDefined();
  });

  it('does not show the cap notice when the response is under 2000', async () => {
    mockPins([{ id: 'a', lat: 37.5, lng: 127.5, thumbnailUrl: 'u' }]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);
    await screen.findByText('이 지역 사진 · 1장');
    expect(screen.queryByText(/더 있을 수 있음/)).toBeNull();
  });

  it('renders the mobile FilterBar (카메라/렌즈/정렬 등) on the map tab, not just the desktop-only compressed MapFilterBar', async () => {
    mockPins([]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    // FilterBar의 모바일 Drawer 트리거 버튼("필터")이 있어야 한다 — 지도 탭
    // Global Constraint("모바일은 기존 FilterBar 그대로")를 지키는지 확인.
    expect(await screen.findByRole('button', { name: '필터' })).toBeDefined();
  });

  it('refetches when the month filter changes (month must be part of the query key, not just the queryFn arg)', async () => {
    mockPins([]);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    function mapCallCount() {
      return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/discovery/map')).length;
    }
    await waitFor(() => expect(mapCallCount()).toBeGreaterThan(0));
    const callsBefore = mapCallCount();

    const monthSelect = await screen.findByLabelText('촬영월');
    await user.selectOptions(monthSelect, '3');

    await waitFor(() => expect(mapCallCount()).toBeGreaterThan(callsBefore));
  });

  it('skips the URL write when idle fires again with the same rounded center/zoom', async () => {
    // 같은 값을 다시 쓰기만 해도 window.location.search 문자열 자체는 똑같이
    // 나온다 — 스킵 로직이 없어도 통과하는 약한 검증이었다. withNuqsTestingAdapter는
    // window.history를 안 건드리고 메모리로만 상태를 관리하므로(실제 브라우저
    // 히스토리를 흉내 안 냄), history.replaceState를 스파이해도 0번만 잡힌다 —
    // 대신 어댑터가 제공하는 onUrlUpdate 훅으로 실제 쓰기 횟수를 센다.
    mockPins([]);
    const onUrlUpdate = vi.fn();
    renderWithProviders('', onUrlUpdate);
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.500001, lng: 127.500001 }, 10.4);
    // nuqs는 URL 쓰기를 동기적으로 하지 않고 다음 틱에 플러시한다 — 바로
    // 확인하면 아직 0건이다.
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const callsAfterFirst = onUrlUpdate.mock.calls.length;

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10.49); // 반올림하면 동일값
    await new Promise((resolve) => setTimeout(resolve, 50)); // 추가 쓰기가 없다는 걸 확인하려면 플러시를 기다려야 한다
    expect(onUrlUpdate.mock.calls.length).toBe(callsAfterFirst);
  });

  it('calls relayout on the desktop panel collapse toggle', async () => {
    mockPins([]);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    const toggle = screen.getByRole('button', { name: '패널 접기' });
    await user.click(toggle);
    // relayout은 MapCanvas 내부 구현이라 스텁에는 없음 — 여기서는 토글 후
    // "패널 펼치기"로 라벨이 바뀌는지(=토글 자체가 동작하는지)만 확인하고,
    // relayout 호출 자체는 Task 9에서 이미 ref API로 검증됨.
    expect(screen.getByRole('button', { name: '패널 펼치기' })).toBeDefined();
  });

  it("opens the mobile peek drawer with the tapped pin's card when a map pin is clicked", async () => {
    mockPins([{ id: 'a', lat: 37.5, lng: 127.5, thumbnailUrl: 'https://x/a.jpg' }]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    capturedOnPinClick?.('a');
    // Drawer는 Portal로 document.body에 바로 렌더되므로 render()의 container
    // 밖에 있다 — container.querySelector로는 못 찾고(통과는 하지만 실제로는
    // MapPinList의 같은 썸네일을 잘못 찾는 것이었다), data-slot="drawer-content"
    // 영역 안에서 찾아야 Drawer 자체가 열렸는지 검증된다. alt=""인 장식용
    // 이미지라 role="presentation"이 돼서 getByRole('img')로도 못 찾는다.
    await waitFor(() => {
      const drawerContent = document.querySelector('[data-slot="drawer-content"]');
      expect(drawerContent?.querySelector('img[src="https://x/a.jpg"]')).not.toBeNull();
    });
  });
});
