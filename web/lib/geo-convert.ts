export function toGeoJSONPoint(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

export function fromGeoJSONPoint(point: [number, number]): { lat: number; lng: number } {
  const [lng, lat] = point;
  return { lat, lng };
}

// 2026-10-23 스파이크로 실측(docs/superpowers/specs/2026-10-12-frontend-design.md §7.1).
// 카카오맵 level 1~14(작을수록 확대) ↔ 표준 웹맵 zoom(supercluster 등, 클수록 확대).
export function kakaoLevelToZoom(level: number): number {
  return 20 - level;
}

export function zoomToKakaoLevel(zoom: number): number {
  return Math.min(14, Math.max(1, Math.round(20 - zoom)));
}

export interface LatLngBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function padBounds(bounds: LatLngBounds, ratio: number): LatLngBounds {
  const latPad = (bounds.maxLat - bounds.minLat) * ratio;
  const lngPad = (bounds.maxLng - bounds.minLng) * ratio;
  return {
    minLat: bounds.minLat - latPad,
    maxLat: bounds.maxLat + latPad,
    minLng: bounds.minLng - lngPad,
    maxLng: bounds.maxLng + lngPad,
  };
}

export function isWithinBounds(point: { lat: number; lng: number }, bounds: LatLngBounds): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}
