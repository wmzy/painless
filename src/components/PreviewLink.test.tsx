import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useControl} from 'react-use-control';

import {useTitle} from '@/util/useTitle';

const state = vi.hoisted(() => {
  const s: {view: ReactNode | null; loading: boolean; error: unknown} = {
    view: null,
    loading: true,
    error: null
  };
  return s;
});

vi.mock('@native-router/react', () => ({
  TypedLink: ({children, ...props}: any) => <a {...props}>{children}</a>,
  usePrefetch: () => ({view: state.view, loading: state.loading, error: state.error})
}));

vi.mock('@native-router/core', () => ({}));

// PreviewLink 的面板开合用 react-use-control（非受控），真模块为纯 ESM，
// vitest 下直接加载，无需替身
// Import after mocks
const PreviewLink = (await import('./PreviewLink')).default;

// 编译期反向用例（tsc --noEmit 守门，vitest 本身不跑类型检查）：
// PreviewLink 已收敛 TypedLink<AppRoutes> 表形态——运行时拼接的目标
// 字符串不在表内必须编译期报错（to+params 字面量才是合法形态）；search
// 载荷同受表形态判别（按目标模式 schema 的 Input 位，如 '/' 的
// HomeSearchInput），拼错字段编译期报。两段探针均只 createElement
//（mock 的 TypedLink 不渲染），零副作用。
const slug = 'slug';
const runtimePath = `/article/${slug}`;
(
  // @ts-expect-error to 必须是表内模式字面量，动态段走 params
  <PreviewLink to={runtimePath}>never</PreviewLink>
);
// search 判别穿透 props 包装层（& visible 的交叉不拆判别联合）；
// offset/limit 的 number/string 均合法（序列化时 String() 化）
<PreviewLink to='/' search={{tag: 'a', offset: '10', limit: 20}} />;
(
  // @ts-expect-error search 字段拼错应在编译期报错（HomeSearchInput 位）
  <PreviewLink to='/' search={{ofset: '10'}} />
);

// 预览浮层挂载的是完整目标视图（含其 useTitle 调用）：本探针代表
// 任何会写 document.title 的视图，标题写入应被浮层作用域静默
function TitleProbe() {
  useTitle('Probe · Painless');
  return <p>probe-body</p>;
}

// navigator.connection stub：defineProperty + configurable，嵌套
// describe 的 afterEach 里 delete 摘除，不污染同文件其他用例
//（jsdom 的 navigator 本无该属性）
function stubConnection(saveData: boolean) {
  Object.defineProperty(navigator, 'connection', {
    value: {saveData},
    configurable: true
  });
}

describe('PreviewLink', () => {
  beforeEach(() => {
    state.view = null;
    state.loading = true;
    state.error = null;
  });

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

  describe('saveData guard', () => {
    afterEach(() => {
      // 摘除 stub（对未 stub 的用例幂等），同文件其他用例不受污染
      delete (navigator as Navigator & {connection?: unknown}).connection;
    });

    it('drops the default viewport prefetch when saveData is on', () => {
      stubConnection(true);
      render(
        <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
          Guarded
        </PreviewLink>
      );
      // 断言面同既有 prefetch 用例：mock TypedLink 把透传 props 铺到
      // <a>；prefetch 置 undefined（未声明）则无该属性——TypedLink 走
      // 普通链接路径（不经 PrefetchLink），滚入视口/挂载后零
      // router.preload
      const link = screen.getByText('Guarded').closest('a');
      expect(link?.getAttribute('prefetch')).toBeNull();
    });

    it('drops an explicitly passed prefetch when saveData is on', () => {
      // 守卫拦的是投机流量全量面：显式传入也只是模板作者意图而非
      // 用户意图，与缺省值同样拦
      stubConnection(true);
      render(
        <PreviewLink
          to='/article/:title'
          params={{title: 'how-to'}}
          prefetch='render'
        >
          Explicit
        </PreviewLink>
      );
      const link = screen.getByText('Explicit').closest('a');
      expect(link?.getAttribute('prefetch')).toBeNull();
    });

    it('keeps default viewport prefetch when saveData is off', () => {
      stubConnection(false);
      render(
        <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
          Unmetered
        </PreviewLink>
      );
      const link = screen.getByText('Unmetered').closest('a');
      expect(link?.getAttribute('prefetch')).toBe('viewport');
    });

    it('keeps default viewport prefetch without a connection API', () => {
      // 旧环境降级对照：无 connection 属性 → saveData 天然 undefined
      // → 不拦（同 About feed 哨兵 IntersectionObserver 的降级惯例）
      render(
        <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
          Legacy
        </PreviewLink>
      );
      const link = screen.getByText('Legacy').closest('a');
      expect(link?.getAttribute('prefetch')).toBe('viewport');
    });
  });

  it('keeps the preview layer decorative: aria-hidden + inert', () => {
    // 迁移 haze-ui Popover 批保留的 a11y 契约：预览渲染完整目标视图
    //（链接/按钮天然 tabbable），必须整体对 AT 隐身（aria-hidden）并
    // 移出 Tab 序（inert，React 19 落为 DOM 属性）——两层缺一，键盘/
    // 读屏用户都会落进「看不见也听不见」的可聚焦内容。断言钉在
    // data-testid（外层面板：e2e 同一定位锚）
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Hover me
      </PreviewLink>
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    const layer = screen.getByTestId('preview-overlay');
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

  it('hover renders the target view without rewriting document.title', () => {
    document.title = 'Home · Painless';
    state.loading = false;
    state.view = <TitleProbe />;
    render(
      <PreviewLink to='/article/:title' params={{title: 'how-to'}}>
        Hover me
      </PreviewLink>
    );

    fireEvent.mouseEnter(screen.getByText('Hover me'));
    // 浮层内是完整视图复制品（probe 调用 useTitle）：TitleWriteContext
    // 关闭其页标题写，悬停期间与移出后标签页标题都保持入口值
    expect(screen.getByText('probe-body')).toBeDefined();
    expect(document.title).toBe('Home · Painless');

    fireEvent.mouseLeave(screen.getByText('Hover me'));
    expect(document.title).toBe('Home · Painless');
  });
});
