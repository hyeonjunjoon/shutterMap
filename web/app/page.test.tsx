import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
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
    // DiscoveryView가 nuqs(useQueryState)를 쓰므로, 다른 nuqs 소비 컴포넌트
    // 테스트와 동일하게 NuqsTestingAdapter로 감싸야 한다(안 감싸면
    // "[nuqs] nuqs requires an adapter" 에러).
    render(<Page />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{withNuqsTestingAdapter({})({ children })}</QueryClientProvider>
      ),
    });
    expect(screen.getByRole('tab', { name: '갤러리' })).toBeDefined();
  });
});
