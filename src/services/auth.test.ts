import {describe, it, expect, vi, beforeEach} from 'vitest';

// auth 模块有模块级状态（当前用户、localStorage 恢复、token 注册），
// 每个用例重置模块并动态导入，拿到的 http mock 与 auth 实例同批。
vi.mock('@/util/http', () => ({
  post: vi.fn(),
  setTokenGetter: vi.fn(),
  setUnauthorizedHandler: vi.fn()
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

    it('should register an unauthorized handler that logs out only when logged in', async () => {
      expect(http.setUnauthorizedHandler).toHaveBeenCalledTimes(1);
      const handler = vi.mocked(http.setUnauthorizedHandler).mock.calls[0]![0];

      // 未登录态（如登录失败的 401）：no-op，不触碰存储
      handler();
      expect(auth.getCurrentUser()).toBeNull();

      // 已登录态（token 过期的 401）：触发登出并清存储
      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      handler();
      expect(auth.getCurrentUser()).toBeNull();
      expect(localStorage.getItem('painless.user')).toBeNull();
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

    it('should clear the shared query cache on logout', async () => {
      // beforeEach 的 resetModules 后首次 import：与 auth 实际持有的是
      // 同一个 queryCache 实例（本用例内不再 reset）
      const {queryCache} = await import('@/util/useQuery');

      // 预置两条“已缓存数据”：一条登录前、一条登录后写入
      queryCache.set(['articles', 'test-feed'], [{slug: 'a'}]);
      vi.mocked(http.post).mockResolvedValue({user});
      await auth.login('test@test.com', 'password');
      queryCache.set(['articles', 'favorited'], [{slug: 'b'}]);
      expect(queryCache.get(['articles', 'test-feed'])).toBeDefined();

      auth.logout();

      // 上一账号拉过的缓存一律取不到，防止下一账号命中渲染
      expect(queryCache.get(['articles', 'test-feed'])).toBeUndefined();
      expect(queryCache.get(['articles', 'favorited'])).toBeUndefined();

      // queryCache 是模块级共享实例，收尾清理避免污染其它用例
      queryCache.clear();
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
});
