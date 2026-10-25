'use client';

import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import Script from 'next/script';
import { computeClusters, type MapMarker, type MapPin } from '@/lib/map-clusters';
import { kakaoLevelToZoom, zoomToKakaoLevel, type LatLngBounds } from '@/lib/geo-convert';
import { PIN_ICON_DEFAULT, PIN_ICON_SELECTED, PIN_SIZE_DEFAULT, PIN_SIZE_SELECTED } from '@/lib/pin-icons';

declare global {
  interface Window {
    kakao: any;
  }
}

// 클러스터 배지는 클릭하면 확대되는 버튼이다 — h-8/h-9(32/36px)였던 기존 크기는
// 44px 터치 타겟 기준(web-design-guidelines)에 못 미친다(/design-review에서
// 확인). 핀 강조와 같은 패턴으로 기본 44px, 강조 시 한 단계 크게.
const CLUSTER_BADGE_DEFAULT_CLASS = 'flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background';
const CLUSTER_BADGE_HIGHLIGHTED_CLASS =
  'flex h-12 w-12 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground ring-2 ring-foreground';

export interface MapCanvasHandle {
  relayout: () => void;
}

export interface MapCanvasProps {
  pins: MapPin[];
  center: { lat: number; lng: number };
  zoom: number;
  hoveredPinId: string | null;
  selectedPinId: string | null;
  onIdle: (bounds: LatLngBounds, center: { lat: number; lng: number }, zoom: number) => void;
  onPinClick: (id: string) => void;
  onPinHover: (id: string | null) => void;
  ref?: React.Ref<MapCanvasHandle>;
}

