import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {fetchJSON, get, del, post, put} from '@/util/http';

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
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({data: 'test'})
      };
      fetchMock.mockResolvedValue(mockResponse);

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
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({data: 'test'})
      };
      fetchMock.mockResolvedValue(mockResponse);

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
      const mockResponse = {
        ok: false,
        json: vi.fn().mockResolvedValue({message: 'Error message'})
      };
      fetchMock.mockResolvedValue(mockResponse);

      await expect(fetchJSON('test')).rejects.toThrow('Error message');
    });
  });

  describe('get', () => {
    it('should make GET request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({data: 'test'})
      };
      fetchMock.mockResolvedValue(mockResponse);

      await get('articles');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles',
        expect.objectContaining({method: 'get'})
      );
    });

    it('should append query string when params provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({data: 'test'})
      };
      fetchMock.mockResolvedValue(mockResponse);

      await get('articles', {limit: 10, offset: 0});

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.objectContaining({method: 'get'})
      );
    });
  });

  describe('del', () => {
    it('should make DELETE request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({success: true})
      };
      fetchMock.mockResolvedValue(mockResponse);

      await del('articles/123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.realworld.io/api/articles/123',
        expect.objectContaining({method: 'delete'})
      );
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({article: {id: 1}})
      };
      fetchMock.mockResolvedValue(mockResponse);

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
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({article: {id: 1}})
      };
      fetchMock.mockResolvedValue(mockResponse);

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
