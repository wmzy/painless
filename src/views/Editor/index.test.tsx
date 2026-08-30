// 来源：第 3 批评审任务——Editor 提交中状态（isSubmitting 防重复提交）与 tagList 事件适配。
// Editor 视图此前无测试文件，故新建。
// react-f0rm 0.5.0 + haze-ui 1.8.0 接入批：422 拒绝值改用鸭子形状普通对象
// （http 层错误升级为 fetch-fun HTTPError 后不再有可构造的 ApiError 类），
// 断言走 FormItem 渲染的字段错误 span 与 aria 接线。
// 提交链路 useMutation 批：提交走 services/article.saveArticle（内部仍
// http.post/put，mock 层不变），成功经 invalidates 失效共享 queryCache 的
// ['home']/['article'] 前缀条目——用 queryCache.set 预置条目断言被删。
import type {Article} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';


const state = vi.hoisted(() => ({
  article: undefined as Article | undefined,
  // 只需满足视图与 mock 内 navigate 的运行时使用；类型上放宽以匹配
  // core navigate 的 RouterInstance 形参（真注册不在单测范围，见下）
  router: {pathname: '/editor'} as any,
  // useBlocker 注册的离开拦截谓词：测试同步调用它模拟路由器在导航
  // 头部的询问（veto 时待决导航挂起，state 置位驱动确认框渲染）
  blocker: undefined as ((to: string, from: string) => boolean) | undefined,
  // createDataLoader 的 DEV 来源校验（src/util/dataLoader.ts）要求
  // useMatched 提供 matched[index].route.data：模块加载后由测试体把
  // editorLoader 填进来（mock 工厂内 import dataloaders 会与被 mock 的
  // '@native-router/react' 循环，故走 hoisted state 中转）
  matchedRoute: {route: {}} as {route: {data: unknown}}
}));

// 保留真实模块，只覆写视图用到的 post/put；422 拒绝值直接用鸭子形状
// 普通对象（catch 侧按 {status, data.errors} 判断，不依赖错误类身份）
vi.mock('@/util/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/util/http')>()),
  post: vi.fn(),
  put: vi.fn()
}));
vi.mock('@native-router/react', async () => {
  const React = await import('react');
  const {navigate} = await import('@native-router/core');
  return {
    useRouter: () => state.router,
    // useData<T>() 泛型在 mock 中以类型断言透传即可
    useData: () => state.article,
    // useEditorData 的 DEV 来源校验读 matched[index].route.data——见
    // state.matchedRoute 注释（optional 形态下 undefined 亦合法，填
    // editorLoader 对编辑态更保真）
    useMatched: () => ({
      router: state.router,
      matched: [state.matchedRoute],
      index: 0
    }),
    // 与 @native-router/react 1.7 的 useBlocker（dist/use-blocker.js）
    // 同构的迷你仿真：谓词存 ref 逐渲染同步；veto 把待决导航挂上
    // state（驱动确认框），proceed 置一次性 bypass 后以 navigate 重放
    // 被拦目标，reset 仅清待决。真注册需要 router 实例的 blocker
    // 通道，视图单测关心的是谓词行为与确认框交互，POP 回推等由
    // 库侧测试覆盖
    useBlocker: (fn: (to: string, from: string) => boolean) => {
      const fnRef = React.useRef(fn);
      fnRef.current = fn;
      const pending = React.useRef<{location: string; from: string} | null>(null);
      const bypass = React.useRef(false);
      const [ask, setAsk] = React.useState<{location: string; from: string} | null>(null);
      React.useEffect(() => {
        state.blocker = (to: string, from: string) => {
          if (bypass.current) {
            bypass.current = false;
            return true;
          }
          if (fnRef.current(to, from)) return true;
          const next = {location: to, from};
          pending.current = next;
          setAsk(next);
          return false;
        };
      });
      return {
        state: ask,
        proceed: () => {
          const to = pending.current;
          if (!to) return;
          pending.current = null;
          setAsk(null);
          bypass.current = true;
          try {
            void navigate(state.router, to.location);
          } finally {
            bypass.current = false;
          }
        },
        reset: () => {
          pending.current = null;
          setAsk(null);
        }
      };
    }
  };
});
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));

