import Link from 'next/link';
import type { MapPin } from '@/lib/map-clusters';

export function MapPinCard({ pin }: { pin: MapPin }) {
  return (
    <Link href={`/photos/${pin.id}`} className="flex touch-manipulation items-center gap-3 p-4">
      <div className="aspect-[4/3] w-24 overflow-hidden rounded-[var(--radius-photo)] bg-muted">
        <img src={pin.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
      </div>
      <span className="text-sm text-muted-foreground">사진 보기</span>
    </Link>
  );
}
