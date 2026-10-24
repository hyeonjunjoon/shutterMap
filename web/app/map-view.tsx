'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import {
  discoveryFilterParsers,
  monthParser,
  mapViewStateParsers,
  normalizeMapFilters,
} from '@/lib/discovery-params';
import { fetchMapPins } from '@/lib/discovery-map-api';
import { queryKeys } from '@/lib/query-keys';
import { padBounds, isWithinBounds, type LatLngBounds } from '@/lib/geo-convert';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { MapFilterBar } from './map-filter-bar';
import { MapPinList, type MapPinListHandle } from './map-pin-list';
import { MapCanvas, type MapCanvasHandle } from './map-canvas';
import { MapPinCard } from './map-pin-card';

const REQUEST_PADDING_RATIO = 0.2;
const MAX_MAP_RESULTS = 2000;
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const DEFAULT_ZOOM = 10;
const DRAWER_SNAP_POINTS = [0.15, 0.5];

export function MapView() {
  const [rawFilters] = useQueryStates({ ...discoveryFilterParsers, month: monthParser });
  const filters = normalizeMapFilters(rawFilters);
  const { month, ...sharedFilters } = filters;

  const [viewState, setViewState] = useQueryStates(mapViewStateParsers, { history: 'replace' });
  const center = { lat: viewState.lat ?? DEFAULT_CENTER.lat, lng: viewState.lng ?? DEFAULT_CENTER.lng };
  const zoom = viewState.zoom ?? DEFAULT_ZOOM;

  const [viewportBounds, setViewportBounds] = useState<LatLngBounds | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [drawerSnapPoint, setDrawerSnapPoint] = useState<number | string | null>(DRAWER_SNAP_POINTS[0]);

  const requestBounds = viewportBounds ? padBounds(viewportBounds, REQUEST_PADDING_RATIO) : null;

  const { data: pins = [] } = useQuery({
    queryKey: requestBounds ? queryKeys.discovery.map(requestBounds, sharedFilters) : ['discovery', 'map', 'pending'],
    queryFn: () => fetchMapPins(requestBounds!, sharedFilters, month),
    enabled: requestBounds !== null,
    placeholderData: keepPreviousData,
  });

  const filteredPins = useMemo(
    () => (viewportBounds ? pins.filter((pin) => isWithinBounds(pin, viewportBounds)) : []),
    [pins, viewportBounds],
  );
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;

  const pinListRef = useRef<MapPinListHandle>(null);
  const mapCanvasRef = useRef<MapCanvasHandle>(null);

  function handleIdle(bounds: LatLngBounds, newCenter: { lat: number; lng: number }, newZoom: number) {
    setViewportBounds(bounds);

    const roundedLat = Math.round(newCenter.lat * 1e5) / 1e5;
    const roundedLng = Math.round(newCenter.lng * 1e5) / 1e5;
    const roundedZoom = Math.round(newZoom);
    if (roundedLat === viewState.lat && roundedLng === viewState.lng && roundedZoom === viewState.zoom) {
      return;
    }
    setViewState({ lat: roundedLat, lng: roundedLng, zoom: roundedZoom });
  }

  function handlePinClick(id: string) {
    setSelectedPinId(id);
    pinListRef.current?.scrollToPin(id);
  }

  function togglePanel() {
    setPanelCollapsed((prev) => !prev);
    // 패널 크기가 바뀌면 지도 컨테이너 폭도 바뀐다 — relayout 안 하면 빈 칸/깨진
    // 타일로 렌더된다(카카오맵 공식 요구사항).
    requestAnimationFrame(() => mapCanvasRef.current?.relayout());
  }

  // 창 크기가 바뀌어도 지도 컨테이너 폭이 바뀐다 — 패널 토글과 같은 이유로 relayout.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => mapCanvasRef.current?.relayout(), 300);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  const isCapped = pins.length === MAX_MAP_RESULTS;

  return (
    <div
      className="grid h-[calc(100dvh-4rem)] grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr] md:data-[collapsed=true]:grid-cols-[0_1fr]"
      data-collapsed={panelCollapsed}
    >
      <div className={`hidden overflow-y-auto border-r border-border p-4 md:block ${panelCollapsed ? 'md:hidden' : ''}`}>
        <MapFilterBar />
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-medium">
            이 지역 사진 · {filteredPins.length}장
            {isCapped && <span className="ml-1 text-xs text-muted-foreground">(더 있을 수 있음, 확대해 보세요)</span>}
          </p>
        </div>
        <div className="mt-2">
          <MapPinList ref={pinListRef} pins={filteredPins} hoveredPinId={hoveredPinId} selectedPinId={selectedPinId} onHoverPin={setHoveredPinId} />
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={togglePanel}
          className="absolute left-2 top-2 z-10 hidden h-11 touch-manipulation rounded-lg border border-border bg-background px-3 text-sm md:block"
        >
          {panelCollapsed ? '패널 펼치기' : '패널 접기'}
        </button>
        <MapCanvas
          ref={mapCanvasRef}
          pins={pins}
          center={center}
          zoom={zoom}
          hoveredPinId={hoveredPinId}
          selectedPinId={selectedPinId}
          onIdle={handleIdle}
          onPinClick={handlePinClick}
          onPinHover={setHoveredPinId}
        />
      </div>

      {/* 모바일 전용: 지도는 전체화면(위 grid가 1열이라 왼쪽 패널은 숨겨짐), 핀을
          탭하면 이 Drawer가 peek 스냅포인트(15%)로 열려 카드를 보여준다. 데스크톱
          에서도 selectedPinId는 똑같이 바뀌지만 DrawerContent 자체를 md:hidden으로
          감춰서 보이지 않는다 — modal={false}라 배경 지도 조작을 막지 않는다. */}
      <Drawer
        open={selectedPinId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPinId(null);
        }}
        modal={false}
        snapPoints={DRAWER_SNAP_POINTS}
        snapPoint={drawerSnapPoint}
        onSnapPointChange={setDrawerSnapPoint}
      >
        <DrawerContent className="md:hidden">{selectedPin && <MapPinCard pin={selectedPin} />}</DrawerContent>
      </Drawer>
    </div>
  );
}
