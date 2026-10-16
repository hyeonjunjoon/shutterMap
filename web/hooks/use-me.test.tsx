import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMe } from './use-me';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  // retry:false — 기본값(재시도 + 지수 백오프)이면 500 에러 테스트가
  // waitFor 타임아웃에 걸린다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the user on success', async () => {
    mockedApiClient.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      ownedCameraName: null,
      ownedCameraRaw: null,
    });
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() =>
      expect(result.current.data).toEqual({
        id: 'u1',
        email: 'a@b.com',
        ownedCameraName: null,
        ownedCameraRaw: null,
      }),
    );
    expect(result.current.isError).toBe(false);
  });

  it('returns null (not an error) when the API returns 401', async () => {
    mockedApiClient.mockRejectedValue(new ApiError(401, '인증 필요'));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a real error (500) as isError', async () => {
    mockedApiClient.mockRejectedValue(new ApiError(500, '서버 오류'));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
