// Regression: ISSUE-001 — native browser validation popups (minlength, type=email)
// show up in English on this Korean-language form, bypassing our Korean inline
// error entirely, because jsdom doesn't implement them the same way real
// browsers do (jsdom never shows the popup at all, so the existing jsdom test
// suite could never catch this).
// Found by /qa on 2026-10-15 via a real headless-Chromium screenshot
// (gstack $B), reproduced with password "short" and email "not-an-email".
// Report: .gstack/qa-reports/run-20261015T112335Z/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterPage from './page';
import { apiClient, ApiError } from '@/lib/api-client';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: vi.fn() };
});

const mockedApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('RegisterPage regression: native validation popups must not bypass Korean errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.resolve({ id: 'u1', email: 'a@b.com' });
    });
  });

  it('disables native constraint-validation UI on the form (noValidate), so our own Korean checks always run', () => {
    renderWithQuery(<RegisterPage />);
    const form = screen.getByRole('button', { name: '가입하기' }).closest('form');
    expect(form).toHaveAttribute('novalidate');
  });

  it('shows a Korean inline error for a malformed email without calling the API', async () => {
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('올바른 이메일 형식이 아닙니다.'));
    const calledPaths = mockedApiClient.mock.calls.map((call) => call[0]);
    expect(calledPaths).not.toContain('/auth/register');
  });
});
