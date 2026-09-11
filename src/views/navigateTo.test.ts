// navigateTo 的契约钉子：插值/编码与 TypedLink 落点一致（同一路径
// 「点链接」vs「命令式跳转」产生同一 href，含迁移前 encodeURIComponent
// 的字节级对照）、search 拼接、NCE 吞除（fire-and-forget 不漏 unhandled
// rejection）、编译期反向用例（tsc --noEmit 守门，vitest 不跑类型检查）。
import type {RouterInstance} from '@native-router/core';

import {describe, it, expect, vi, beforeEach} from 'vitest';

// 只替换 navigate：navigateTo 的运行时依赖仅此一个 core 成员
// （RouterInstance 是 type-only import，编译期擦除）
vi.mock('@native-router/core', () => ({
  navigate: vi.fn(async () => undefined)
}));

import {navigate} from '@native-router/core';

import {navigateTo} from './navigateTo';

const navigateMock = vi.mocked(navigate);

// 宽松替身：navigateTo 只透传引用（真实 RouterInstance 收不进字面量，
// Layout 测试的同款约定）
const router = {} as RouterInstance<any>;

beforeEach(() => {
  navigateMock.mockReset();
  navigateMock.mockResolvedValue(undefined);
});

// 编译期反向用例包进永不调用的探针函数——只让 tsc 看见调用形态：
// 「缺 params」形态在运行时会抛 Missing param（封装的兜底行为），顶层
// 直接调用会把整个测试文件炸掉。
function compileTimeProbes() {
  // @ts-expect-error 非联合成员路径：AppPaths 里没有 /typo
  navigateTo(router, '/typo');
  // @ts-expect-error 参数化路径缺 params
  navigateTo(router, '/article/:title');
  // @ts-expect-error 静态路径不接受 params（TypedLinkMember 同款判别）
  navigateTo(router, '/settings', {params: {}});
}

// 引用侧写只为满足 no-unused-vars——探针永不执行（「缺 params」形态
// 运行时必抛 Missing param，顶层调用会炸文件）
// eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator
void compileTimeProbes;

describe('navigateTo', () => {
  it('静态路径：目标字符串原样直传', () => {
    navigateTo(router, '/settings');
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(router, '/settings');
  });

  it('参数化路径：params 插值，与迁移前拼接字节等价（Settings 落点）', () => {
    navigateTo(router, '/profile/:username', {
      params: {username: 'new me'}
    });
    // 迁移前形态：navigate(router, `/profile/${encodeURIComponent(u)}`)
    // ——最终 href 必须逐字节一致（编码责任移交封装）
    expect(navigateMock).toHaveBeenCalledWith(
      router,
      `/profile/${encodeURIComponent('new me')}`
    );
  });

  it('保留字符 slug：整体转义，与迁移前 encodeURIComponent 等价（Editor 落点）', () => {
    navigateTo(router, '/article/:title', {params: {title: 'old title-1'}});
    expect(navigateMock).toHaveBeenCalledWith(
      router,
      `/article/${encodeURIComponent('old title-1')}`
    );

    // '/'、'?' 等保留字符裸拼会破坏路由匹配，必须转义
    navigateTo(router, '/article/:title', {params: {title: 'a/b?c'}});
    expect(navigateMock).toHaveBeenLastCalledWith(
      router,
      `/article/${encodeURIComponent('a/b?c')}`
    );
  });

  it('search：原始 query 串以 ? 追加（编码责任在调用方）', () => {
    navigateTo(router, '/login', {search: 'redirect=%2Farticle%2Fx'});
    expect(navigateMock).toHaveBeenCalledWith(
      router,
      '/login?redirect=%2Farticle%2Fx'
    );
  });

  it('参数化路径 + search：插值后追加', () => {
    navigateTo(router, '/editor/:slug', {
      params: {slug: 'my-slug'},
      search: 'a=1'
    });
    expect(navigateMock).toHaveBeenCalledWith(router, '/editor/my-slug?a=1');
  });

  // core 1.15 语义变更：被取代/取消的 navigate() reject
  // NavigationCancelledError——fire-and-forget 若裸 void 会漏进 unhandled
  // rejection 通道。注：vi.fn 的返回值会被 spy 机制内部挂上处理器，
  // process.on('unhandledRejection') 探针在 mock 路径下观测不到泄漏
  // （auth.test.ts bindUnauthorizedRedirect 组同款结论），故用记录式
  // thenable 直测契约：navigateTo 给 navigate 返回值挂恰好一个 rejection
  // 处理器，且该处理器吞掉真实 NCE 不重抛——真实链路下这两点即
  // 「rejection 被吞、零 unhandled」的充分条件。
  it('navigate reject（模拟 NCE）：rejection 处理器恰好一个且吞掉不重抛', async () => {
    const catches: ((reason: unknown) => unknown)[] = [];
    navigateMock.mockImplementationOnce(
      () =>
        ({
          catch(cb: (reason: unknown) => unknown) {
            catches.push(cb);
            return Promise.resolve();
          }
        }) as unknown as Promise<void>
    );

    navigateTo(router, '/settings');

    expect(catches.length).toBe(1);
    const {NavigationCancelledError} = await vi.importActual<
      typeof import('@native-router/core')
    >('@native-router/core');
    expect(() =>
      catches[0]!(new NavigationCancelledError('/settings'))
    ).not.toThrow();
  });
});
