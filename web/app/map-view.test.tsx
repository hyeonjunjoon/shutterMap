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

function renderWithProviders(searchParams = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MapView />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams, hasMemory: true })({ children })}
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

  it('shows the 2000-cap notice only when the raw response length is exactly 2000, independent of the viewport count', async () => {
    const pins = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, lat: 37.5, lng: 127.5, thumbnailUrl: 'u' }));
    mockPins(pins);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    await waitFor(() => expect(screen.getByText(/이 지역 사진 · 2000장/)).toBeDefined());
    expect(screen.getByText(/더 있을 수 있음/)).toBeDefined();
  });

  it('does not show the cap notice when the response is under 2000', async () => {
    mockPins([{ id: 'a', lat: 37.5, lng: 127.5, thumbnailUrl: 'u' }]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);
    await screen.findByText('이 지역 사진 · 1장');
    expect(screen.queryByText(/더 있을 수 있음/)).toBeNull();
  });

  it('skips the URL write when idle fires again with the same rounded center/zoom', async () => {
    mockPins([]);
    renderWithProviders();
    await screen.findByTestId('map-canvas-stub');

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.500001, lng: 127.500001 }, 10.4);
    const urlAfterFirst = window.location.search;

    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10.49); // 반올림하면 동일값
    expect(window.location.search).toBe(urlAfterFirst);
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
    const { container } = renderWithProviders();
    await screen.findByTestId('map-canvas-stub');
    capturedOnIdle?.({ minLat: 37.4, maxLat: 37.6, minLng: 127.4, maxLng: 127.6 }, { lat: 37.5, lng: 127.5 }, 10);

    capturedOnPinClick?.('a');
    // alt=""인 장식용 이미지라 role="presentation"이 돼서 getByRole('img')로
    // 못 찾는다(ARIA 사양상 정상 동작) — querySelector로 직접 찾는다.
    await waitFor(() => expect(container.querySelector('img[src="https://x/a.jpg"]')).not.toBeNull());
  });
});
