import { useEffect, useState } from 'react';

export function useIncrementalReveal<T>(items: T[], pageSize = 40) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  // items 배열 참조가 바뀌면(예: 뷰포트가 바뀌어 필터링된 핀 목록이 새로
  // 계산되면) pageSize로 리셋한다. 호출부가 useMemo로 "내용이 실제로 바뀔
  // 때만" 새 참조를 주는 걸 전제로 한다.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    revealMore: () => setVisibleCount((prev) => prev + pageSize),
    revealUpTo: (index: number) => setVisibleCount((prev) => Math.max(prev, index + 1)),
  };
}
