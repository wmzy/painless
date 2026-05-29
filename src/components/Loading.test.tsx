import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, act} from '@testing-library/react';

import Loading from './Loading';

vi.mock('@native-router/core', () => ({
  cancel: vi.fn()
}));

let mockLoading: {key?: string; status?: string} | undefined;
vi.mock('@native-router/react', () => ({
  useLoading: () => mockLoading,
  useRouter: () => ({})
}));

describe('Loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLoading = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when not loading', () => {
    render(<Loading />);
    expect(screen.queryByTestId('loading')).toBeNull();
  });

  it('renders progress bar when loading', () => {
    mockLoading = {key: '1', status: 'pending'};
    render(<Loading />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('loading')).toBeDefined();
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('progress bar has correct ARIA attributes', () => {
    mockLoading = {key: '1', status: 'pending'};
    render(<Loading />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
    expect(progressbar.getAttribute('aria-valuenow')).toBeDefined();
  });
});
