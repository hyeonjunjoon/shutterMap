'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, normalizeDiscoveryFilters } from '@/lib/discovery-params';
import { fetchGallery } from '@/lib/discovery-api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { PhotoCard, PhotoCardSkeleton } from './photo-card';

export function GalleryView() {
  const [rawFilters] = useQueryStates(discoveryFilterParsers);
  const filters = normalizeDiscoveryFilters(rawFilters);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.discovery.gallery(filters),
    queryFn: ({ pageParam }) => fetchGallery(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 정렬·필터가 바뀌면(= 쿼리 키가 바뀌면) 그리드 스크롤을 맨 위로.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    gridRef.current?.scrollIntoView({ block: 'start' });
  }, [filterKey]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
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
      <div ref={sentinelRef} />
    </div>
  );
}
