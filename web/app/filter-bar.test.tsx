import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    // findByLabelText는 엘리먼트가 DOM에 존재하면 바로 resolve된다(처음엔
    // disabled 상태로 이미 존재) — "비활성화가 풀렸는지"는 별도로 기다려야 한다.
    const cameraSelect = await screen.findByLabelText('카메라');
    await waitFor(() => expect(cameraSelect).not.toBeDisabled());
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