import {navigate} from '@native-router/core';

import * as http from '@/util/http';
import {articleCache, clearAllCaches, homeCache} from '@/util/useQuery';
import {editorLoader} from '@/services/dataloaders';

import Editor from './index';

// DEV 来源校验的路由声明（见 state.matchedRoute 注释）：编辑态路由挂
// editorLoader——与 src/views/index.tsx 的真实路由表同源
state.matchedRoute.route.data = editorLoader;

const postMock = vi.mocked(http.post);
const putMock = vi.mocked(http.put);
const navigateMock = vi.mocked(navigate);

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<any>((res) => (resolve = res));
  return {promise, resolve};
}

// testing-library 的 getByRole/findByRole 在两个类型检查路径下推断不一致
// （eslint typed-lint 认为 button 查询已返回 HTMLButtonElement，tsc 认为是
// HTMLElement）。经 HTMLElement 参数显式收窄，两条路径都成立。
function asButton(el: HTMLElement): HTMLButtonElement {
  return el as HTMLButtonElement;
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    tagList: ['existing'],
    author: {username: 'alice', image: 'https://example.com/a.png', following: false},
    description: 'Old description',
    title: 'Old title',
    body: 'Old body',
    slug: 'old-title-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    favoritesCount: 0,
    favorited: false,
    ...overrides
  };
}

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText('Article Title'), {target: {value: 'New title'}});
  fireEvent.change(screen.getByPlaceholderText("What's this article about?"), {
    target: {value: 'New description'}
  });
  fireEvent.change(screen.getByPlaceholderText('Write your article...'), {target: {value: 'New body'}});
}

beforeEach(() => {
  postMock.mockReset();
  putMock.mockReset();
  navigateMock.mockReset();
  state.article = undefined;
  state.blocker = undefined;
  // 模块级共享缓存逐用例清空，防止 invalidates 断言被上一用例残留串场
  clearAllCaches();
});

