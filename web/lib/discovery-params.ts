import { parseAsString, parseAsInteger, parseAsFloat, parseAsStringEnum } from 'nuqs/server';
import { debounce } from 'nuqs';

export const SORT_OPTIONS = ['latest', 'likes'] as const;
export type GallerySort = (typeof SORT_OPTIONS)[number];

export const VIEW_OPTIONS = ['gallery', 'map'] as const;
export type DiscoveryView = (typeof VIEW_OPTIONS)[number];

// 갤러리/지도 공유 필터. month(촬영월)는 지도 전용이라 여기 없음 — 플랜 B에서
// 지도 전용 파서에 추가한다. 숫자 입력(초점거리/조리개)만 300ms 디바운스를
// 건다 — 카메라/렌즈/정렬은 드롭다운 단건 선택이라 즉시 반영해야 자연스럽다.
export const discoveryFilterParsers = {
  cameraName: parseAsString,
  lensName: parseAsString,
  minFocalLength: parseAsInteger.withOptions({ limitUrlUpdates: debounce(300) }),
  maxFocalLength: parseAsInteger.withOptions({ limitUrlUpdates: debounce(300) }),
  minAperture: parseAsFloat.withOptions({ limitUrlUpdates: debounce(300) }),
  maxAperture: parseAsFloat.withOptions({ limitUrlUpdates: debounce(300) }),
  sort: parseAsStringEnum<GallerySort>([...SORT_OPTIONS]).withDefault('latest'),
};

// 탭 전환은 history: 'push'(뒤로가기로 이전 탭에 돌아갈 수 있어야 함) — 필터는
// nuqs 기본값인 'replace'를 그대로 쓴다(필터 한 번 바꿀 때마다 히스토리가
// 쌓이면 뒤로가기가 쓸모없어진다).
export const viewParser = parseAsStringEnum<DiscoveryView>([...VIEW_OPTIONS])
  .withDefault('gallery')
  .withOptions({ history: 'push' });

export interface NormalizedDiscoveryFilters {
  cameraName?: string;
  lensName?: string;
  minFocalLength?: number;
  maxFocalLength?: number;
  minAperture?: number;
  maxAperture?: number;
  sort: GallerySort;
}

interface RawDiscoveryFilters {
  cameraName: string | null;
  lensName: string | null;
  minFocalLength: number | null;
  maxFocalLength: number | null;
  minAperture: number | null;
  maxAperture: number | null;
  sort: GallerySort;
}

// "둘 다 있는데 min >= max"일 때만 둘 다 기본값(= 필터 없음)으로 되돌린다 —
// 한쪽만 있는 경우(예: "70mm 이상"만 지정)는 유효한 단방향 범위라 그대로 둔다.
function normalizeRange(min: number | null, max: number | null): { min?: number; max?: number } {
  if (min != null && max != null && min >= max) return {};
  const result: { min?: number; max?: number } = {};
  if (min != null) result.min = min;
  if (max != null) result.max = max;
  return result;
}

export function normalizeDiscoveryFilters(raw: RawDiscoveryFilters): NormalizedDiscoveryFilters {
  const focal = normalizeRange(raw.minFocalLength, raw.maxFocalLength);
  const aperture = normalizeRange(raw.minAperture, raw.maxAperture);
  const result: NormalizedDiscoveryFilters = { sort: raw.sort };
  if (raw.cameraName) result.cameraName = raw.cameraName;
  if (raw.lensName) result.lensName = raw.lensName;
  if (focal.min !== undefined) result.minFocalLength = focal.min;
  if (focal.max !== undefined) result.maxFocalLength = focal.max;
  if (aperture.min !== undefined) result.minAperture = aperture.min;
  if (aperture.max !== undefined) result.maxAperture = aperture.max;
  return result;
}
