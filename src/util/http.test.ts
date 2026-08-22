import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

import {fetchJSON, get, del, post, put} from '@/util/http';

// fetch-fun 的 json reader 通过 res.text() 读取响应体，HTTPError 构造
// 读取 status/statusText/url，fetchData 检查 res.type —— mock 需补全形态。
function mockResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    url: 'https://api.realworld.io/api/test',
    type: 'basic' as const,
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
  };
}

describe('http utilities', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
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
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            accept: 'application/json'
          })
        })
      );
      expect(result).toEqual({data: 'test'});
    });

    it('should merge custom headers', async () => {
      fetchMock.mockResolvedValue(mockResponse({data: 'test'}));

      await fetchJSON('test', {
        headers: {Authorization: 'Bearer token'}
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            accept: 'application/json',
            Authorization: 'Bearer token'
          })
        })
      );
    });

    it('should throw error when response is not ok', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({message: 'Error message'}, false)
      );

      await expect(fetchJSON('test')).rejects.toThrow('Error message');
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
});
