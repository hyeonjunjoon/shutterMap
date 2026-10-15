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

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.resolve({ id: 'u1', email: 'a@b.com' });
    });
  });

  it('labels inputs with autoComplete="new-password", and registers+redirects without calling /auth/login separately (백엔드가 가입 시 이미 로그인시켜줌)', async () => {
    renderWithQuery(<RegisterPage />);
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('autoComplete', 'new-password');

    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    const calledPaths = mockedApiClient.mock.calls.map((call) => call[0]);
    expect(calledPaths).not.toContain('/auth/login');
  });

  it('shows the error message on 409 (duplicate email)', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(new ApiError(409, '이미 가입된 이메일입니다.'));
    });
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다.'));
  });

  it('shows a joined string[] validation message on 400', async () => {
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return Promise.reject(
        new ApiError(400, 'email must be an email, password must be longer than or equal to 8 characters'),
      );
    });
    renderWithQuery(<RegisterPage />);
    // input type="email"에 형식이 틀린 값("bad")을 넣으면 jsdom의 네이티브
    // HTML5 제약 검증이 제출 자체를 막아 핸들러가 호출되지 않는다(실제 브라우저와
    // 동일한 동작) — 형식은 유효하지만 백엔드가 400으로 거부하는 값을 쓴다.
    await userEvent.type(screen.getByLabelText('이메일'), 'short@example.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), '1');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/email must be an email/));
  });

  it('shows a stable-width loading state while submitting (텍스트만 바뀌고 버튼은 비활성화)', async () => {
    let resolveRegister!: () => void;
    mockedApiClient.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.reject(new ApiError(401, '비로그인'));
      return new Promise((resolve) => {
        resolveRegister = () => resolve({ id: 'u1', email: 'a@b.com' });
      });
    });
    renderWithQuery(<RegisterPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }));

    const loadingButton = await screen.findByRole('button', { name: '가입 중...' });
    expect(loadingButton).toBeDisabled();

    resolveRegister();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });
});
