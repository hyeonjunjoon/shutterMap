import { apiClient } from './api-client';
import type { NormalizedDiscoveryFilters } from './discovery-params';

export interface GalleryPhoto {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  thumbnailUrl: string;
  likeCount: number;
  createdAt: string;
}

export interface GalleryPage {
  items: GalleryPhoto[];
  nextCursor: string | null;
}

export interface EquipmentOptions {
  cameraNames: string[];
  lensNames: string[];
}

export async function fetchGallery(
  filters: NormalizedDiscoveryFilters,
  cursor: string | null,
): Promise<GalleryPage> {
  const params = new URLSearchParams();
  params.set('sort', filters.sort);
  if (filters.cameraName) params.set('cameraName', filters.cameraName);
  if (filters.lensName) params.set('lensName', filters.lensName);
  if (filters.minFocalLength !== undefined) params.set('minFocalLength', String(filters.minFocalLength));
  if (filters.maxFocalLength !== undefined) params.set('maxFocalLength', String(filters.maxFocalLength));
  if (filters.minAperture !== undefined) params.set('minAperture', String(filters.minAperture));
  if (filters.maxAperture !== undefined) params.set('maxAperture', String(filters.maxAperture));
  // cursor가 null이면 파라미터 자체를 넣지 않는다 — "cursor=null" 같은 값을
  // 보내면 백엔드가 그걸 유효하지 않은 cursor로 취급할 수 있다.
  if (cursor) params.set('cursor', cursor);
  return apiClient<GalleryPage>(`/discovery/gallery?${params.toString()}`);
}

export async function fetchEquipment(): Promise<EquipmentOptions> {
  return apiClient<EquipmentOptions>('/discovery/equipment');
}
