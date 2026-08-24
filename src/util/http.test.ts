import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import * as ff from 'fetch-fun';

import {
  fetchJSON,
  get,
  del,
  post,
  put,
  setTokenGetter,
  setUnauthorizedHandler
} from '@/util/http';

// fetch-fun 的 json reader 通过 res.text() 读取响应体，HTTPError 构造
// 读取 status/statusText/url，fetchData 检查 res.type，retry 会读
// res.headers（Retry-After）—— mock 需补全形态。替身只实现被消费的
// 成员，统一在工厂内收窄为 Response（挂到 vi.fn<typeof fetch> 上）。
function mockResponse(
  body: unknown,
  ok = true,
  status = ok ? 200 : 422
): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    url: 'https://api.realworld.io/api/test',
    type: 'basic' as const,
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
  } as unknown as Response;
}

// withAuth 中间件会把请求头归一成 Headers 实例再交给 fetch，
// 断言请求头统一从这里取。
function sentHeaders(mock: ReturnType<typeof vi.fn>) {
  const init = mock.mock.calls[0]![1] as RequestInit;
  return new Headers(init.headers);
}

// 挂起直到 signal 中止的 fetch 替身：模拟原生 fetch 对 abort 的响应
// （已中止的 signal 立即拒绝，否则监听 abort 事件），无 signal 永远挂起。
// signal.reason 运行时是 DOMException（Error 子类），类型上收窄满足
// prefer-promise-reject-errors。
function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) return reject(signal.reason as Error);
      signal.addEventListener(
        'abort',
        () => reject(init.signal!.reason as Error),
        {once: true}
      );
    })
  );
}