describe('Editor', () => {
  it('新建文章：提交中按钮禁用并显示 Publishing...，完成后恢复且双击不双发', async () => {
    const pending = deferred();
    postMock.mockReturnValueOnce(pending.promise);
    render(<Editor />);

    const button = asButton(screen.getByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);

    fillRequired();
    fireEvent.click(button);

    const submitting = asButton(await screen.findByRole('button', {name: 'Publishing...'}));
    expect(submitting.disabled).toBe(true);

    // 提交中再次点击（禁用态）不应再次发请求
    fireEvent.click(submitting);
    expect(postMock).toHaveBeenCalledTimes(1);

    // saveArticle 按契约解包 {article}，mock 响应给同形载荷
    pending.resolve({article: makeArticle({slug: 'new-title-1'})});
    const restored = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(restored.disabled).toBe(false);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
    // saveArticle 透传尾参 signal（未用时为 undefined），按调用元组断言
    // payload 本体（同 tagList 用例的取位方式）
    expect(postMock.mock.calls[0]?.slice(0, 2)).toEqual([
      'articles',
      expect.objectContaining({article: expect.objectContaining({title: 'New title'})})
    ]);
  });

  it('编辑文章：提交中按钮禁用并显示 Updating...，走 http.put', async () => {
    state.article = makeArticle();
    const pending = deferred();
    putMock.mockReturnValueOnce(pending.promise);
    render(<Editor />);

    expect(screen.getByText('Edit Article')).toBeDefined();
    const button = asButton(screen.getByRole('button', {name: 'Update Article'}));
    fireEvent.click(button);

    const submitting = asButton(await screen.findByRole('button', {name: 'Updating...'}));
    expect(submitting.disabled).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0]?.slice(0, 2)).toEqual([
      'articles/old-title-1',
      expect.objectContaining({article: expect.objectContaining({tagList: ['existing'], title: 'Old title'})})
    ]);

    pending.resolve({article: makeArticle()});
    const restored = asButton(await screen.findByRole('button', {name: 'Update Article'}));
    expect(restored.disabled).toBe(false);
    expect(navigateMock).toHaveBeenCalled();
  });

  it('tagList：TagInput 录入的标签进入提交 payload', async () => {
    postMock.mockResolvedValueOnce({article: makeArticle()});
    render(<Editor />);

    fillRequired();
    const tagInput = screen.getByPlaceholderText('Add tags');
    fireEvent.change(tagInput, {target: {value: 'react'}});
    fireEvent.keyDown(tagInput, {key: 'Enter'});
    expect(screen.getByText('react')).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));
    await screen.findByRole('button', {name: 'Publish Article'});
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({article: expect.objectContaining({tagList: ['react']})})
    );  });

  it('校验失败：展示字段错误且不发请求，按钮恢复可用', async () => {
    render(<Editor />);

    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    expect(await screen.findByText('Title is required')).toBeDefined();
    // a11y：错误出现时 FormItem 接线生效——input 带 aria-invalid，且
    // aria-describedby 指向承载错误文案的 role='alert' 元素（错误 span
    // 不渲染时无悬空 id）
    const titleInput = screen.getByPlaceholderText('Article Title');
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = titleInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('Title is required');
    expect(postMock).not.toHaveBeenCalled();
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
  });

  // P1 表单层收敛：服务端 422 字段错误经共享回填落到对应字段下方，
  // 顶部 Alert 不再显示整句 e.message
  it('服务端 422 字段错误：回填到字段下方且顶部不显示整句 Alert', async () => {
    // 鸭子形状（fetch-fun HTTPError 映射后：status + data.errors），视图
    // catch 不依赖错误类身份
    postMock.mockRejectedValueOnce({
      status: 422,
      message: 'title has already been taken',
      data: {errors: {title: ['has already been taken']}}
    });
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    // title 字段下方出现服务端文案（FormItem 的错误 span 渲染），且
    // 服务端错误同样走 aria-invalid + aria-describedby 接线
    expect(await screen.findByText('has already been taken')).toBeDefined();
    const titleInput = screen.getByPlaceholderText('Article Title');
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    const errorEl = document.getElementById(
      titleInput.getAttribute('aria-describedby')!
    );
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('has already been taken');
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
    // 全部错误已回填字段：顶部 Alert 不显示 e.message 整句
    expect(screen.queryByText('title has already been taken')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // 提交链路 useMutation 化：成功经 invalidates 失效共享 queryCache 的
  // ['home']/['article'] 前缀条目——否则 navigate('/') 后 Home / Article
  // 的 loader 在 staleTime 内新鲜命中旧缓存，新文章 2 秒内不出现
  it('发布成功：navigate 前失效 home/article 前缀缓存条目', async () => {
    // 预置与 loader 同 key 的缓存条目（homeCacheArgs / articleCacheArgs
    // 与 views/index.tsx 的 withCache(['home'])/['article'] 寻址同形）
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    homeCache.set([{tag: 'react', offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    articleCache.set(['old-title-1'], makeArticle());
    postMock.mockResolvedValueOnce({article: makeArticle({slug: 'new-title-1'})});
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    // await mutate → invalidates 已在其成功分支执行 → 才 navigate
    await screen.findByRole('button', {name: 'Publish Article'});
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeUndefined();
    expect(homeCache.peek!([{tag: 'react', offset: 0, limit: 10}])).toBeUndefined();
    expect(articleCache.peek!(['old-title-1'])).toBeUndefined();
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
  });

  it('编辑成功：同样失效 home/article 前缀缓存条目', async () => {
    state.article = makeArticle();
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    articleCache.set(['old-title-1'], makeArticle());
    putMock.mockResolvedValueOnce({article: makeArticle({title: 'New title'})});
    render(<Editor />);

    fireEvent.click(screen.getByRole('button', {name: 'Update Article'}));

    await screen.findByRole('button', {name: 'Update Article'});
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeUndefined();
    expect(articleCache.peek!(['old-title-1'])).toBeUndefined();
    expect(navigateMock).toHaveBeenCalled();
  });

  // 失败自动不失效（useMutation 契约）：422 被拒时缓存条目保留，错误仍
  // 走 applyApiFieldErrors 回填字段下方
  it('提交失败：不失效缓存条目，错误回填字段下方', async () => {
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    postMock.mockRejectedValueOnce({
      status: 422,
      message: 'title has already been taken',
      data: {errors: {title: ['has already been taken']}}
    });
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    expect(await screen.findByText('has already been taken')).toBeDefined();
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeDefined();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // —— 未保存离开拦截（useBlocker + ConfirmDialog + beforeunload）——
  // 谓词经 mock 捕获后同步调用（act 包裹：veto 在 mock 内 setAsk 触发
  // 状态更新），等价于路由器在 navigate 头部询问 blocker。
  it('dirty 导航被拦：弹确认框、否决且未离开', () => {
    render(<Editor />);
    fireEvent.change(screen.getByPlaceholderText('Article Title'), {
      target: {value: 'New title'}
    });

    let vetoed = true;
    act(() => {
      vetoed = state.blocker!('/', '/editor');
    });

    // dirty → 否决 + 弹确认框
    expect(vetoed).toBe(false);
    expect(screen.getByText('Unsaved changes')).toBeDefined();
    expect(screen.getByRole('button', {name: 'Leave'})).toBeDefined();
    expect(screen.getByRole('button', {name: 'Stay'})).toBeDefined();
    // 否决即未离开：navigate 未被调用
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('确认离开：reset 清 dirty 后放行 navigate 到被拦目标', () => {
    render(<Editor />);
    const title = screen.getByPlaceholderText('Article Title');
    fireEvent.change(title, {target: {value: 'New title'}});
    act(() => {
      state.blocker!('/', '/editor');
    });

    fireEvent.click(screen.getByRole('button', {name: 'Leave'}));

    // reset 落地：回到 initialValues（新建态空串），对话框关闭
    expect((title as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    // dirty 已清零：后续导航询问直接放行（无需任何绕过标志）
    expect(state.blocker!('/about', '/editor')).toBe(true);
    // 放行跳转到当初被拦的目标
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
  });

  it('取消离开：关对话框、无导航、修改保留仍 dirty', () => {
    render(<Editor />);
    const title = screen.getByPlaceholderText('Article Title');
    fireEvent.change(title, {target: {value: 'New title'}});
    act(() => {
      state.blocker!('/', '/editor');
    });

    fireEvent.click(screen.getByRole('button', {name: 'Stay'}));

    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
    // 修改保留，仍是 dirty 态——再次询问依旧被拦
    expect((title as HTMLInputElement).value).toBe('New title');
    expect(state.blocker!('/', '/editor')).toBe(false);
  });

  it('干净时导航零拦截：谓词放行且不弹框', () => {
    render(<Editor />);

    // 未做任何修改：同步谓词直接 true，确认框不出现
    expect(state.blocker!('/', '/editor')).toBe(true);
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('保存成功：提交值成为新基线，后续导航不被未保存拦截否决', async () => {
    // 回归锁：提交成功后 live values 仍与旧 initialValues 不同，若不
    // setInitialValues 重定基线，随后的 navigate('/') 会被自己的
    // blocker 否决（e2e publish 链路即在此挂掉）
    postMock.mockResolvedValueOnce({article: makeArticle({slug: 'new-title-1'})});
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    await screen.findByRole('button', {name: 'Publish Article'});
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
    // 提交值已是「已保存态」：isDirty 归零，离开询问直接放行
    expect(state.blocker!('/', '/editor')).toBe(true);
  });
});