export function MapCanvas({
  pins,
  center,
  zoom,
  hoveredPinId,
  selectedPinId,
  onIdle,
  onPinClick,
  onPinHover,
  ref,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef(new Map<string, any>());
  const overlaysRef = useRef(new Map<number, { overlay: any; content: HTMLDivElement }>());
  const leafToClusterIdRef = useRef(new Map<string, number>());
  const prevHighlightRef = useRef<string | null>(null);

  // hoveredPinId/selectedPinId도 ref로 읽는다 — idle 리스너는 initMap 시점에
  // 딱 한 번만 등록되므로(아래 mount effect), renderMarkers가 이 값들을 클로저로
  // 캡처하면 그 등록 시점의 값에 영원히 묶여서, 핀을 고른 뒤 패닝/줌해도(idle이
  // 다시 불러서 전체 재생성) 강조가 조용히 사라진다. ref로 읽으면 renderMarkers
  // 자체가 안정적인(재생성 안 되는) 함수가 되면서 이 문제가 같이 풀린다.
  const propsRef = useRef({ pins, onIdle, onPinClick, onPinHover, hoveredPinId, selectedPinId });
  propsRef.current = { pins, onIdle, onPinClick, onPinHover, hoveredPinId, selectedPinId };

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bbox: [number, number, number, number] = [sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()];
    const standardZoom = kakaoLevelToZoom(map.getLevel());
    const { markers, leafToClusterId } = computeClusters(propsRef.current.pins, bbox, standardZoom);
    leafToClusterIdRef.current = leafToClusterId;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();
    overlaysRef.current.forEach(({ overlay }) => overlay.setMap(null));
    overlaysRef.current.clear();

    const highlightId = propsRef.current.hoveredPinId ?? propsRef.current.selectedPinId;

    for (const marker of markers as MapMarker[]) {
      if (marker.type === 'pin') {
        const isHighlighted = marker.id === highlightId;
        const kakaoMarker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(marker.lat, marker.lng),
          image: new window.kakao.maps.MarkerImage(
            isHighlighted ? PIN_ICON_SELECTED : PIN_ICON_DEFAULT,
            new window.kakao.maps.Size(
              (isHighlighted ? PIN_SIZE_SELECTED : PIN_SIZE_DEFAULT).width,
              (isHighlighted ? PIN_SIZE_SELECTED : PIN_SIZE_DEFAULT).height,
            ),
          ),
        });
        kakaoMarker.setMap(map);
        window.kakao.maps.event.addListener(kakaoMarker, 'click', () => propsRef.current.onPinClick(marker.id));
        window.kakao.maps.event.addListener(kakaoMarker, 'mouseover', () => propsRef.current.onPinHover(marker.id));
        window.kakao.maps.event.addListener(kakaoMarker, 'mouseout', () => propsRef.current.onPinHover(null));
        markersRef.current.set(marker.id, kakaoMarker);
      } else {
        const isHighlighted = highlightId != null && leafToClusterId.get(highlightId) === marker.id;
        const content = document.createElement('div');
        content.textContent = String(marker.count);
        content.className = isHighlighted ? CLUSTER_BADGE_HIGHLIGHTED_CLASS : CLUSTER_BADGE_DEFAULT_CLASS;
        content.addEventListener('click', () => {
          map.setLevel(zoomToKakaoLevel(marker.expansionZoom), {
            anchor: new window.kakao.maps.LatLng(marker.lat, marker.lng),
          });
        });
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(marker.lat, marker.lng),
          content,
        });
        overlay.setMap(map);
        overlaysRef.current.set(marker.id, { overlay, content });
      }
    }

    prevHighlightRef.current = highlightId;
    // 의도적으로 deps 없음(안정적인 함수) — 강조값은 propsRef로 읽는다. 이래야
    // initMap에서 한 번만 등록되는 idle 리스너가 항상 "최신" renderMarkers를
    // 참조하게 된다(위 코멘트 참고).
  }, []);

  const initMap = useCallback(() => {
    if (!containerRef.current || !window.kakao?.maps || mapRef.current) return;
    const map = new window.kakao.maps.Map(containerRef.current, {
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      level: zoomToKakaoLevel(zoom),
    });
    mapRef.current = map;

    const reportIdleState = () => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const c = map.getCenter();
      propsRef.current.onIdle(
        { minLat: sw.getLat(), maxLat: ne.getLat(), minLng: sw.getLng(), maxLng: ne.getLng() },
        { lat: c.getLat(), lng: c.getLng() },
        kakaoLevelToZoom(map.getLevel()),
      );
      renderMarkers();
    };

    window.kakao.maps.event.addListener(map, 'idle', reportIdleState);
    renderMarkers();
    // 카카오맵이 생성 직후 'idle'을 안정적으로 쏘지 않는 경우가 실 브라우저
    // (/qa)에서 확인됐다 — 지도의 getBounds()/getCenter()/getLevel() 자체는
    // 생성 시점부터 이미 유효한 값을 돌려주므로, idle 이벤트를 기다리지 않고
    // 다음 프레임에 같은 로직을 한 번 직접 호출해서 첫 조회가 항상 일어나게
    // 한다. 이후의 실제 패닝/줌은 그대로 idle 이벤트로 처리된다.
    requestAnimationFrame(reportIdleState);
  }, [center, zoom, renderMarkers]);

  // 재방문 시(스크립트 재다운로드 없이) window.kakao가 이미 있으면 마운트
  // 시점에 바로 초기화한다 — onReady는 next/script가 "로드 후 + 마운트마다"
  // 불러주지만, 테스트 등 window.kakao가 먼저 세팅된 환경도 같은 경로를 타게.
  useEffect(() => {
    if (window.kakao?.maps && !mapRef.current) {
      initMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀 데이터가 바뀌면(새 쿼리 결과) 마커를 다시 그린다.
  useEffect(() => {
    if (mapRef.current) renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // 강조(hover/선택)만 바뀌면 마커 2개(이전/새)만 이미지 교체 — 전체 재생성 안 함.
  useEffect(() => {
    const highlightId = hoveredPinId ?? selectedPinId;
    const prevId = prevHighlightRef.current;
    if (prevId === highlightId) return;
    if (prevId) {
      const prevMarker = markersRef.current.get(prevId);
      prevMarker?.setImage(
        new window.kakao.maps.MarkerImage(PIN_ICON_DEFAULT, new window.kakao.maps.Size(PIN_SIZE_DEFAULT.width, PIN_SIZE_DEFAULT.height)),
      );
      const prevClusterId = leafToClusterIdRef.current.get(prevId);
      if (prevClusterId != null) {
        const entry = overlaysRef.current.get(prevClusterId);
        if (entry) entry.content.className = CLUSTER_BADGE_DEFAULT_CLASS;
      }
    }
    if (highlightId) {
      const newMarker = markersRef.current.get(highlightId);
      if (newMarker) {
        newMarker.setImage(
          new window.kakao.maps.MarkerImage(PIN_ICON_SELECTED, new window.kakao.maps.Size(PIN_SIZE_SELECTED.width, PIN_SIZE_SELECTED.height)),
        );
      } else {
        const clusterId = leafToClusterIdRef.current.get(highlightId);
        if (clusterId != null) {
          const entry = overlaysRef.current.get(clusterId);
          if (entry) entry.content.className = CLUSTER_BADGE_HIGHLIGHTED_CLASS;
        }
      }
    }
    prevHighlightRef.current = highlightId;
  }, [hoveredPinId, selectedPinId]);

  useImperativeHandle(ref, () => ({
    relayout() {
      mapRef.current?.relayout();
    },
  }));

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false`}
        strategy="afterInteractive"
        onReady={() => {
          window.kakao.maps.load(() => {
            initMap();
          });
        }}
      />
    </div>
  );
}
