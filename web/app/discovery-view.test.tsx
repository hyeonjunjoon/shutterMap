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
