import type { NormalizedDiscoveryFilters } from './discovery-params';

// 쿼리 키를 한 곳에서 관리한다 — 다음 플랜(탐색/상세/업로드/마이페이지)이 각자
// 다른 모양의 키를 발명하면 캐시 무효화가 어긋난다.
//
// cursor/페이지 파라미터는 절대 키에 넣지 않는다 — useInfiniteQuery는 키를
// 하나로 고정하고 cursor를 queryFn의 pageParam 인자로만 받는다. 키에 cursor를
// 넣으면 페이지마다 별도 캐시 엔트리가 생겨서 useInfiniteQuery의 pages 배열
// 누적을 못 쓰게 된다(예: 마이페이지 목록, 갤러리 무한스크롤이 여기 해당).
// 필터 객체는 키에 넣는 게 맞다 — 필터가 바뀌면 실제로 다른 쿼리니까.
export const queryKeys = {
  me: ['me'] as const,
  discovery: {
    gallery: (filters: NormalizedDiscoveryFilters) => ['discovery', 'gallery', filters] as const,
    equipment: ['discovery', 'equipment'] as const,
  },
};
