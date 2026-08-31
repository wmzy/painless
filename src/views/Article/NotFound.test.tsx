// 来源：P2「/article/:title 路由级 errorComponent」任务新建。
// 归并建议：本文件测的是 src/views/Article/NotFound.tsx（路由级错误
// 组件），与 src/components/RouterError.test.tsx（全局错误组件）分属
// 不同组件与目录，不满足并入其 describe 的放置规则；若后续两者抽成
// 共享错误页组件，可将用例迁至 RouterError.test.tsx。
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

vi.mock('haze-ui', () => ({
  Card: ({children}: any) => <div>{children}</div>,
  Title: ({children}: any) => <h1>{children}</h1>,
  Text: ({children}: any) => <p>{children}</p>
}));

// 模拟 http 层 ApiError 的形状（带 status），覆盖 duck-typing 判别分支
function apiError(status: number, message: string): Error {
  const e = new Error(message);
  Object.assign(e, {status});
  return e;
}

describe('Article NotFound errorComponent', () => {
  it('should render heading and not-found hint on 404', () => {
    const error = apiError(404, 'Request failed with status code 404');
    render(<NotFound error={error} />);
    expect(screen.getByText('Article not found')).toBeDefined();
    expect(
      screen.getByText('The article does not exist or has been removed.')
    ).toBeDefined();
  });

  it('should render load-failure hint with error message on non-404', () => {
    const error = apiError(500, 'Internal Server Error');
    render(<NotFound error={error} />);
    expect(screen.getByText('Article not found')).toBeDefined();
    expect(
      screen.getByText('Failed to load the article: Internal Server Error')
    ).toBeDefined();
  });

  it('should render home link', () => {
    const error = new Error('Network Error');
    render(<NotFound error={error} />);
    const link = screen.getByText('Back to home');
    expect(link).toBeDefined();
    expect(link.closest('a')!.getAttribute('href')).toBe('/');
  });

  // useTitle 接入批：404 与加载失败共用标题（基线铺设见
  // Home/index.test.tsx 同款注释）
  it('document.title：进入设为 Not Found · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = render(<NotFound error={apiError(404, 'Request failed with status code 404')} />);

    expect(document.title).toBe('Not Found · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });
});
