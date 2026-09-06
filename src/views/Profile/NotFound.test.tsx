// /profile/:username 的路由级 errorComponent（与 Article/NotFound 同构：
// 404 与加载失败共用组件）。用例口径对齐 Article/NotFound.test.tsx。
import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';

import NotFound from './NotFound';

vi.mock('@native-router/react', () => ({
  TypedLink: ({children, to, ...props}: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));

// 三件套最小 stub 隔离纯展示件；useTitle 走真实现（本视图消费，页
// 标题契约由库本体承担）
vi.mock('haze-ui', async () => {
  const {useTitle} = await vi.importActual<typeof import('haze-ui')>(
    'haze-ui'
  );
  return {
    useTitle,
    Card: ({children}: any) => <div>{children}</div>,
    Title: ({children}: any) => <h1>{children}</h1>,
    Text: ({children}: any) => <p>{children}</p>
  };
});

// 模拟 http 层 ApiError 的形状（带 status），覆盖 duck-typing 判别分支
function apiError(status: number, message: string): Error {
  const e = new Error(message);
  Object.assign(e, {status});
  return e;
}

describe('Profile NotFound errorComponent', () => {
  it('should render heading and not-found hint on 404', () => {
    const error = apiError(404, 'Request failed with status code 404');
    render(<NotFound error={error} />);
    expect(screen.getByText('Profile not found')).toBeDefined();
    expect(screen.getByText('The profile does not exist.')).toBeDefined();
  });

  it('should render load-failure hint with error message on non-404', () => {
    const error = apiError(500, 'Internal Server Error');
    render(<NotFound error={error} />);
    expect(screen.getByText('Profile not found')).toBeDefined();
    expect(
      screen.getByText('Failed to load the profile: Internal Server Error')
    ).toBeDefined();
  });

  it('should render home link', () => {
    const error = new Error('Network Error');
    render(<NotFound error={error} />);
    const link = screen.getByText('Back to home');
    expect(link).toBeDefined();
    expect(link.closest('a')!.getAttribute('href')).toBe('/');
  });

  it('document.title：进入设为 Not Found · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = render(
      <NotFound error={apiError(404, 'Request failed with status code 404')} />
    );

    expect(document.title).toBe('Not Found · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });
});
