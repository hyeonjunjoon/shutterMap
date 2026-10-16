import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './page';
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

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.resolve({ ok: true });
    });
  });

  it('renders labeled inputs with the right autoComplete, and OAuth links as real <a> tags (fetch가 아니라 전체 페이지 이동이어야 함)', () => {
    renderWithQuery(<LoginPage />);

    const emailInput = screen.getByLabelText('이메일');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    const passwordInput = screen.getByLabelText('비밀번호');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');

    const kakaoLink = screen.getByRole('link', { name: /카카오로 시작하기/ });
    expect(kakaoLink.tagName).toBe('A');
    expect(kakaoLink.getAttribute('href')).toContain('/auth/kakao');

    const googleLink = screen.getByRole('link', { name: /구글로 시작하기/ });
    expect(googleLink.tagName).toBe('A');
    expect(googleLink.getAttribute('href')).toContain('/auth/google');
  });

  it('logs in and redirects to / on success', async () => {
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  it('shows the error message on 401', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(new ApiError(401, '이메일 또는 비밀번호가 올바르지 않습니다.'));
    });
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.'),
    );
  });

  it('shows a stable-width loading state while submitting (텍스트만 바뀌고 버튼은 비활성화)', async () => {
    let resolveLogin!: () => void;
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return new Promise((resolve) => {
        resolveLogin = () => resolve({ ok: true });
      });
    });
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const loadingButton = await screen.findByRole('button', { name: '로그인 중…' });
    expect(loadingButton).toBeDisabled();

    resolveLogin();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });
});
