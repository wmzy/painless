import * as ff from 'fetch-fun';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://api.realworld.io/api/';

// 基础客户端：统一 baseUrl 与 JSON 头；mapError 保持既有错误契约
// （非 2xx 抛 Error(文案)，调用方依赖 e.message 呈现错误文案）。
// RealWorld 非 2xx 错误体是 {errors: {field: string[]}}（如 422
// {"errors":{"email":["has already been taken"]}}}），也有 {message} 形状：
// 优先取 message，否则把 errors 拼成可读文案。
function errorText(data: unknown): string {
  const body = data as {message?: unknown; errors?: unknown} | undefined;
  if (typeof body?.message === 'string' && body.message) return body.message;
  if (body?.errors && typeof body.errors === 'object') {
    const parts: string[] = [];
    for (const [field, messages] of Object.entries(body.errors)) {
      for (const m of Array.isArray(messages) ? messages : [messages]) {
        if (typeof m === 'string') parts.push(`${field} ${m}`);
      }
    }
    if (parts.length) return parts.join('; ');
  }
  return '';
}

// ---- 动态 token 注入 ------------------------------------------------------
// auth 服务依赖本模块发请求，本模块不能反向 import auth（会循环依赖）。
// 改为导出注册口：auth 在模块加载时注册 token 供应商，登录/登出只换变量，
// client 管道无需重建。
export type TokenGetter = () => string | undefined;

let tokenGetter: TokenGetter = () => undefined;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

// fetch-fun 的 withAuth 每次请求都会无条件设置 Authorization（无凭据时
// 会产生 "Token " 空头）。在其内侧剥掉无凭据的 Authorization，保证
// 未登录的请求不带该头。经 withAuth 后该头必为 `${scheme} ${credentials}`
// 形态，按「scheme 之后的凭据段」判空。
const stripEmptyAuth: ff.MiddlewareConfig = {
  name: 'painless:strip-empty-auth',
  inner: 'builtin:auth',
  middleware: (f) => (input, init) => {
    const headers = new Headers(init?.headers);
    const value = headers.get('authorization');
    if (value !== null) {
      const credentials = value.trim().split(/\s+/).slice(1).join(' ');
      if (!credentials) {
        headers.delete('authorization');
        return f(input, {...init, headers});
      }
    }
    return f(input, init);
  }
};

const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  // RealWorld 规范用 `Token <token>` 前缀；供应商每次请求重新求值
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.use, stripEmptyAuth)
  .pipe(
    ff.mapError,
    (e: unknown) => (e instanceof ff.HTTPError ? new Error(errorText(e.data)) : e)
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
