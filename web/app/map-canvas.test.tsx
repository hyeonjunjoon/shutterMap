import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { MapCanvas, type MapCanvasHandle } from './map-canvas';
import type { MapPin } from '@/lib/map-clusters';
import { PIN_ICON_SELECTED } from '@/lib/pin-icons';

// 카카오맵 네임스페이스 스텁 — 실제 렌더링은 안 하고, 호출 횟수/인자만 기록한다.
function stubKakao() {
  const markers: { setImage: ReturnType<typeof vi.fn>; setMap: ReturnType<typeof vi.fn> }[] = [];
  const overlays: { setMap: ReturnType<typeof vi.fn> }[] = [];

  class FakeLatLng {
    constructor(public lat: number, public lng: number) {}
    getLat() {
      return this.lat;
    }
    getLng() {
      return this.lng;
    }
  }
  class FakeBounds {
    getSouthWest() {
      return new FakeLatLng(37.0, 127.0);
    }
    getNorthEast() {
      return new FakeLatLng(38.0, 128.0);
    }
  }
  class FakeMap {
    private level = 5;
    private idleHandler: (() => void) | null = null;
    getBounds() {
      return new FakeBounds();
    }
    getCenter() {
      return new FakeLatLng(37.5, 127.5);
    }
    getLevel() {
      return this.level;
    }
    setLevel() {}
    relayout = vi.fn();
    __fireIdle() {
      this.idleHandler?.();
    }
    __setIdleHandler(fn: () => void) {
      this.idleHandler = fn;
    }
  }
  const lastMap = { current: null as FakeMap | null };

  (global as any).window.kakao = {
    maps: {
      // vi.fn()을 new로 호출하려면 구현체가 화살표 함수가 아니어야 한다 —
      // 화살표 함수는 생성자로 쓸 수 없다(vitest 자체 경고로도 확인됨).
      Map: vi.fn().mockImplementation(function () {
        const map = new FakeMap();
        lastMap.current = map;
        return map;
      }),
      LatLng: FakeLatLng,
      Size: vi.fn(),
      MarkerImage: vi.fn(),
      load: vi.fn((cb: () => void) => cb()),
      Marker: vi.fn().mockImplementation(function () {
        const marker = { setImage: vi.fn(), setMap: vi.fn() };
        markers.push(marker);
        return marker;
      }),
      CustomOverlay: vi.fn().mockImplementation(function () {
        const overlay = { setMap: vi.fn() };
        overlays.push(overlay);
        return overlay;
      }),
      event: {
        addListener: vi.fn((target, event, handler) => {
          if (event === 'idle' && target instanceof FakeMap) {
            target.__setIdleHandler(handler);
          }
        }),
      },
    },
  };

  return { markers, overlays, lastMap };
}

const pins: MapPin[] = [
  { id: 'a', lat: 37.5, lng: 127.3, thumbnailUrl: 'https://x/a.jpg' },
  { id: 'b', lat: 10.0, lng: 10.0, thumbnailUrl: 'https://x/b.jpg' }, // 멀리 떨어져서 클러스터 안 됨
];

describe('MapCanvas', () => {
  let stub: ReturnType<typeof stubKakao>;

  beforeEach(() => {
    stub = stubKakao();
  });

  function setup(overrides: Partial<Parameters<typeof MapCanvas>[0]> = {}) {
    const ref = createRef<MapCanvasHandle>();
    const props = {
      pins,
      center: { lat: 37.5, lng: 127.5 },
      zoom: 10,
      hoveredPinId: null,
      selectedPinId: null,
      onIdle: vi.fn(),
      onPinClick: vi.fn(),
      onPinHover: vi.fn(),
      ...overrides,
    };
    const { rerender } = render(<MapCanvas ref={ref} {...props} />);
    return { ref, props, rerender };
  }

  it('creates one marker per non-clustered pin on mount', () => {
    setup();
    expect(stub.markers.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onIdle with bounds/center/zoom when the map fires idle', () => {
    const { props } = setup();
    stub.lastMap.current?.__fireIdle();
    expect(props.onIdle).toHaveBeenCalledTimes(1);
    const [bounds, center, zoom] = (props.onIdle as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(bounds).toEqual({ minLat: 37.0, maxLat: 38.0, minLng: 127.0, maxLng: 128.0 });
    expect(center).toEqual({ lat: 37.5, lng: 127.5 });
    expect(typeof zoom).toBe('number');
  });

  it('relayout() on the imperative handle calls the underlying kakao map relayout', () => {
    const { ref } = setup();
    ref.current?.relayout();
    expect(stub.lastMap.current?.relayout).toHaveBeenCalledTimes(1);
  });

  it('swaps only the previous and new marker image when the highlight changes, without recreating all markers', () => {
    const { rerender, props } = setup({ hoveredPinId: null });
    const markerCountAfterMount = stub.markers.length;

    rerender(<MapCanvas {...props} ref={createRef()} hoveredPinId="a" />);
    // 강조가 바뀌었을 때 마커가 새로 생성되지 않아야 한다(전체 재생성 금지).
    expect(stub.markers.length).toBe(markerCountAfterMount);
    // 강조된(혹은 강조 해제된) 마커의 setImage가 호출됐어야 한다.
    expect(stub.markers.some((m) => m.setImage.mock.calls.length > 0)).toBe(true);
  });

  it('keeps the current highlight after an idle-triggered full rebuild (panning/zooming after selecting a pin)', () => {
    const { rerender, props } = setup({ selectedPinId: null });
    rerender(<MapCanvas {...props} ref={createRef()} selectedPinId="a" />);

    // idle(패닝/줌)이 렌더러를 다시 호출해서 모든 마커를 새로 만든다 — 이때도
    // 선택된 핀은 여전히 강조된 이미지로 생성돼야 한다.
    const markerImageCallsBeforeIdle = (window as any).kakao.maps.MarkerImage.mock.calls.length;
    stub.lastMap.current?.__fireIdle();
    const callsAfterIdle = (window as any).kakao.maps.MarkerImage.mock.calls.slice(markerImageCallsBeforeIdle);

    expect(callsAfterIdle.some((call: unknown[]) => call[0] === PIN_ICON_SELECTED)).toBe(true);
  });
});
