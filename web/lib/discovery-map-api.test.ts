import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMapPins } from './discovery-map-api';

function mockFetchOnce(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('fetchMapPins', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const bounds = { minLat: 37.0, maxLat: 38.0, minLng: 127.0, maxLng: 128.0 };

  it('always includes the four bounds params', async () => {
    mockFetchOnce([]);
    await fetchMapPins(bounds, { sort: 'latest' }, undefined);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('minLat=37');
    expect(url).toContain('maxLat=38');
    expect(url).toContain('minLng=127');
    expect(url).toContain('maxLng=128');
  });

  it('includes month only when provided', async () => {
    mockFetchOnce([]);
    await fetchMapPins(bounds, { sort: 'latest' }, 7);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('month=7');
  });

  it('omits month when undefined', async () => {
    mockFetchOnce([]);
    await fetchMapPins(bounds, { sort: 'latest' }, undefined);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('month=');
  });

  it('includes the shared filters when set, never sort (map has no sort)', async () => {
    mockFetchOnce([]);
    await fetchMapPins(bounds, { sort: 'latest', cameraName: 'ILCE-7M4', minFocalLength: 24 }, undefined);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('cameraName=ILCE-7M4');
    expect(url).toContain('minFocalLength=24');
    expect(url).not.toContain('sort=');
  });

  it('returns the parsed pin array', async () => {
    const pins = [{ id: 'p1', lat: 37.5, lng: 127.5, thumbnailUrl: 'https://x/p1.jpg' }];
    mockFetchOnce(pins);
    const result = await fetchMapPins(bounds, { sort: 'latest' }, undefined);
    expect(result).toEqual(pins);
  });
});
