'use client';

import { useEffect, useImperativeHandle, useRef } from 'react';
import Link from 'next/link';
import { useIncrementalReveal } from '@/hooks/use-incremental-reveal';
import type { MapPin } from '@/lib/map-clusters';

export interface MapPinListHandle {
  scrollToPin: (id: string) => void;
}

interface MapPinListProps {
  pins: MapPin[];
  hoveredPinId: string | null;
  selectedPinId: string | null;
  onHoverPin: (id: string | null) => void;
  ref?: React.Ref<MapPinListHandle>;
}

export function MapPinList({ pins, hoveredPinId, selectedPinId, onHoverPin, ref }: MapPinListProps) {
  const { visibleItems, hasMore, revealMore, revealUpTo } = useIncrementalReveal(pins, 40);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const sentinelRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToPin(id: string) {
      const index = pins.findIndex((p) => p.id === id);
      if (index === -1) return;
      revealUpTo(index);
      // 점진 렌더로 막 추가된 항목은 이 커밋에서 아직 DOM에 없을 수 있다 —
      // 다음 프레임으로 미룬다.
      requestAnimationFrame(() => {
        itemRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
      });
    },
  }));

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) revealMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, revealMore]);

  if (pins.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">아직 이 조건에 맞는 사진이 없습니다</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {visibleItems.map((pin) => {
          const isSelected = pin.id === (hoveredPinId ?? selectedPinId);
          return (
            <Link
              key={pin.id}
              ref={(node) => {
                if (node) itemRefs.current.set(pin.id, node);
                else itemRefs.current.delete(pin.id);
              }}
              href={`/photos/${pin.id}`}
              onMouseEnter={() => onHoverPin(pin.id)}
              onMouseLeave={() => onHoverPin(null)}
              onFocus={() => onHoverPin(pin.id)}
              onBlur={() => onHoverPin(null)}
              data-selected={isSelected}
              className="block touch-manipulation overflow-hidden rounded-[var(--radius-photo)] border border-border data-[selected=true]:border-foreground"
            >
              <div className="aspect-[4/3] bg-muted">
                <img src={pin.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
              </div>
            </Link>
          );
        })}
      </div>
      {hasMore && <div ref={sentinelRef} />}
    </div>
  );
}
