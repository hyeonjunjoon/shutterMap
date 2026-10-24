import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
// Cache Components 때문에 실제 fetch/notFound 로직은 바깥(기본 export, Suspense
// 래퍼)이 아니라 안쪽 PhotoDetailFetcher로 옮겨졌다 — 그 로직을 직접 테스트한다.
import { PhotoDetailFetcher as PhotoDetailPage } from './page';

vi.mock('next/navigation', () => ({
  // 실제 notFound()는 던지고 return하지 않는다 — 테스트에서도 같은 동작을
  // 흉내내야 그 뒤 코드가 실행되지 않는 걸 검증할 수 있다.
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('PhotoDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the photo on success', async () => {
    mockFetchOnce(200, {
      id: 'p1',
      cameraName: 'ILCE-7M4',
      lensName: 'FE 24-70mm F2.8 GM',
      focalLength: 70,
      aperture: 1.8,
      shutterSpeed: '1/100',
      iso: 400,
      servingUrl: 'https://example.com/serving.jpg',
    });
    const jsx = await PhotoDetailPage({ params: Promise.resolve({ id: 'p1' }) });
    render(jsx);
    expect(screen.getByText('ILCE-7M4')).toBeDefined();
    expect(screen.getByText('F1.8')).toBeDefined();
  });

  it('calls notFound() on a 404 (and does not render)', async () => {
    mockFetchOnce(404, { statusCode: 404, message: '사진을 찾을 수 없습니다.', error: 'Not Found' });
    await expect(PhotoDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('rethrows on a non-404 error (caught by the global error boundary)', async () => {
    mockFetchOnce(500, { statusCode: 500, message: '서버 오류', error: 'Internal Server Error' });
    await expect(PhotoDetailPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow('서버 오류');
  });
});
