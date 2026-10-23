import { describe, it, expect } from 'vitest';
import {
  discoveryFilterParsers,
  viewParser,
  normalizeDiscoveryFilters,
} from './discovery-params';

describe('discoveryFilterParsers', () => {
  it('parses a valid integer', () => {
    expect(discoveryFilterParsers.minFocalLength.parse('70')).toBe(70);
  });

  it('returns null (= treated as absent) for a non-numeric value', () => {
    expect(discoveryFilterParsers.minFocalLength.parse('abc')).toBeNull();
  });

  it('returns null (= falls back to default) for an out-of-enum sort value', () => {
    expect(discoveryFilterParsers.sort.parse('weird')).toBeNull();
  });

  it('view parser falls back on an unknown value', () => {
    expect(viewParser.parse('satellite')).toBeNull();
  });
});

describe('normalizeDiscoveryFilters', () => {
  const base = {
    cameraName: null,
    lensName: null,
    minFocalLength: null,
    maxFocalLength: null,
    minAperture: null,
    maxAperture: null,
    sort: 'latest' as const,
  };

  it('keeps a valid focal length range', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 24, maxFocalLength: 70 });
    expect(result.minFocalLength).toBe(24);
    expect(result.maxFocalLength).toBe(70);
  });

  it('drops both bounds when min >= max (invalid range)', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 100, maxFocalLength: 50 });
    expect(result.minFocalLength).toBeUndefined();
    expect(result.maxFocalLength).toBeUndefined();
  });

  it('keeps a one-sided range (min only)', () => {
    const result = normalizeDiscoveryFilters({ ...base, minFocalLength: 70 });
    expect(result.minFocalLength).toBe(70);
    expect(result.maxFocalLength).toBeUndefined();
  });

  it('drops an invalid aperture range the same way', () => {
    const result = normalizeDiscoveryFilters({ ...base, minAperture: 8, maxAperture: 1.8 });
    expect(result.minAperture).toBeUndefined();
    expect(result.maxAperture).toBeUndefined();
  });

  it('omits empty-string camera/lens names', () => {
    const result = normalizeDiscoveryFilters({ ...base, cameraName: '' });
    expect(result.cameraName).toBeUndefined();
  });

  it('passes through a non-empty camera name and sort', () => {
    const result = normalizeDiscoveryFilters({ ...base, cameraName: 'ILCE-7M4', sort: 'likes' });
    expect(result.cameraName).toBe('ILCE-7M4');
    expect(result.sort).toBe('likes');
  });
});
