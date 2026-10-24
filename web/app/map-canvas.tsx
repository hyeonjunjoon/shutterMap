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

  const propsRef = useRef({ pins, onIdle, onPinClick, onPinHover });
  propsRef.current = { pins, onIdle, onPinClick, onPinHover };

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

    const highlightId = hoveredPinId ?? selectedPinId;

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
        content.className = isHighlighted
          ? 'flex h-9 w-9 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground ring-2 ring-foreground'
          : 'flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background';
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
  }, [hoveredPinId, selectedPinId]);

  const initMap = useCallback(() => {
    if (!containerRef.current || !window.kakao?.maps || mapRef.current) return;
    const map = new window.kakao.maps.Map(containerRef.current, {
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      level: zoomToKakaoLevel(zoom),
    });
    mapRef.current = map;
    window.kakao.maps.event.addListener(map, 'idle', () => {
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
    });
    renderMarkers();
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
        if (entry) entry.content.className = 'flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background';
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
          if (entry) entry.content.className = 'flex h-9 w-9 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground ring-2 ring-foreground';
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
