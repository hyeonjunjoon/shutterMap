import Link from 'next/link';
import type { GalleryPhoto } from '@/lib/discovery-api';

export function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  return (
    <Link
      href={`/photos/${photo.id}`}
      className="block touch-manipulation overflow-hidden rounded-[var(--radius-photo)] border border-border transition-opacity hover:opacity-80"
    >
      {/* width/height를 DB에 저장하지 않아 원본 비율을 모른다(TODOS.md 기록) —
          고정 4:3 컨테이너 + object-contain(크롭 없이 레터박스)으로 이 갭을
          피한다. 스켈레톤도 같은 비율이라 레이아웃 시프트가 생기지 않는다. */}
      <div className="aspect-[4/3] bg-muted">
        <img src={photo.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
      </div>
      <div className="space-y-0.5 p-2 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">{photo.cameraName ?? '카메라 정보 없음'}</p>
        {photo.lensName && <p className="truncate">{photo.lensName}</p>}
        <p>좋아요 {photo.likeCount}</p>
      </div>
    </Link>
  );
}

export function PhotoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-photo)] border border-border">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-1.5 p-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
