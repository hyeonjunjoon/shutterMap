'use client';

import { useState } from 'react';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, type GallerySort } from '@/lib/discovery-params';
import { useEquipment } from '@/hooks/use-equipment';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from '@/components/ui/drawer';

const selectClassName =
  'h-11 w-full touch-manipulation rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50';

function FilterFields() {
  const [filters, setFilters] = useQueryStates(discoveryFilterParsers);
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="filter-camera">카메라</Label>
        <select
          id="filter-camera"
          disabled={equipmentLoading}
          value={filters.cameraName ?? ''}
          onChange={(e) => setFilters({ cameraName: e.target.value || null })}
          className={selectClassName}
        >
          <option value="">전체</option>
          {equipment?.cameraNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-lens">렌즈</Label>
        <select
          id="filter-lens"
          disabled={equipmentLoading}
          value={filters.lensName ?? ''}
          onChange={(e) => setFilters({ lensName: e.target.value || null })}
          className={selectClassName}
        >
          <option value="">전체</option>
          {equipment?.lensNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-min-focal">초점거리 최소(mm)</Label>
          <Input
            id="filter-min-focal"
            type="number"
            value={filters.minFocalLength ?? ''}
            onChange={(e) => setFilters({ minFocalLength: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max-focal">초점거리 최대(mm)</Label>
          <Input
            id="filter-max-focal"
            type="number"
            value={filters.maxFocalLength ?? ''}
            onChange={(e) => setFilters({ maxFocalLength: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-min-aperture">조리개 최소(F)</Label>
          <Input
            id="filter-min-aperture"
            type="number"
            step="0.1"
            value={filters.minAperture ?? ''}
            onChange={(e) => setFilters({ minAperture: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max-aperture">조리개 최대(F)</Label>
          <Input
            id="filter-max-aperture"
            type="number"
            step="0.1"
            value={filters.maxAperture ?? ''}
            onChange={(e) => setFilters({ maxAperture: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-sort">정렬</Label>
        <select
          id="filter-sort"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as GallerySort })}
          className={selectClassName}
        >
          <option value="latest">최신순</option>
          <option value="likes">좋아요순</option>
        </select>
      </div>
    </div>
  );
}

export function FilterBar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* 데스크톱/태블릿: 인라인 필터 바 */}
      <div className="hidden md:block">
        <FilterFields />
      </div>
      {/* 모바일: "필터" 버튼 → 바텀시트(드래그로 닫기 지원은 Drawer 기본 동작) */}
      <div className="md:hidden">
        <Drawer open={open} onOpenChange={setOpen}>
          {/* DrawerTrigger는 asChild를 지원하지 않고 자체적으로 <button>을
              렌더링한다 — Button으로 감싸는 대신 buttonVariants 클래스를
              직접 입힌다. */}
          <DrawerTrigger className={buttonVariants({ variant: 'outline' })}>필터</DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>필터</DrawerTitle>
            <div className="px-4 pb-4">
              <FilterFields />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
