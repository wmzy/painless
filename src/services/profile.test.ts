// fetchProfile 的传输契约测试（自 services/auth.test.ts 平移——档案实体
// 服务 2026-09-06 拆出独立模块，Register 查重与 Profile 路由 loader 共用
// 同一数据源）：端点/解包/signal 透传 + 路径参数编码；占用与可用的判定
// 语义在 util/validators 的 usernameAvailable。
import {describe, it, expect, vi, beforeEach} from 'vitest';

// 只 mock 传输出口：api/withSignal/withDevValidation 保持真实（同
// article.test.ts），断言经 objectContaining 钉住 signal。
vi.mock('@/util/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/util/http')>()),
  get: vi.fn()
}));

describe('profile service', () => {
  let http: typeof import('@/util/http');
  let profile: typeof import('@/services/profile');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    http = await import('@/util/http');
    profile = await import('@/services/profile');
  });

  describe('fetchProfile', () => {
    it('should call get with profiles endpoint, unwrap profile and pass signal', async () => {
      const author = {
        username: 'alice',
        bio: '',
        image: '',
        following: false
      };
      vi.mocked(http.get).mockResolvedValue({profile: author});

      const controller = new AbortController();
      const result = await profile.fetchProfile('alice', controller.signal);

      // fillPath 已在编译期约束参数集合，这里断言最终 URL 形状与
      // signal 透传（被超越的校验轮次据此撤销在途请求）。链上还带
      // DEV 校验 schema（测试环境 import.meta.env.DEV 恒真）——断言只
      // 收窄到 signal 契约，schema 形状由 dev 校验链路自身承担
      expect(http.get).toHaveBeenCalledWith(
        'profiles/alice',
        undefined,
        expect.objectContaining({signal: controller.signal})
      );
      expect(result).toEqual(author);
    });

    it('should encode path parameters in the username segment', async () => {
      vi.mocked(http.get).mockResolvedValue({
        profile: {username: 'a b/c', image: '', following: false}
      });

      await profile.fetchProfile('a b/c');

      // 用户名里的空格/斜杠经 fillPath 逐值 encodeURIComponent，
      // 不依赖调用方手拼模板字符串的裸插值
      expect(http.get).toHaveBeenCalledWith(
        'profiles/a%20b%2Fc',
        undefined,
        expect.objectContaining({signal: undefined})
      );
    });
  });
});
