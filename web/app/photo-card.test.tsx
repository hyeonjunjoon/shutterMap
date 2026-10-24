import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoCard, PhotoCardSkeleton } from './photo-card';
import type { GalleryPhoto } from '@/lib/discovery-api';

const photo: GalleryPhoto = {
  id: 'p1',
  cameraName: 'ILCE-7M4',
  lensName: 'FE 24-70mm F2.8 GM',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  likeCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PhotoCard', () => {
  it('links to the photo detail page', () => {
    render(<PhotoCard photo={photo} />);
    expect(screen.getByRole('link')).toHaveProperty('href', expect.stringContaining('/photos/p1'));
  });

  it('shows camera name, lens name, and like count', () => {
    render(<PhotoCard photo={photo} />);
    expect(screen.getByText('ILCE-7M4')).toBeDefined();
    expect(screen.getByText('FE 24-70mm F2.8 GM')).toBeDefined();
    expect(screen.getByText('좋아요 3')).toBeDefined();
  });

  it('falls back to a placeholder when cameraName is null', () => {
    render(<PhotoCard photo={{ ...photo, cameraName: null }} />);
    expect(screen.getByText('카메라 정보 없음')).toBeDefined();
  });
});

describe('PhotoCardSkeleton', () => {
  it('renders without crashing', () => {
    render(<PhotoCardSkeleton />);
  });
});
