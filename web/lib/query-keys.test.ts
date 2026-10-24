import { describe, it, expect } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys.discovery', () => {
  it('builds a gallery key that includes the filters object', () => {
    const key = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'ILCE-7M4' });
    expect(key).toEqual(['discovery', 'gallery', { sort: 'latest', cameraName: 'ILCE-7M4' }]);
  });

  it('builds distinct keys for different filters (no accidental cache collision)', () => {
    const a = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'A' });
    const b = queryKeys.discovery.gallery({ sort: 'latest', cameraName: 'B' });
    expect(a).not.toEqual(b);
  });

  it('exposes a fixed equipment key', () => {
    expect(queryKeys.discovery.equipment).toEqual(['discovery', 'equipment']);
  });
});
