import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { MapPinList, type MapPinListHandle } from './map-pin-list';
import type { MapPin } from '@/lib/map-clusters';

// jsdom은 IntersectionObserver가 없다 — observe()를 호출하면 콜백을 캡처해두고
// 테스트에서 직접 그 콜백을 불러 "교차함"을 시뮬레이션한다(gallery-view.test.tsx와 동일 패턴).
beforeEach(() => {
  class MockIntersectionObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }
  // @ts-expect-error jsdom 테스트 전용 스텁
  global.IntersectionObserver = MockIntersectionObserver;
});

const pins: MapPin[] = [
  { id: 'a', lat: 37.5, lng: 127.0, thumbnailUrl: 'https://x/a.jpg' },
  { id: 'b', lat: 37.6, lng: 127.1, thumbnailUrl: 'https://x/b.jpg' },
];

describe('MapPinList', () => {
  it('shows the empty-state message when there are no pins', () => {
    render(<MapPinList pins={[]} hoveredPinId={null} selectedPinId={null} onHoverPin={() => {}} />);
    expect(screen.getByText('아직 이 조건에 맞는 사진이 없습니다')).toBeDefined();
  });

  it('renders a link per pin, pointing at its detail page', () => {
    render(<MapPinList pins={pins} hoveredPinId={null} selectedPinId={null} onHoverPin={() => {}} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveProperty('href', expect.stringContaining('/photos/a'));
  });

  it('calls onHoverPin on mouse enter/leave and on focus/blur alike', async () => {
    const onHoverPin = vi.fn();
    const user = userEvent.setup();
    render(<MapPinList pins={pins} hoveredPinId={null} selectedPinId={null} onHoverPin={onHoverPin} />);
    const [firstLink] = screen.getAllByRole('link');

    await user.hover(firstLink);
    expect(onHoverPin).toHaveBeenCalledWith('a');
    await user.unhover(firstLink);
    expect(onHoverPin).toHaveBeenCalledWith(null);

    onHoverPin.mockClear();
    firstLink.focus();
    expect(onHoverPin).toHaveBeenCalledWith('a');
    firstLink.blur();
    expect(onHoverPin).toHaveBeenCalledWith(null);
  });

  it('marks the hovered or selected pin as selected (hovered wins over selected)', () => {
    render(<MapPinList pins={pins} hoveredPinId="b" selectedPinId="a" onHoverPin={() => {}} />);
    const links = screen.getAllByRole('link');
    expect(links[0].getAttribute('data-selected')).toBe('false'); // a: selected지만 hover가 b라 밀림
    expect(links[1].getAttribute('data-selected')).toBe('true'); // b: hovered
  });

  it('scrollToPin via the imperative handle reveals the item (if beyond the current page) and scrolls to it', () => {
    const manyPins: MapPin[] = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      lat: 37.5,
      lng: 127.0,
      thumbnailUrl: `https://x/p${i}.jpg`,
    }));
    const ref = createRef<MapPinListHandle>();
    render(<MapPinList ref={ref} pins={manyPins} hoveredPinId={null} selectedPinId={null} onHoverPin={() => {}} />);

    // 초기 40개만 렌더 — index 45는 아직 없음.
    expect(screen.queryAllByRole('link')).toHaveLength(40);

    act(() => ref.current?.scrollToPin('p45'));
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(46);
  });
});
