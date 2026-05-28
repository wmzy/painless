import {encode} from 'qss';

export function fetchJSON(
  url: string,
  init?: RequestInit & {headers?: {[k in Lowercase<string>]: string}}
) {
  return fetch(`https://api.realworld.io/api/${url}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...init?.headers
    }
  })
    .then((res) => Promise.all([res, res.json()]))
    .then(([res, body]) => {
      if (res.ok) return body;
      throw new Error(body.message);
    });
}

export function get(url: string, params?: {[k in string]: any}) {
  if (params) url += `?${encode(params)}`;
  return fetchJSON(url, {method: 'get'});
}

export function del(url: string) {
  return fetchJSON(url, {method: 'delete'});
}

export function post(url: string, data: any) {
  return fetchJSON(url, {method: 'post', body: JSON.stringify(data)});
}

export function put(url: string, data: any) {
  return fetchJSON(url, {method: 'put', body: JSON.stringify(data)});
}
