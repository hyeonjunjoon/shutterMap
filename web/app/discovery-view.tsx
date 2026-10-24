'use client';

import { useQueryState } from 'nuqs';
import { viewParser, VIEW_OPTIONS, type DiscoveryView as DiscoveryViewType } from '@/lib/discovery-params';
import { FilterBar } from './filter-bar';
import { GalleryView } from './gallery-view';
import { MapView } from './map-view';

const TAB_LABEL: Record<DiscoveryViewType, string> = {
  gallery: '갤러리',
  map: '지도',
};

export function DiscoveryView() {
  const [view, setView] = useQueryState('view', viewParser);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div role="tablist" className="flex gap-2">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className="h-11 touch-manipulation rounded-lg px-3 text-sm font-medium hover:bg-muted aria-selected:bg-secondary aria-selected:text-secondary-foreground aria-selected:hover:bg-secondary"
          >
            {TAB_LABEL[option]}
          </button>
        ))}
      </div>
      {view === 'map' ? (
        <MapView />
      ) : (
        <>
          <FilterBar />
          <GalleryView />
        </>
      )}
    </div>
  );
}
