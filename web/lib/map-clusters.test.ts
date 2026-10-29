import { describe, it, expect } from 'vitest';
import { computeClusters, type MapPin } from './map-clusters';

const WORLD_BBOX: [number, number, number, number] = [-179, -85, 179, 85];

function pin(id: string, lat: number, lng: number): MapPin {
  return { id, lat, lng, thumbnailUrl: `https://x/${id}.jpg` };
}

describe('computeClusters', () => {
  it('returns individual pin markers when points are far apart', () => {
    const pins = [pin('a', 37.5, 127.0), pin('b', 35.1, 129.0)];
    const { markers, leafToClusterId } = computeClusters(pins, WORLD_BBOX, 10);
    expect(markers.every((m) => m.type === 'pin')).toBe(true);
    expect(markers.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(leafToClusterId.size).toBe(0);
  });

  it('groups nearby points into one cluster at a low zoom, and maps every leaf id to it', () => {
    const pins = [pin('a', 37.5665, 126.978), pin('b', 37.5666, 126.9781), pin('c', 37.5664, 126.9779)];
    const { markers, leafToClusterId } = computeClusters(pins, WORLD_BBOX, 1);
    const clusters = markers.filter((m) => m.type === 'cluster');
    expect(clusters).toHaveLength(1);
    const cluster = clusters[0] as Extract<(typeof markers)[number], { type: 'cluster' }>;
    expect(cluster.count).toBe(3);
    expect(leafToClusterId.get('a')).toBe(cluster.id);
    expect(leafToClusterId.get('b')).toBe(cluster.id);
    expect(leafToClusterId.get('c')).toBe(cluster.id);
    expect(cluster.expansionZoom).toBeGreaterThan(1);
  });

  it('the same points are NOT clustered at a high (zoomed-in) zoom — leafToClusterId is fresh per call, not stale', () => {
    const pins = [pin('a', 37.5665, 126.978), pin('b', 37.5666, 126.9781), pin('c', 37.5664, 126.9779)];
    const { markers, leafToClusterId } = computeClusters(pins, WORLD_BBOX, 21);
    expect(markers.every((m) => m.type === 'pin')).toBe(true);
    expect(leafToClusterId.size).toBe(0);
  });

  it('returns no markers for an empty pin list', () => {
    const { markers, leafToClusterId } = computeClusters([], WORLD_BBOX, 10);
    expect(markers).toEqual([]);
    expect(leafToClusterId.size).toBe(0);
  });
});
