import * as ff from 'fetch-fun';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://api.realworld.io/api/';

// 基础客户端：统一 baseUrl 与 JSON 头；mapError 保持既有错误契约
// （非 2xx 抛 Error(body.message)，调用方依赖 e.message 呈现错误文案）。
const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  .pipe(
    ff.mapError,
    (e: unknown) =>
      e instanceof ff.HTTPError
        ? new Error((e.data as {message?: string} | undefined)?.message)
        : e
  );

// fetch-fun 的 Options 是 RequestInit 的超集，init 的其余字段直接合入，
// 自定义 headers 逐个合并以覆盖同名默认头。
function withInit(
  o: ff.Options,
  init?: RequestInit & {headers?: Record<Lowercase<string>, string>}
) {
  const {headers, ...rest} = init ?? {};
  let result = {...o, ...rest} as ff.Options;
  for (const [name, value] of Object.entries(headers ?? {})) {
    result = ff.header(result, name, value);
  }
  return result;
}

export function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInit & {headers?: Record<Lowercase<string>, string>}
): Promise<T> {
  return ff.fetchJSON<T>(ff.url(withInit(client, init), url)) as Promise<T>;
}

export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>
) {
  let o = ff.url(withInit(client, {method: 'get'}), url);
  if (params) {
    // 与 qss 语义一致：undefined 值跳过序列化
    const defined = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number | boolean>;
    o = ff.query(o, defined);
  }
  return ff.fetchJSON<T>(o) as Promise<T>;
}

export function del<T = unknown>(url: string) {
  return ff.fetchJSON<T>(
    ff.url(ff.method(client, 'delete'), url)
  ) as Promise<T>;
}

export function post<T = unknown>(url: string, data: unknown) {
  return sendJSON<T>('post', url, data);
}

export function put<T = unknown>(url: string, data: unknown) {
  return sendJSON<T>('put', url, data);
}

function sendJSON<T>(m: string, url: string, data: unknown): Promise<T> {
  return ff.fetchJSON<T>(
    ff.body(ff.method(ff.url(client, url), m), JSON.stringify(data))
  ) as Promise<T>;
}
