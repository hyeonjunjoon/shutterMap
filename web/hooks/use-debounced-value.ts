import { useEffect, useRef, useState } from 'react';

// 값을 JSON으로 직렬화해 비교한다 — 매 렌더마다 새로 만들어지는 객체(참조는
// 다르지만 내용은 같은 경우, 예: normalizeDiscoveryFilters의 결과)가 타이머를
// 불필요하게 리셋하지 않게 하기 위함이다.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const serialized = JSON.stringify(value);
  const lastSerializedRef = useRef(serialized);

  useEffect(() => {
    if (serialized === lastSerializedRef.current) return;
    const timer = setTimeout(() => {
      lastSerializedRef.current = serialized;
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, delayMs]);

  return debounced;
}
