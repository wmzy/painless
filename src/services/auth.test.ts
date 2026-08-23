import {describe, it, expect, vi, beforeEach} from 'vitest';

// auth 模块有模块级状态（当前用户、localStorage 恢复、token 注册），
// 每个用例重置模块并动态导入，拿到的 http mock 与 auth 实例同批。
vi.mock('@/util/http', () => ({
  post: vi.fn(),
  setTokenGetter: vi.fn()
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
