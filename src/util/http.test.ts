import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

import {
  fetchJSON,
  get,
  del,
  post,
  put,
  setTokenGetter,
  setUnauthorizedHandler,
  ApiError
} from '@/util/http';

// fetch-fun 的 json reader 通过 res.text() 读取响应体，HTTPError 构造
// 读取 status/statusText/url，fetchData 检查 res.type —— mock 需补全形态。
function mockResponse(body: unknown, ok = true, status = ok ? 200 : 422) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    url: 'https://api.realworld.io/api/test',
    type: 'basic' as const,
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
  };
}

// withAuth 中间件会把请求头归一成 Headers 实例再交给 fetch，
// 断言请求头统一从这里取。
function sentHeaders(mock: ReturnType<typeof vi.fn>) {
  const init = mock.mock.calls[0]![1] as RequestInit;
  return new Headers(init.headers);
}

describe('http utilities', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setTokenGetter(() => undefined);
    // 401 钩子是模块级状态，重置避免用例间泄漏
    setUnauthorizedHandler(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

      await expect(fetchJSON('test')).rejects.toThrow(
        /^unauthorized$/
      );
    });

    it('should map non-2xx responses to ApiError with status and errors', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({errors: {email: ['has already been taken']}}, false)
      );

      const error = (await fetchJSON('test').catch((e: unknown) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(422);
      expect(error.errors).toEqual({email: ['has already been taken']});
      expect(error.message).toBe('email has already been taken');
    });

    it('should invoke unauthorized handler on 401 and still throw ApiError', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      fetchMock.mockResolvedValue(
        mockResponse({message: 'unauthorized'}, false, 401)
      );

      const error = (await fetchJSON('test').catch((e: unknown) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(401);
      // 错误体没有 errors 对象时缺省为 {}
      expect(error.errors).toEqual({});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should tolerate a throwing unauthorized handler', async () => {
      setUnauthorizedHandler(() => {
        throw new Error('handler boom');
      });
      fetchMock.mockResolvedValue(mockResponse({}, false, 401));

      // 回调异常被吞掉，401 错误照常抛给调用方
      await expect(fetchJSON('test')).rejects.toBeInstanceOf(ApiError);
    });

    it('should not invoke unauthorized handler on success', async () => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
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

      expect(sentHeaders(fetchMock).get('authorization')).toBe(
        'Token tok123'
      );
    });

    it('should not attach Authorization when no token', async () => {
      setTokenGetter(() => undefined);
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await get('articles');

      expect(sentHeaders(fetchMock).get('authorization')).toBeNull();
    });
  });
});
