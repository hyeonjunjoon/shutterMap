'use client';

import { useId } from 'react';
import { useQueryStates } from 'nuqs';
import { discoveryFilterParsers, monthParser } from '@/lib/discovery-params';
import { useEquipment } from '@/hooks/use-equipment';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { selectClassName } from './filter-bar';

export function MapFilterBar() {
  const idPrefix = useId();
  const [filters, setFilters] = useQueryStates({ ...discoveryFilterParsers, month: monthParser });
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.cameraName) chips.push({ key: 'camera', label: `카메라: ${filters.cameraName}`, clear: () => setFilters({ cameraName: null }) });
  if (filters.lensName) chips.push({ key: 'lens', label: `렌즈: ${filters.lensName}`, clear: () => setFilters({ lensName: null }) });
  if (filters.minFocalLength != null) chips.push({ key: 'minFocal', label: `초점거리 ${filters.minFocalLength}mm~`, clear: () => setFilters({ minFocalLength: null }) });
  if (filters.maxFocalLength != null) chips.push({ key: 'maxFocal', label: `~${filters.maxFocalLength}mm`, clear: () => setFilters({ maxFocalLength: null }) });
  if (filters.minAperture != null) chips.push({ key: 'minAperture', label: `조리개 F${filters.minAperture}~`, clear: () => setFilters({ minAperture: null }) });
  if (filters.maxAperture != null) chips.push({ key: 'maxAperture', label: `~F${filters.maxAperture}`, clear: () => setFilters({ maxAperture: null }) });
  if (filters.month != null) chips.push({ key: 'month', label: `${filters.month}월`, clear: () => setFilters({ month: null }) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-camera`}>카메라</Label>
          <select
            id={`${idPrefix}-camera`}
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
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-lens`}>렌즈</Label>
          <select
            id={`${idPrefix}-lens`}
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
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="flex h-7 touch-manipulation items-center gap-1 rounded-full border border-border px-2.5 text-xs hover:bg-muted"
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <details>
        <summary className="cursor-pointer touch-manipulation text-sm font-medium text-muted-foreground hover:text-foreground">
          상세 필터
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-month`}>촬영월</Label>
            <select
              id={`${idPrefix}-month`}
              value={filters.month ?? ''}
              onChange={(e) => setFilters({ month: e.target.value ? Number(e.target.value) : null })}
              className={selectClassName}
            >
              <option value="">전체</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-min-focal`}>초점거리 최소(mm)</Label>
              <Input
                id={`${idPrefix}-min-focal`}
                type="number"
                value={filters.minFocalLength ?? ''}
                onChange={(e) => setFilters({ minFocalLength: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-max-focal`}>초점거리 최대(mm)</Label>
              <Input
                id={`${idPrefix}-max-focal`}
                type="number"
                value={filters.maxFocalLength ?? ''}
                onChange={(e) => setFilters({ maxFocalLength: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-min-aperture`}>조리개 최소(F)</Label>
              <Input
                id={`${idPrefix}-min-aperture`}
                type="number"
                step="0.1"
                value={filters.minAperture ?? ''}
                onChange={(e) => setFilters({ minAperture: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-max-aperture`}>조리개 최대(F)</Label>
              <Input
                id={`${idPrefix}-max-aperture`}
                type="number"
                step="0.1"
                value={filters.maxAperture ?? ''}
                onChange={(e) => setFilters({ maxAperture: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
