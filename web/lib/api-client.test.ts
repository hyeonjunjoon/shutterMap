import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

function mockFetchOnce(status: number, body: unknown, rawText?: string) {
  const text = rawText !== undefined ? rawText : body === undefined ? '' : JSON.stringify(body);
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response);
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    mockFetchOnce(200, { id: 'u1', email: 'a@b.com' });
    const result = await apiClient('/auth/me');
    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('returns null for an empty 200 body without throwing', async () => {
    mockFetchOnce(200, undefined);
    const result = await apiClient('/photos/x/visibility', { method: 'PATCH' });
    expect(result).toBeNull();
  });

  it('throws ApiError (not a raw SyntaxError) when the body is not valid JSON', async () => {
    mockFetchOnce(502, undefined, '<html>Bad Gateway</html>');
    await expect(apiClient('/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the string message on a 401', async () => {
    mockFetchOnce(401, {
      statusCode: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      error: 'Unauthorized',
    });
    await expect(apiClient('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    mockFetchOnce(401, {
      statusCode: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      error: 'Unauthorized',
    });
    await expect(apiClient('/auth/login', { method: 'POST' })).rejects.toThrow(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    );
  });

  it('joins a string[] message on a 400 validation error', async () => {
    mockFetchOnce(400, {
      statusCode: 400,
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      error: 'Bad Request',
    });
    await expect(apiClient('/auth/register', { method: 'POST' })).rejects.toThrow(
      'email must be an email, password must be longer than or equal to 8 characters',
    );
  });

  it('sends credentials: include on every request', async () => {
    mockFetchOnce(200, { ok: true });
    await apiClient('/auth/me');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not set Content-Type when the body is FormData (브라우저가 자동으로 boundary를 붙인 multipart를 설정해야 함)', async () => {
    mockFetchOnce(201, [{ id: 'p1' }]);
    const formData = new FormData();
    formData.append('files', new Blob(['x']), 'a.jpg');
    await apiClient('/photos', { method: 'POST', body: formData });

    const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callOptions.headers['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when the body is a plain object/string (FormData 아님)', async () => {
    mockFetchOnce(200, { ok: true });
    await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) });

    const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callOptions.headers['Content-Type']).toBe('application/json');
  });
});
