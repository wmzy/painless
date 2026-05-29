import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

vi.mock('@native-router/react', () => ({
  PrefetchLink: ({children, ...props}: any) => (
    <a {...props}>{children}</a>
  ),
  usePrefetch: () => ({view: null, loading: false, error: null})
}));

vi.mock('@native-router/core', () => ({}));

vi.mock('haze-ui', () => ({
  useControl: (initial: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react') as typeof import('react');
    return React.useState(initial);
  }
}));

// Import after mocks
const PreviewLink = (await import('./PreviewLink')).default;

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
