import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';

import RouterError from './RouterError';

vi.mock('@native-router/core', () => ({
  // 返回 Promise：产线对被取代/取消的 refresh reject NCE 挂了 .catch
  //（core 1.15 语义），undefined 会让按钮回调同步抛 TypeError
  refresh: vi.fn(async () => undefined)
}));

vi.mock('@native-router/react', () => ({
  TypedLink: ({children, to, ...props}: any) => (
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

  // stack 的 DEV 分支（vitest 环境 import.meta.env.DEV 恒 true）：
  // 开发期保留定位线索
  it('should render error stack trace (DEV)', () => {
    const error = new Error('Stack test');
    render(<RouterError error={error} />);
    const pre = document.querySelector('pre');
    expect(pre).toBeDefined();
    expect(pre!.textContent).toContain('Stack test');
  });

  // 生产分支（vi.stubEnv 关 DEV，同 useQuery.test 非 DEV 用例惯例）：
  // 只渲染 message + Refresh + Home，stack 整块不渲染——不向用户泄露
  // 文件路径/源码片段等内部信息
  it('生产模式不渲染 stack，仅保留 message 与操作项', () => {
    vi.stubEnv('DEV', false);
    try {
      const error = new Error('Prod leak check');
      render(<RouterError error={error} />);
      expect(screen.getByText('Prod leak check')).toBeDefined();
      expect(screen.getByText('Refresh')).toBeDefined();
      expect(screen.getByText('Home')).toBeDefined();
      expect(document.querySelector('pre')).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
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
