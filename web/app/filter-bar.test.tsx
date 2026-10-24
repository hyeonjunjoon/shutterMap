import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('does not produce duplicate element ids when the mobile drawer is open (desktop + drawer copies of FilterFields coexist)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: [], lensNames: [] }),
    } as Response);
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole('button', { name: '필터' }));
    // 데스크톱 인라인 사본 + 드로어 사본, 두 FilterFields 인스턴스가 동시에
    // DOM에 존재하는 상태 — 고정 id였다면 여기서 중복이 생긴다.
    await screen.findAllByText('필터'); // 드로어 제목 렌더 대기

    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
