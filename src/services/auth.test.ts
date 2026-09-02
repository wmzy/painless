import type {Article, ArticlePage} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';

// auth 模块有模块级状态（当前用户、localStorage 恢复、token 注册），
// 每个用例重置模块并动态导入，拿到的 http mock 与 auth 实例同批。
vi.mock('@/util/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  setTokenGetter: vi.fn(),
  setUnauthorizedHandler: vi.fn()
}));

// 401 处置链（bindUnauthorizedRedirect）依赖 core 的 navigate/invalidate
// （router 实例形态由调用方注入）：mock 成 vi.fn 断言调用契约。refresh
// 是传递依赖（useQuery → mock）的具名导入，一并提供避免 undefined 绑定
vi.mock('@native-router/core', () => ({
  navigate: vi.fn(),
  invalidate: vi.fn(),
  refresh: vi.fn()
}));

describe('auth service', () => {
  let http: typeof import('@/util/http');
  let auth: typeof import('@/services/auth');

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.resetModules();
    http = await import('@/util/http');
    auth = await import('@/services/auth');
  });

  describe('login', () => {
    it('should call post with login endpoint and return user', async () => {
      const mockUser = {user: {email: 'test@test.com', token: 'abc'}};
      vi.mocked(http.post).mockResolvedValue(mockUser);

      const result = await auth.login('test@test.com', 'password');

      expect(http.post).toHaveBeenCalledWith('users/login', {
        user: {email: 'test@test.com', password: 'password'}
      });
      expect(result).toEqual(mockUser.user);
    });
  });

  describe('register', () => {
    it('should call post with register endpoint and return user', async () => {
      const mockUser = {
        user: {username: 'test', email: 'test@test.com', token: 'abc'}
      };
      vi.mocked(http.post).mockResolvedValue(mockUser);

      const result = await auth.register('test', 'test@test.com', 'password');

      expect(http.post).toHaveBeenCalledWith('users', {
        user: {username: 'test', email: 'test@test.com', password: 'password'}
      });
      expect(result).toEqual(mockUser.user);
    });
  });

  // Register 用户名异步查重的数据源：只验证传输契约（端点/解包/signal
  // 透传），占用与可用的判定语义在 util/validators 的 usernameAvailable。
  describe('fetchProfile', () => {
    it('should call get with profiles endpoint, unwrap profile and pass signal', async () => {
      const profile = {
        username: 'alice',
        bio: '',
        image: '',
        following: false
      };
      vi.mocked(http.get).mockResolvedValue({profile});

      const controller = new AbortController();
      const result = await auth.fetchProfile('alice', controller.signal);

      // fillPath 已在编译期约束参数集合，这里断言最终 URL 形状与
      // signal 透传（被超越的校验轮次据此撤销在途请求）
      expect(http.get).toHaveBeenCalledWith(
        'profiles/alice',
        undefined,
        {signal: controller.signal}
      );
      expect(result).toEqual(profile);
    });

    it('should encode path parameters in the username segment', async () => {
      vi.mocked(http.get).mockResolvedValue({
        profile: {username: 'a b/c', image: '', following: false}
      });

      await auth.fetchProfile('a b/c');

      // 用户名里的空格/斜杠经 fillPath 逐值 encodeURIComponent，
      // 不依赖调用方手拼模板字符串的裸插值
      expect(http.get).toHaveBeenCalledWith(
        'profiles/a%20b%2Fc',
        undefined,
        {signal: undefined}
      );
    });
  });

  describe('auth state', () => {
    const user = {username: 'test', email: 'test@test.com', token: 'tok'};

    it('should register a token getter wired to current user', async () => {
      expect(http.setTokenGetter).toHaveBeenCalledTimes(1);
      const getter = vi.mocked(http.setTokenGetter).mock.calls[0]![0];
      expect(getter()).toBeUndefined();

      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      expect(getter()).toBe('tok');

      auth.logout();
      expect(getter()).toBeUndefined();
    });

    it('should not register an unauthorized handler at module load (registration moved to bindUnauthorizedRedirect)', async () => {
      // 401 处置链需要 router 实例（登出后 invalidate/navigate），注册点
      // 移到 Router 树内（views/index.tsx）——模块加载只注册 token 供应商
      //（冷刷新首个 data 请求就要带凭据）
      expect(http.setUnauthorizedHandler).not.toHaveBeenCalled();
      expect(http.setTokenGetter).toHaveBeenCalledTimes(1);
    });

    it('should persist user to localStorage after login', async () => {
      vi.mocked(http.post).mockResolvedValue({user});

      await auth.login('test@test.com', 'password');

      expect(
        JSON.parse(localStorage.getItem('painless.user')!)
      ).toEqual(user);
      expect(auth.getCurrentUser()).toEqual(user);
    });

    it('should restore persisted user on module load', async () => {
      localStorage.setItem('painless.user', JSON.stringify(user));
      vi.resetModules();

      const fresh = await import('@/services/auth');

      expect(fresh.getCurrentUser()).toEqual(user);
    });

    it('should treat corrupted stored user as logged out', async () => {
      localStorage.setItem('painless.user', '{oops');
      vi.resetModules();

      const fresh = await import('@/services/auth');

      expect(fresh.getCurrentUser()).toBeNull();
    });

    it('should clear storage and current user on logout', async () => {
      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');

      auth.logout();

      expect(localStorage.getItem('painless.user')).toBeNull();
      expect(auth.getCurrentUser()).toBeNull();
    });

    it('should clear all entity caches on logout', async () => {
      // beforeEach 的 resetModules 后首次 import：与 auth 实际持有的是
      // 同一批实体 cache 实例（本用例内不再 reset）
      const {articleCache, homeCache, clearAllCaches} = await import(
        '@/util/useQuery'
      );

      // 预置两条“已缓存数据”：一条登录前、一条登录后写入（跨两个实体）
      articleCache.set(['test-feed-slug'], {slug: 'a'} as Article);
      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      homeCache.set([{offset: 0, limit: 10}], {
        articles: [{slug: 'b'}] as ArticlePage['articles'],
        articlesCount: 1
      });
      expect(articleCache.get(['test-feed-slug'])).toBeDefined();

      auth.logout();

      // 上一账号拉过的缓存一律取不到，防止下一账号命中渲染
      expect(articleCache.get(['test-feed-slug'])).toBeUndefined();
      expect(homeCache.get([{offset: 0, limit: 10}])).toBeUndefined();

      // 实体 cache 是模块级共享实例，收尾清理避免污染其它用例
      clearAllCaches();
    });

    it('should notify subscribers on login and logout', async () => {
      const handler = vi.fn();
      const off = auth.onAuthChange(handler);

      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      expect(handler).toHaveBeenCalledWith(user);

      auth.logout();
      expect(handler).toHaveBeenCalledWith(null);

      off();
      auth.logout();
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // 401 处置链（增强段）：登出清场 + 回跳 /login?redirect=…（Layout 手动
  // 登出的 invalidate+navigate 同款语义）。注册点在 Router 树内
  //（views/index.tsx），本组直接驱动导出的注册函数拿 handler 断言契约；
  // http 层的触发条件（仅 401 且 token 非空）在 util/http.test.ts 的 401 组。
  describe('bindUnauthorizedRedirect（401 处置链）', () => {
    const user = {username: 'test', email: 'test@test.com', token: 'tok'};

    // 进入已登录态并注册处置链：返回注册进 http 的 handler。jsdom 的
    // location 经 pushState 设定回跳场景（pathname+search）
    async function setup(pathname: string, search = '') {
      window.history.pushState({}, '', `${pathname}${search}`);
      const router = {history: {}};
      auth.bindUnauthorizedRedirect(router);
      expect(http.setUnauthorizedHandler).toHaveBeenCalledTimes(1);
      const handler = vi.mocked(http.setUnauthorizedHandler).mock.calls[0]![0];
      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      return {handler, router};
    }

    it('已登录 401：登出 + invalidate + navigate 回 /login，redirect 整体 encode', async () => {
      const {handler, router} = await setup('/editor/my-slug', '?a=1&b=2');
      const {navigate, invalidate} = await import('@native-router/core');

      handler();

      expect(auth.getCurrentUser()).toBeNull();
      expect(localStorage.getItem('painless.user')).toBeNull();
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith(router);
      expect(navigate).toHaveBeenCalledTimes(1);
      // 与 requireLogin 守卫重定向同款编码：'/'、'?'、'&' 全部转义
      expect(navigate).toHaveBeenCalledWith(
        router,
        `/login?redirect=${encodeURIComponent('/editor/my-slug?a=1&b=2')}`
      );
    });

    it('并发 401 去重：首个触发已登出，后续直接返回（导航只一次）', async () => {
      const {handler} = await setup('/editor');
      const {navigate} = await import('@native-router/core');

      handler();
      handler(); // 第二个触发（http 侧同拍竞态或直调）

      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('已在 /login：只登出，不 invalidate 不导航', async () => {
      const {handler} = await setup('/login');
      const {navigate, invalidate} = await import('@native-router/core');

      handler();

      expect(auth.getCurrentUser()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });
  });
});
