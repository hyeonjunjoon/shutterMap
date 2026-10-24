import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { PhotoDetailCard, type PhotoDetail } from './photo-detail-card';

// Next 16 Cache Components: 동적 라우트에서 params를 컴포넌트 최상단에서
// await하면 전체 prerender가 막힌다("uncached or runtime data during
// prerendering") — params를 쓰는 부분을 별도 async 컴포넌트로 빼서
// <Suspense>로 감싸야 정적 셸(shell)은 그대로 prerender되고, 실제 데이터는
// 요청 시점에 스트리밍된다(공식 마이그레이션 가이드: "Await params inside
// Suspense").
export default function PhotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <PhotoDetailFetcher params={params} />
    </Suspense>
  );
}

export async function PhotoDetailFetcher({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let photo: PhotoDetail;
  try {
    photo = await apiClient<PhotoDetail>(`/photos/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <PhotoDetailCard photo={photo} />;
}
