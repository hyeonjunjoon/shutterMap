import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
// map-canvas는 카카오맵 의존이라 모킹한다 — discovery-view 레벨에서는
// "지도 탭일 때 MapView가 렌더되는지"만 확인한다(MapView 자체 로직은
// Task 10에서 이미 검증됨).
vi.mock('./map-view', () => ({
  MapView: () => <div data-testid="map-view-stub" />,
}));

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

  it('shows the map view when the map tab is active via URL', () => {
    renderWithProviders('?view=map');
    expect(screen.getByTestId('map-view-stub')).toBeDefined();
  });

  it('switches to the map view when the 지도 tab is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders();
    await user.click(screen.getByRole('tab', { name: '지도' }));
    expect(await screen.findByTestId('map-view-stub')).toBeDefined();
  });
});
