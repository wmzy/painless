import {encode} from 'qss';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://api.realworld.io/api/';

export function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInit & {headers?: Record<Lowercase<string>, string>}
): Promise<T> {
  const customHeaders = init?.headers as
    | Record<string, string>
    | undefined;
  return fetch(BASE_URL + url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(customHeaders ?? {})
    }
  }).then(async (res) => {
    const body: T = (await res.json()) as T;
    if (res.ok) return body;
    throw new Error((body as {message?: string}).message);
  });
}

export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>
) {
  if (params) url += `?${encode(params)}`;
  return fetchJSON<T>(url, {method: 'get'});
}

export function del<T = unknown>(url: string) {
  return fetchJSON<T>(url, {method: 'delete'});
}

export function post<T = unknown>(url: string, data: unknown) {
  return fetchJSON<T>(url, {method: 'post', body: JSON.stringify(data)});
}

export function put<T = unknown>(url: string, data: unknown) {
  return fetchJSON<T>(url, {method: 'put', body: JSON.stringify(data)});
}
