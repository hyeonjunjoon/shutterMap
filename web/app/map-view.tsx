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
import { FilterBar } from './filter-bar';
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
    // filters(month 포함)를 키에 넣는다 — sharedFilters만 넣으면 month가
    // 바뀌어도 쿼리 키가 그대로라 새로 조회하지 않는다.
    queryKey: requestBounds ? queryKeys.discovery.map(requestBounds, filters) : ['discovery', 'map', 'pending'],
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
    // 카카오맵이 초기화 직후 degenerate(한 점짜리) bounds로 idle을 한 번 먼저
    // 쏘는 경우가 있다(/qa에서 실 브라우저로 확인) — 그대로 보내면 백엔드가
    // 400을 돌려준다. 백엔드의 유효성 조건과 대칭으로 무시한다.
    if (bounds.minLat >= bounds.maxLat || bounds.minLng >= bounds.maxLng) {
      return;
    }
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
    <div className="grid h-[calc(100dvh-4rem)] grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr]">
      {/* 접힘 상태는 grid-template-columns 자체를 바꾸는 대신(Tailwind의
          data-[attr=value]: 반응형 조합이 실 브라우저에서 두 칼럼 다 0폭으로
          깨지는 걸 /qa에서 확인함 — md:block/md:hidden 두 유틸리티 클래스가
          같은 breakpoint에서 소스 순서가 아니라 생성된 스타일시트 순서로
          캐스케이드되는 Tailwind 특유의 함정과 겹쳐서 grid 트랙 자체가 깨졌다)
          이 칸 자체를 폭 0으로 줄인다 — 트랙은 minmax(0,360px)라 내용에 맞춰
          0까지 줄어들 수 있다. */}
      <div
        className={
          panelCollapsed
            ? 'hidden md:block md:w-0 md:overflow-hidden'
            : 'hidden overflow-y-auto border-r border-border p-4 md:block'
        }
      >
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
        {/* 모바일: 지도 탭도 압축 필터(MapFilterBar)가 아니라 기존 FilterBar를
            그대로 쓴다(Global Constraint) — 데스크톱 피스는 바깥 md:hidden으로
            가려서 MapFilterBar와 중복되지 않게 한다. FilterBar의 "필터" 버튼은
            outline variant(거의 투명)라 원래 페이지의 불투명 배경 위에서만
            또렷하다 — 지도 위에 그대로 띄우면 사실상 안 보인다(/qa에서 실
            브라우저로 확인). 불투명 배경을 가진 래퍼로 감싼다. */}
        <div className="absolute left-2 top-2 z-10 rounded-lg bg-background p-1 shadow-md md:hidden">
          <FilterBar />
        </div>
        <button
          type="button"
          onClick={togglePanel}
          className="absolute left-2 top-2 z-10 hidden h-11 touch-manipulation rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted md:block"
        >
          {panelCollapsed ? '패널 펼치기' : '패널 접기'}
        </button>
        {/* 패널 안의 "더 있을 수 있음" 안내는 모바일/패널 접힘 상태에서는 안
            보인다 — 지도 위에도 같은 안내를 둔다(모바일은 항상, 데스크톱은
            패널이 접혔을 때만 — 펼쳐져 있을 때는 패널 안내와 중복이라 숨긴다). */}
        {isCapped && (
          <p
            className={`absolute right-2 top-2 z-10 rounded-lg bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow ${panelCollapsed ? '' : 'md:hidden'}`}
          >
            확대하면 더 많은 사진을 볼 수 있어요
          </p>
        )}
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
