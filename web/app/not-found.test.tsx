import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound', () => {
  it('shows a Korean not-found message and a link home', () => {
    render(<NotFound />);
    expect(screen.getByText('찾을 수 없습니다')).toBeDefined();
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveProperty('href', expect.stringContaining('/'));
  });
});
