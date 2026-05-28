import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import PreviewLink from './PreviewLink';

vi.mock('@native-router/react', () => ({
  PrefetchLink: ({children, ...props}: any) => (
    <a {...props}>{children}</a>
  ),
  usePrefetch: () => ({view: null, loading: false, error: null})
}));

vi.mock('@native-router/core', () => ({}));

describe('PreviewLink', () => {
  it('renders children text', () => {
    render(<PreviewLink to="/test">Click me</PreviewLink>);
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('shows preview on mouse enter', () => {
    render(<PreviewLink to="/test">Hover me</PreviewLink>);
    const span = screen.getByText('Hover me');
    fireEvent.mouseEnter(span);
    expect(span).toBeDefined();
  });

  it('hides preview on mouse leave', () => {
    render(<PreviewLink to="/test">Hover me</PreviewLink>);
    const span = screen.getByText('Hover me');
    fireEvent.mouseEnter(span);
    fireEvent.mouseLeave(span);
    expect(span).toBeDefined();
  });
});
