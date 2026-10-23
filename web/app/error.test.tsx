import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalError from './error';

describe('GlobalError', () => {
  it('shows a Korean error message and calls reset on click', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    expect(screen.getByText('문제가 생겼어요')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
