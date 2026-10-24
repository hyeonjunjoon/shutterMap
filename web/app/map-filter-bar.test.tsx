import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { MapFilterBar } from './map-filter-bar';

function renderWithProviders(searchParams = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MapFilterBar />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {withNuqsTestingAdapter({ searchParams, hasMemory: true })({ children })}
      </QueryClientProvider>
    ),
  });
}

describe('MapFilterBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ cameraNames: ['ILCE-7M4', 'X100VI'], lensNames: [] }),
    } as Response);
  });

  it('disables camera/lens while equipment is loading', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderWithProviders();
    expect(screen.getByLabelText('카메라')).toBeDisabled();
  });

  it('shows a chip for an active filter, with a working clear button', async () => {
    const user = userEvent.setup();
    renderWithProviders('?cameraName=ILCE-7M4');
    expect(await screen.findByText('카메라: ILCE-7M4')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /카메라: ILCE-7M4/ }));
    await waitFor(() => expect(screen.queryByText('카메라: ILCE-7M4')).toBeNull());
  });

  it('shows no chips when no filter is active', () => {
    renderWithProviders();
    expect(screen.queryByRole('button', { name: /카메라:/ })).toBeNull();
  });

  it('includes a month select inside the details/summary advanced section', async () => {
    renderWithProviders();
    const monthSelect = await screen.findByLabelText('촬영월');
    expect(monthSelect).toBeDefined();
  });
});
