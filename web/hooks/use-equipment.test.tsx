import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEquipment } from './use-equipment';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useEquipment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is loading initially, then resolves with the equipment list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: ['ILCE-7M4'], lensNames: ['FE 24-70mm F2.8 GM'] }),
    } as Response);

    const { result } = renderHook(() => useEquipment(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ cameraNames: ['ILCE-7M4'], lensNames: ['FE 24-70mm F2.8 GM'] });
  });
});
