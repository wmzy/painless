import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';

import RouterError from './RouterError';

vi.mock('@native-router/core', () => ({
  refresh: vi.fn()
}));

vi.mock('@native-router/react', () => ({
  Link: ({children, to, ...props}: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({})
}));

vi.mock('haze-ui', () => ({
  Card: ({children}: any) => <div>{children}</div>,
  Title: ({children}: any) => <h1>{children}</h1>,
  Text: ({children}: any) => <p>{children}</p>,
  Button: ({children, onClick}: any) => (
    <button onClick={onClick}>{children}</button>
  )
}));

describe('RouterError', () => {
  it('should render error message', () => {
    const error = new Error('Test error');
    render(<RouterError error={error} />);
    expect(screen.getByText('Test error')).toBeDefined();
  });

  it('should render refresh button', () => {
    const error = new Error('Test error');
    render(<RouterError error={error} />);
    expect(screen.getByText('Refresh')).toBeDefined();
  });

  it('should render home link', () => {
    const error = new Error('Test error');
    render(<RouterError error={error} />);
    const link = screen.getByText('Home');
    expect(link).toBeDefined();
    expect(link.closest('a')!.getAttribute('href')).toBe('/');
  });

  it('should render error stack trace', () => {
    const error = new Error('Stack test');
    render(<RouterError error={error} />);
    const pre = document.querySelector('pre');
    expect(pre).toBeDefined();
    expect(pre!.textContent).toContain('Stack test');
  });

  it('should call refresh when refresh button is clicked', async () => {
    const {refresh} = await import('@native-router/core');
    const error = new Error('Click test');
    render(<RouterError error={error} />);
    const button = screen.getByText('Refresh');
    button.click();
    expect(refresh).toHaveBeenCalled();
  });
});
