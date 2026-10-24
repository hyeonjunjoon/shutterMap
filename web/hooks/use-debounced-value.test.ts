import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the initial value until the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: { sort: 'latest' | 'likes' } }) => useDebouncedValue(value, 300),
      { initialProps: { value: { sort: 'latest' } } },
    );
    expect(result.current).toEqual({ sort: 'latest' });

    rerender({ value: { sort: 'likes' } });
    expect(result.current).toEqual({ sort: 'latest' }); // 아직 안 바뀜

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toEqual({ sort: 'latest' });

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ sort: 'likes' });
  });

  it('resets the timer on each change (rapid updates collapse into one)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 3 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(1); // 300ms 다 안 지남(매번 리셋)

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(3); // 1을 건너뛰고 마지막 값만 반영
  });

  it('does not restart the timer when a referentially-new but deeply-equal value arrives', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: { a: 1 } },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toEqual({ a: 1 });

    rerender({ value: { a: 1 } }); // 새 객체, 값은 동일
    act(() => vi.advanceTimersByTime(1));
    // 타이머가 다시 돌지 않았어야 하므로 여전히 안정 상태
    rerender({ value: { a: 2 } });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toEqual({ a: 1 });
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ a: 2 });
  });
});
