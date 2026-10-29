import { describe, it, expect } from 'vitest';
import {
  toGeoJSONPoint,
  fromGeoJSONPoint,
  kakaoLevelToZoom,
  zoomToKakaoLevel,
  padBounds,
  isWithinBounds,
} from './geo-convert';

describe('GeoJSON 좌표 변환', () => {
  it('toGeoJSONPoint: lat/lng를 [lng, lat] 순서로 바꾼다', () => {
    expect(toGeoJSONPoint(37.5, 127.0)).toEqual([127.0, 37.5]);
  });

  it('fromGeoJSONPoint: [lng, lat]를 {lat, lng}로 되돌린다', () => {
    expect(fromGeoJSONPoint([127.0, 37.5])).toEqual({ lat: 37.5, lng: 127.0 });
  });

  it('왕복 변환이 원래 값을 보존한다', () => {
    const original = { lat: 37.5665, lng: 126.978 };
    expect(fromGeoJSONPoint(toGeoJSONPoint(original.lat, original.lng))).toEqual(original);
  });
});

describe('레벨/줌 변환 (2026-10-23 스파이크 공식: standardZoom = 20 - kakaoLevel)', () => {
  it('kakaoLevelToZoom', () => {
    expect(kakaoLevelToZoom(1)).toBe(19);
    expect(kakaoLevelToZoom(14)).toBe(6);
  });

  it('zoomToKakaoLevel은 반올림 후 1~14로 클램프한다', () => {
    expect(zoomToKakaoLevel(19)).toBe(1);
    expect(zoomToKakaoLevel(6)).toBe(14);
    expect(zoomToKakaoLevel(25)).toBe(1); // 범위 밖 → 클램프
    expect(zoomToKakaoLevel(-5)).toBe(14); // 범위 밖 → 클램프
  });
});

describe('bbox 패딩/포함 여부', () => {
  const bounds = { minLat: 37.0, maxLat: 38.0, minLng: 127.0, maxLng: 128.0 };

  it('padBounds: 비율만큼 사방으로 넓힌다', () => {
    const padded = padBounds(bounds, 0.2);
    expect(padded.minLat).toBeCloseTo(36.8, 5);
    expect(padded.maxLat).toBeCloseTo(38.2, 5);
    expect(padded.minLng).toBeCloseTo(126.8, 5);
    expect(padded.maxLng).toBeCloseTo(128.2, 5);
  });

  it('isWithinBounds: 경계값 포함, 범위 밖 제외', () => {
    expect(isWithinBounds({ lat: 37.5, lng: 127.5 }, bounds)).toBe(true);
    expect(isWithinBounds({ lat: 37.0, lng: 127.0 }, bounds)).toBe(true); // 경계 포함
    expect(isWithinBounds({ lat: 36.9, lng: 127.5 }, bounds)).toBe(false);
    expect(isWithinBounds({ lat: 37.5, lng: 128.1 }, bounds)).toBe(false);
  });
});
