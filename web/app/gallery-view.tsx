'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, normalizeDiscoveryFilters } from '@/lib/discovery-params';
import { fetchGallery } from '@/lib/discovery-api';
import { queryKeys } from '@/lib/query-keys';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { PhotoCard, PhotoCardSkeleton } from './photo-card';

export function GalleryView() {
  const [rawFilters] = useQueryStates(discoveryFilterParsers);
  const { cameraName, lensName, sort, ...numericFilters } = normalizeDiscoveryFilters(rawFilters);
  // nuqs의 limitUrlUpdates 디바운스는 "URL/히스토리 쓰기"만 늦춘다 — 다른
  // useQueryStates 구독자(이 컴포넌트)로의 상태 전파는 즉시 일어난다(nuqs
  // emitter.emit이 디바운스보다 먼저 실행됨). 그래서 숫자 입력을 타이핑할
  // 때마다 바로 재요청이 나갔다 — 쿼리에 실제로 쓰는 값만 따로 디바운스한다.
  // 카메라/렌즈/정렬은 드롭다운 단건 선택이라 디바운스 없이 즉시 반영.
  const debouncedNumericFilters = useDebouncedValue(numericFilters, 300);
  const filters = { cameraName, lensName, sort, ...debouncedNumericFilters };

  const {
    data,
    isLoading,
    isError,
    isFetchNextPageError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.discovery.gallery(filters),
    queryFn: ({ pageParam }) => fetchGallery(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // 필터가 바뀌어도 새 쿼리가 끝날 때까지 이전 목록을 그대로 보여준다 —
    // 스켈레톤으로 깜빡이지 않고, 그리드(gridRef)도 계속 붙어있어서 아래
    // 스크롤 리셋 효과가 제대로 동작한다.
    placeholderData: keepPreviousData,
  });

  // sentinel이 로딩/에러 등으로 DOM에서 사라졌다가 다시 나타나도(또는 Next
  // Cache Components가 Activity로 컴포넌트를 숨겼다 다시 보여줘도) 콜백 ref는
  // 노드가 실제로 붙을 때마다 호출되므로 옵저버가 항상 올바른 노드에 다시
  // 붙는다(React 19: ref 콜백이 cleanup 함수를 반환할 수 있음).
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: '600px' },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const gridRef = useRef<HTMLDivElement>(null);
  // 정렬·필터가 실제로 바뀐 경우에만(마운트 시점/변화 없는 재실행 제외)
  // 스크롤을 맨 위로 — 그렇지 않으면 처음 진입 시에도 스크롤이 튀고, 다른
  // 페이지에서 뒤로가기로 돌아왔을 때도(Cache Components가 Activity로 이
  // 컴포넌트를 보존했다가 다시 보여주면 effect가 재실행된다) 필터가 그대로인데
  // 스크롤 위치를 잃는다.
  const filterKey = JSON.stringify(filters);
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    gridRef.current?.scrollIntoView({ block: 'start' });
  }, [filterKey]);

  // 데이터가 하나도 없는 첫 로딩(또는 전체 실패)만 전체 화면으로 처리한다 —
  // "다음 페이지" 요청 실패는 아래에서 그리드는 유지한 채 인라인으로 처리한다.
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          목록을 불러오지 못했습니다.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const photos = data?.pages.flatMap((page) => page.items) ?? [];

  if (photos.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">아직 이 조건에 맞는 사진이 없습니다</p>;
  }

  return (
    <div>
      <div ref={gridRef} className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} />
        ))}
      </div>
      {isFetchNextPageError ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <p role="alert" className="text-sm text-muted-foreground">
            다음 페이지를 불러오지 못했습니다.
          </p>
          <Button variant="outline" onClick={() => fetchNextPage()}>
            다시 시도
          </Button>
        </div>
      ) : (
        <div ref={sentinelRef} />
      )}
    </div>
  );
}
