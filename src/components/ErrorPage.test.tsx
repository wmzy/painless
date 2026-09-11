import {describe, it, expect, vi} from 'vitest';
import {render} from '@testing-library/react';

import ErrorPage from './ErrorPage';

// 同 RouterError.test：haze-ui 只 stub 到最小渲染面（不测库的纯展示渲染）
vi.mock('haze-ui', () => ({
  Text: ({children}: any) => <p>{children}</p>
}));

// jsdom 里无 @testing-library/jest-dom 匹配器（仓库测试无 setupFiles 注入），
// 焦点断言走 document.activeElement
describe('ErrorPage', () => {
  it('挂载后焦点移到主标题（SPA 视图切换的 SR/键盘可达性）', () => {
    render(<ErrorPage kicker='404' title='Page not found'>Nothing here.</ErrorPage>);
    const heading = document.activeElement;
    expect(heading?.tagName).toBe('H1');
    expect(heading?.textContent).toBe('Page not found');
  });

  it('标题可编程聚焦但不进 Tab 序（tabIndex=-1）', () => {
    render(<ErrorPage title='Error'>Boom.</ErrorPage>);
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });

  // errorComponent / notFound 随路由切换反复挂卸：重挂后焦点必须再次
  // 落回标题，且卸载不抛异常
  it('卸载重挂后焦点再次移到主标题', () => {
    const first = render(<ErrorPage title='First'>one</ErrorPage>);
    first.unmount();

    const second = render(<ErrorPage title='Second'>two</ErrorPage>);
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.textContent).toBe('Second');
    second.unmount();
  });
});
