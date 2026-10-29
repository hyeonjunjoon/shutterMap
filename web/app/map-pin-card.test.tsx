import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapPinCard } from './map-pin-card';
import type { MapPin } from '@/lib/map-clusters';

const pin: MapPin = { id: 'a', lat: 37.5, lng: 127.0, thumbnailUrl: 'https://x/a.jpg' };

describe('MapPinCard', () => {
  it('links to the photo detail page and shows its thumbnail', () => {
    const { container } = render(<MapPinCard pin={pin} />);
    const link = screen.getByRole('link');
    expect(link).toHaveProperty('href', expect.stringContaining('/photos/a'));
    // alt=""인 장식용 이미지라 role="presentation"이 돼서 getByRole('img')로
    // 못 찾는다(ARIA 사양상 정상 동작, PhotoCard/MapPinList와 동일한 패턴).
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x/a.jpg');
  });
});
