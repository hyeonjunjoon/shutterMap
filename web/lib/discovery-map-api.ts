import { apiClient } from './api-client';
import type { LatLngBounds } from './geo-convert';
import type { NormalizedDiscoveryFilters } from './discovery-params';
import type { MapPin } from './map-clusters';

export type { MapPin };

export async function fetchMapPins(
  bounds: LatLngBounds,
  filters: NormalizedDiscoveryFilters,
  month: number | undefined,
): Promise<MapPin[]> {
  const params = new URLSearchParams();
  params.set('minLat', String(bounds.minLat));
  params.set('maxLat', String(bounds.maxLat));
  params.set('minLng', String(bounds.minLng));
  params.set('maxLng', String(bounds.maxLng));
  if (month !== undefined) params.set('month', String(month));
  if (filters.cameraName) params.set('cameraName', filters.cameraName);
  if (filters.lensName) params.set('lensName', filters.lensName);
  if (filters.minFocalLength !== undefined) params.set('minFocalLength', String(filters.minFocalLength));
  if (filters.maxFocalLength !== undefined) params.set('maxFocalLength', String(filters.maxFocalLength));
  if (filters.minAperture !== undefined) params.set('minAperture', String(filters.minAperture));
  if (filters.maxAperture !== undefined) params.set('maxAperture', String(filters.maxAperture));
  // sort는 /discovery/map에 없다 — 보내지 않는다.
  return apiClient<MapPin[]>(`/discovery/map?${params.toString()}`);
}
