import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useControl} from 'react-use-control';

vi.mock('@native-router/react', () => ({
  TypedLink: ({children, ...props}: any) => <a {...props}>{children}</a>,
  // loading: true 使受控用例可观察：visible=true 时 Preview 渲染
  // 'loading'（portal 到 body），对现有只断言链接本身的用例无影响
  usePrefetch: () => ({view: null, loading: true, error: null})
}));

vi.mock('@native-router/core', () => ({}));

// PreviewLink 的面板开合用 react-use-control（非受控），真模块为纯 ESM，
// vitest 下直接加载，无需替身
// Import after mocks
const PreviewLink = (await import('./PreviewLink')).default;

// 编译期反向用例（tsc --noEmit 守门，vitest 本身不跑类型检查）：
// PreviewLink 已收敛 TypedLink<AppPaths>——运行时拼接的目标字符串
// 不在路径联合里必须编译期报错（to+params 字面量才是合法形态）。
// 运行时仅 createElement（mock 的 TypedLink 不渲染），零副作用。
const slug = 'slug';
const runtimePath = `/article/${slug}`;
(
  // @ts-expect-error to 必须是 AppPaths 字面量，动态段走 params
  <PreviewLink to={runtimePath}>never</PreviewLink>
);

describe('PreviewLink', () => {
  it('renders children text', () => {
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Click me
      </PreviewLink>
    );
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('shows preview on mouse enter', () => {
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Hover me
      </PreviewLink>
    );
    const span = screen.getByText('Hover me');
    fireEvent.mouseEnter(span);
    expect(span).toBeDefined();
  });

  it('hides preview on mouse leave', () => {
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Hover me
      </PreviewLink>
    );
    const span = screen.getByText('Hover me');
    fireEvent.mouseEnter(span);
    fireEvent.mouseLeave(span);
    expect(span).toBeDefined();
  });

  it('passes an explicit prefetch prop through to TypedLink', () => {
    render(
      <PreviewLink
        to='/article/:title'
        params={{title: 'how-to'}}
        prefetch='render'
      >
        Render
      </PreviewLink>
    );
    // mock 的 TypedLink 把透传 props 铺到 <a> 上，据此断言透传成功
    const link = screen.getByText('Render').closest('a');
    expect(link?.getAttribute('prefetch')).toBe('render');
  });

  it('declares viewport prefetch when prefetch is not provided', () => {
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Default
      </PreviewLink>
    );
    // 本组件的既有调用语义（卡片滚入视口即预取）现在是缺省声明：
    // 调用点不再手传 prefetch，未覆盖时注入 'viewport'
    const link = screen.getByText('Default').closest('a');
    expect(link?.getAttribute('prefetch')).toBe('viewport');
  });

  it('keeps the preview layer decorative: aria-hidden + inert', () => {
    // 迁移 haze-ui Popover 批保留的 a11y 契约：预览渲染完整目标视图
    //（链接/按钮天然 tabbable），必须整体对 AT 隐身（aria-hidden）并
    // 移出 Tab 序（inert，React 19 落为 DOM 属性）——两层缺一，键盘/
    // 读屏用户都会落进「看不见也听不见」的可聚焦内容
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Hover me
      </PreviewLink>
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    const layer = screen.getByText('loading').closest('div')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.hasAttribute('inert')).toBe(true);
  });

  it('honors a controlled visible prop via control object', () => {
    // 触屏场景：宿主用自己的交互（此处以按钮代长按）驱动预览显隐，
    // 不依赖 hover/focus。visible 传 control 即受控，宿主 setVisible
    // 直接开关预览，状态为同一份（非拷贝）
    function Harness() {
      const [visible, setVisible, visibleCtrl] = useControl(undefined, false);
      return (
        <>
          <button onClick={() => setVisible((v) => !v)}>toggle-preview</button>
          <span data-testid="host-visible">{String(visible)}</span>
          <PreviewLink
            to='/article/:title'
            params={{title: 'how-to'}}
            visible={visibleCtrl}
          >
            Link
          </PreviewLink>
        </>
      );
    }

    render(<Harness />);
    // 初始隐藏：Preview 返回 null（portal 未挂 'loading'）
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByTestId('host-visible').textContent).toBe('false');

    // 宿主开预览
    fireEvent.click(screen.getByText('toggle-preview'));
    expect(screen.getByText('loading')).toBeDefined();
    expect(screen.getByTestId('host-visible').textContent).toBe('true');

    // 再关：预览卸载，宿主状态同步 false
    fireEvent.click(screen.getByText('toggle-preview'));
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByTestId('host-visible').textContent).toBe('false');
  });
});
