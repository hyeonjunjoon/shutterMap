import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGallery, fetchEquipment } from './discovery-api';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('fetchGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests /discovery/gallery with sort and omits unset filters', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery({ sort: 'latest' }, null);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/discovery/gallery?sort=latest');
    expect(url).not.toContain('cursor=');
    expect(url).not.toContain('cameraName=');
  });

  it('includes cursor only when it is not null', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery({ sort: 'latest' }, 'abc-cursor');
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('cursor=abc-cursor');
  });

  it('includes all set filter fields', async () => {
    mockFetchOnce(200, { items: [], nextCursor: null });
    await fetchGallery(
      { sort: 'likes', cameraName: 'ILCE-7M4', minFocalLength: 24, maxFocalLength: 70 },
      null,
    );
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('sort=likes');
    expect(url).toContain('cameraName=ILCE-7M4');
    expect(url).toContain('minFocalLength=24');
    expect(url).toContain('maxFocalLength=70');
  });

  it('returns the parsed page', async () => {
    const page = { items: [{ id: 'p1', cameraName: 'A', lensName: null, thumbnailUrl: 'u', likeCount: 2, createdAt: '2026-01-01' }], nextCursor: 'c2' };
    mockFetchOnce(200, page);
    const result = await fetchGallery({ sort: 'latest' }, null);
    expect(result).toEqual(page);
  });
});

describe('fetchEquipment', () => {
  it('requests /discovery/equipment and returns the parsed body', async () => {
    mockFetchOnce(200, { cameraNames: ['ILCE-7M4'], lensNames: [] });
    const result = await fetchEquipment();
    expect(result).toEqual({ cameraNames: ['ILCE-7M4'], lensNames: [] });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/discovery/equipment');
  });
});