describe('http utilities', () => {
  // vi.fn() 无泛型时推断为返回 undefined 的实现，传入返回 Promise 的
  // 替身会触发 no-misused-promises——显式按 fetch 签名实例化。
  // mockResponse 返回的是形态补全的替身而非真 Response，挂载时收窄。
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    setTokenGetter(() => undefined);
    // 401 钩子是模块级状态，重置避免用例间泄漏
    setUnauthorizedHandler(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('fetchJSON', () => {
    it('should make a request with correct headers', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      const result = await fetchJSON('test');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/test',
        expect.anything()
      );
      expect(sentHeaders(fetchMock).get('content-type')).toBe(
        'application/json'
      );
      expect(sentHeaders(fetchMock).get('accept')).toBe('application/json');
      expect(result).toEqual({data: 'test'});
    });

    it('should merge custom headers', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      // Authorization 由 withAuth 中间件统一接管（每次请求都会重设），
      // 这里用普通自定义头验证逐个合并逻辑。
      await fetchJSON('test', {
        headers: {'x-custom': '42'}
      });

      expect(sentHeaders(fetchMock).get('x-custom')).toBe('42');
      expect(sentHeaders(fetchMock).get('content-type')).toBe(
        'application/json'
      );
    });

    it('should forward signal to fetch', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));
      const controller = new AbortController();

      await fetchJSON('test', {signal: controller.signal});

      // withTimeout 把用户 signal 与超时预算组合成 AbortSignal.any 复合
      // 信号后传给 fetch，身份会变——验证改为中止联动：controller abort
      // 时复合信号同步进入 aborted 态（取消语义直通到底）。
      const init = fetchMock.mock.calls[0]![1]!;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect((init.signal!).aborted).toBe(false);
      controller.abort();
      expect((init.signal!).aborted).toBe(true);
    });

    it('should throw error when response is not ok', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({errors: {email: ['has already been taken']}}, false)
      );

      await expect(fetchJSON('test')).rejects.toThrow(
        'email has already been taken'
      );
    });

    it('should join multiple field errors into one message', async () => {
      fetchMock.mockResolvedValue(
        mockResponse(
          {
            errors: {
              email: ['has already been taken', 'is invalid'],
              password: ['is too short (least is 8 characters)']
            }
          },
          false
        )
      );

      await expect(fetchJSON('test')).rejects.toThrow(
        /^email has already been taken; email is invalid; password is too short \(least is 8 characters\)$/
      );
    });

    it('should prefer message over errors when both present', async () => {
      fetchMock.mockResolvedValue(
        mockResponse(
          {message: 'unauthorized', errors: {token: ['is expired']}},
          false
        )
      );

      await expect(fetchJSON('test')).rejects.toThrow(/^unauthorized$/);
    });

    it('should keep HTTPError identity with status and data after withMessage', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({errors: {email: ['has already been taken']}}, false)
      );

      const error = (await fetchJSON('test').catch(
        (e: unknown) => e
      )) as ff.HTTPError;

      // withMessage 换写 message 后 instanceof/.status/.data 仍然可用，
      // 调用方（如 404 判别、字段错误回填）依赖这些做分支。
      expect(error).toBeInstanceOf(ff.HTTPError);
      expect(error.status).toBe(422);
      expect(error.data).toEqual({
        errors: {email: ['has already been taken']}
      });
      expect(error.message).toBe('email has already been taken');
      expect(error.response.status).toBe(422);
    });

    it('should keep library default message for unparseable error body', async () => {
      // HTML 错误页等解析不出的错误体：errorText 为空，保留库默认
      // 「GET <url> failed with status ...」句式兜底而非空 message。
      const response = mockResponse('ignored', false);
      response.text = vi.fn().mockResolvedValue('<html>oops</html>');
      fetchMock.mockResolvedValue(response);

      const error = (await fetchJSON('test').catch(
        (e: unknown) => e
      )) as ff.HTTPError;

      expect(error).toBeInstanceOf(ff.HTTPError);
      expect(error.message).toMatch(/failed with status 422/);
    });

    it('should fire unauthorized handler on 401 only when a token is set', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      setTokenGetter(() => 'tok123');
      fetchMock.mockResolvedValue(
        mockResponse({message: 'unauthorized'}, false, 401)
      );

      const error = (await fetchJSON('test').catch(
        (e: unknown) => e
      )) as ff.HTTPError;

      // 已登录态凭据失效：触发自动登出，错误照常抛出
      expect(handler).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(ff.HTTPError);
      expect(error.status).toBe(401);
      expect(error.message).toBe('unauthorized');
    });

    it('should not fire unauthorized handler on 401 without token (login flow)', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      // 登录/注册自身的 401（密码错误）发生在未登录态，token 为空
      fetchMock.mockResolvedValue(
        mockResponse({message: 'unauthorized'}, false, 401)
      );

      const error = (await fetchJSON('test').catch(
        (e: unknown) => e
      )) as ff.HTTPError;

      expect(handler).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(ff.HTTPError);
      expect(error.status).toBe(401);
    });

    it('should treat blank token as absent (no unauthorized firing)', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      setTokenGetter(() => '');
      fetchMock.mockResolvedValue(mockResponse({}, false, 401));

      await fetchJSON('test').catch(() => undefined);

      // 空串凭据与未登录同义：不触发登出
      expect(handler).not.toHaveBeenCalled();
    });

    it('should tolerate a throwing unauthorized handler', async () => {
      setUnauthorizedHandler(() => {
        throw new Error('handler boom');
      });
      setTokenGetter(() => 'tok123');
      fetchMock.mockResolvedValue(mockResponse({}, false, 401));

      // 回调异常被吞掉，401 错误照常抛给调用方
      await expect(fetchJSON('test')).rejects.toBeInstanceOf(ff.HTTPError);
    });

    it('should not invoke unauthorized handler on non-401 failures', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      setTokenGetter(() => 'tok123');
      fetchMock.mockResolvedValue(
        mockResponse({errors: {email: ['has already been taken']}}, false)
      );

      await expect(fetchJSON('test')).rejects.toBeInstanceOf(ff.HTTPError);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not invoke unauthorized handler on success', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      setTokenGetter(() => 'tok123');
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await fetchJSON('test');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should make GET request', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles',
        expect.objectContaining({method: 'get'})
      );
    });

    it('should append query string when params provided', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles', {limit: 10, offset: 0});

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.objectContaining({method: 'get'})
      );
    });

    it('should forward signal via init', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));
      const controller = new AbortController();

      await get('articles', undefined, {signal: controller.signal});

      // 同 fetchJSON：验证复合信号与 controller 的中止联动
      const init = fetchMock.mock.calls[0]![1]!;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      expect((init.signal!).aborted).toBe(true);
    });
  });

  describe('del', () => {
    it('should make DELETE request', async () => {
      fetchMock.mockResolvedValue(mockResponse({success: true}));

      await del('articles/123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles/123',
        expect.objectContaining({method: 'delete'})
      );
    });

    it('should forward signal via init', async () => {
      fetchMock.mockResolvedValue(mockResponse({success: true}));
      const controller = new AbortController();

      await del('articles/123', {signal: controller.signal});

      // 同 fetchJSON：验证复合信号与 controller 的中止联动
      const init = fetchMock.mock.calls[0]![1]!;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      expect((init.signal!).aborted).toBe(true);
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      fetchMock.mockResolvedValue(mockResponse({article: {id: 1}}));

      const data = {title: 'Test', body: 'Content'};
      await post('articles', data);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles',
        expect.objectContaining({
          method: 'post',
          body: JSON.stringify(data)
        })
      );
    });
  });

  describe('put', () => {
    it('should make PUT request with JSON body', async () => {
      fetchMock.mockResolvedValue(mockResponse({article: {id: 1}}));

      const data = {title: 'Updated'};
      await put('articles/123', data);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles/123',
        expect.objectContaining({
          method: 'put',
          body: JSON.stringify(data)
        })
      );
    });
  });

  describe('authorization', () => {
    it('should attach Authorization header after token provider registered', async () => {
      setTokenGetter(() => 'tok123');
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles');

      expect(sentHeaders(fetchMock).get('authorization')).toBe('Token tok123');
    });

    it('should not attach Authorization when no token', async () => {
      setTokenGetter(() => undefined);
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles');

      // stripEmptyAuth 中间件已删：withAuth 对空凭据（含空串/纯空白）
      // 自带跳过 + 删除继承值行为，这里回归验证未登录请求保持匿名。
      expect(sentHeaders(fetchMock).get('authorization')).toBeNull();
    });

    it('should not attach Authorization for empty or blank tokens', async () => {
      setTokenGetter(() => '   ');
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles');

      expect(sentHeaders(fetchMock).get('authorization')).toBeNull();
    });
  });

  describe('timeout', () => {
    it('should reject with TimeoutError after the per-attempt budget elapses', async () => {
      vi.useFakeTimers();
      // Node 的 AbortSignal.timeout 走内部定时器，fake timers 拦不到，
      // 换成受控 controller：拿到预算值的同时能手动触发到点中止。
      const controller = new AbortController();
      const timeoutSpy = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(controller.signal);
      fetchMock.mockImplementation(hangingFetch());

      const outcome = get('articles').catch((e: unknown) => e);
      // 到点：模拟超时中止（DOMException name=TimeoutError 是库的判别依据）
      controller.abort(
        new DOMException('Signal timed out.', 'TimeoutError')
      );
      // 驱动 fake timers 走完两次重试的退避（重试把 TimeoutError 视为
      // 瞬态故障；后续尝试拿到的是已中止的同一 signal，立即失败）
      await vi.advanceTimersByTimeAsync(60_000);

      const error = (await outcome) as ff.TimeoutError;

      expect(error).toBeInstanceOf(ff.TimeoutError);
      expect(error.message).toBe('Request timed out after 10000ms');
      // 初始 1 次 + 重试 2 次；每次尝试都申请了 10s 预算
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    });

    it('should keep user aborts as AbortError, not TimeoutError', async () => {
      vi.useFakeTimers();
      vi.spyOn(AbortSignal, 'timeout');
      fetchMock.mockImplementation(hangingFetch());
      const controller = new AbortController();

      const outcome = get('articles', undefined, {
        signal: controller.signal
      }).catch((e: unknown) => e);
      // 用户主动取消：AbortError 身份原样穿透（不会被误标 TimeoutError）。
      // retry 策略把未知错误视为瞬态，用户中止也会重放，但复合 signal 已
      // 中止，每趟立即失败且退避 sleep 对已中止 signal 即刻返回——最终
      // 1 + 2 次调用后以 AbortError 落定。
      controller.abort(
        new DOMException('The user aborted a request.', 'AbortError')
      );

      const error = (await outcome) as DOMException;

      expect(error.name).toBe('AbortError');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
