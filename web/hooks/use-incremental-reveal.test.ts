import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIncrementalReveal } from './use-incremental-reveal';

describe('useIncrementalReveal', () => {
  it('starts with the first pageSize items visible', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const { result } = renderHook(() => useIncrementalReveal(items, 40));
    expect(result.current.visibleItems).toHaveLength(40);
    expect(result.current.hasMore).toBe(true);
  });

  it('revealMore() shows pageSize more items', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const { result } = renderHook(() => useIncrementalReveal(items, 40));
    act(() => result.current.revealMore());
    expect(result.current.visibleItems).toHaveLength(80);
  });

  it('hasMore is false once every item is visible', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const { result } = renderHook(() => useIncrementalReveal(items, 40));
    expect(result.current.visibleItems).toHaveLength(10);
    expect(result.current.hasMore).toBe(false);
  });

  it('revealUpTo(index) shows at least up to that index (for scrolling to a specific item)', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const { result } = renderHook(() => useIncrementalReveal(items, 40));
    act(() => result.current.revealUpTo(55));
    expect(result.current.visibleItems.length).toBeGreaterThanOrEqual(56);
  });

  it('revealUpTo never shrinks visibleCount below what it already was', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const { result } = renderHook(() => useIncrementalReveal(items, 40));
    act(() => result.current.revealMore()); // 80
    act(() => result.current.revealUpTo(5)); // index 5는 이미 보임 — 줄어들면 안 됨
    expect(result.current.visibleItems).toHaveLength(80);
  });

  it('resets visibleCount to pageSize when the items array reference changes', () => {
    const { result, rerender } = renderHook(({ items }) => useIncrementalReveal(items, 40), {
      initialProps: { items: Array.from({ length: 100 }, (_, i) => i) },
    });
    act(() => result.current.revealMore());
    expect(result.current.visibleItems).toHaveLength(80);

    rerender({ items: Array.from({ length: 100 }, (_, i) => i + 1000) }); // 새 배열(참조 다름)
    expect(result.current.visibleItems).toHaveLength(40);
  });
});
