import { Suspense } from 'react';
import { DiscoveryView } from './discovery-view';

export default function Home() {
  // DiscoveryView는 nuqs(내부적으로 useSearchParams)를 쓴다 — Next.js는 이걸
  // 쓰는 컴포넌트를 Suspense로 감싸도록 요구한다.
  return (
    <Suspense fallback={null}>
      <DiscoveryView />
    </Suspense>
  );
}
