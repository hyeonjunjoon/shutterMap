export interface PhotoDetail {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  servingUrl: string;
}

export function PhotoDetailCard({ photo }: { photo: PhotoDetail }) {
  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* 치수를 모르므로(width/height 미저장, TODOS.md 기록) Next의 최적화
          <Image>(width/height 또는 fill 필요) 대신 원본 비율 그대로 렌더링하는
          일반 <img>를 쓴다. */}
      <img
        src={photo.servingUrl}
        alt=""
        style={{ width: '100%', height: 'auto' }}
        className="rounded-[var(--radius-photo)]"
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm tabular-nums">
        <dt className="text-muted-foreground">카메라</dt>
        <dd>{photo.cameraName ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">렌즈</dt>
        <dd>{photo.lensName ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">초점거리</dt>
        <dd>{photo.focalLength != null ? `${photo.focalLength}mm` : '정보 없음'}</dd>
        <dt className="text-muted-foreground">조리개</dt>
        <dd>{photo.aperture != null ? `F${photo.aperture}` : '정보 없음'}</dd>
        <dt className="text-muted-foreground">셔터스피드</dt>
        <dd>{photo.shutterSpeed ?? '정보 없음'}</dd>
        <dt className="text-muted-foreground">ISO</dt>
        <dd>{photo.iso ?? '정보 없음'}</dd>
      </dl>
    </main>
  );
}
