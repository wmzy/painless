import * as ff from 'fetch-fun';

import {parseApiError} from './apiError';
import {pushRequestLog} from './requestLog';

const BASE_URL: string =
  import.meta.env.VITE_API_URL || 'https://api.realworld.io/api/';

function errorText(data: unknown): string {
  const {message, fieldErrors} = parseApiError(data);
  if (message) return message;
  if (!fieldErrors) return '';
  const parts: string[] = [];
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const m of messages) parts.push(`${field} ${m}`);
  }
  return parts.join('; ');
}

// ---- 动态 token 注入 ------------------------------------------------------
// 不能反向 import auth（循环依赖）：注册供应商，登录/登出只换变量，管道不重建。
export type TokenGetter = () => string | undefined;

let tokenGetter: TokenGetter = () => undefined;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

// ---- 401 未授权钩子 ------------------------------------------------------
// 登录/注册自身的 401 在未登录态，不触发。
export type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler = () => undefined;

export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  unauthorizedHandler = fn;
}

function fireUnauthorized() {
  try {
    unauthorizedHandler();
  } catch {
    // 回调异常不改变请求错误路径
  }
}

export type RequestInitish = RequestInit & {
  headers?: Record<string, string>;
  /** dev-only 校验 schema：2xx 失配抛 ValidationError，非 2xx/生产跳过。 */
  schema?: unknown;
};

// ---- 管道工厂：主 client 与 toggle 兄弟 client 同源 -----------------------
// 重试策略只能在链声明处给定（fetch-fun 同名中间件直接抛错，不能替换）。
function createApiClient(retryMethods?: readonly string[]) {
  return (
    ff
      .create({baseUrl: BASE_URL})
      .pipe(ff.header, 'content-type', 'application/json')
      .pipe(ff.header, 'accept', 'application/json')
      // withTimeout 定位 inner:'builtin:retry'：每趟尝试全新预算。
      .pipe(ff.use, ff.withTimeout(10_000))
      // 默认白名单把 POST 挡在外（写重放=重复提交）；重试仅瞬态码，4xx 永不重放。
      .pipe(
        ff.use,
        ff.withRetry(2, retryMethods ? {methods: retryMethods} : undefined)
      )
      .pipe(ff.totalTimeout, 30_000)
      // 空凭据自动跳过 Authorization 报头（未登录保持匿名）。
      .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
      .pipe(ff.mapError, (e: unknown) => {
        if (!(e instanceof ff.HTTPError)) return e;
        if (e.status === 401 && tokenGetter()) fireUnauthorized();
        return e.withMessage(errorText(e.data) || e.message);
      })
  );
}

const client = createApiClient();

// 只服务效果幂等 toggle（favorite/follow）：重复施加收敛同一终态。
const toggleClient = createApiClient(['POST', 'DELETE']);

const requestLogging = () =>
  ff.withLogging((msg: string, data: unknown) => pushRequestLog(msg, data));

const baseClient = import.meta.env.DEV
  ? client.pipe(ff.use, requestLogging())
  : client;

const toggleBase = import.meta.env.DEV
  ? toggleClient.pipe(ff.use, requestLogging())
  : toggleClient;

function withInit(o: ff.Options, init?: RequestInitish) {
  const {headers, ...rest} = init ?? {};
  delete rest.schema;
  let result = {...o, ...rest} as ff.Options;
  for (const [name, value] of Object.entries(headers ?? {})) {
    result = ff.header(result, name, value);
  }
  return result;
}

// ajv 经分支内动态 import 进入，DEV 折叠后零生产字节（decisions.md #7）。
function responseSchema(schema: unknown, label: string): ff.StandardSchema {
  return {
    '~standard': {
      version: 1,
      vendor: 'painless/json-schema',
      validate: async (value: unknown) => {
        const {check} = await import('./validate');
        return check(schema, value, label);
      }
    }
  };
}

function withSchema<T extends ff.Options>(
  o: T,
  init: RequestInitish | undefined,
  label: string
): T {
  const schema = init?.schema;
  if (!import.meta.env.DEV || !schema) return o;
  return ff.validate(o, responseSchema(schema, label)) as unknown as T;
}

// 显式标注可命名类型（推断含内部 symbol）；article.openapi.ts 复用同一中间件链。
export const api: ff.Options & ff.Pipe = baseClient;

export function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInitish
): Promise<T> {
  const o = withSchema(
    ff.url(withInit(baseClient, init), url),
    init,
    // 只大写 method，URL 原样（路径段大小写是服务器语义）。
    `${(init?.method ?? 'GET').toUpperCase()} ${url}`
  );
  // 双重断言：T 与 ResolveData 互不可证，经 unknown 中转。
  return ff.fetchJSON<T>(o) as unknown as Promise<T>;
}

export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  init?: Omit<RequestInitish, 'method'>
) {
  let o = ff.url(withInit(baseClient, {...init, method: 'get'}), url);
  if (params) {
    // 与 qss 语义一致：undefined 值跳过序列化
    const defined = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number | boolean>;
    o = ff.query(o, defined);
  }
  return ff.fetchJSON<T>(withSchema(o, init, `GET ${url}`)) as Promise<T>;
}

function delJSON<T>(o: ff.Options, url: string, init?: RequestInitish) {
  return ff.fetchJSON<T>(
    withSchema(
      ff.url(ff.method(withInit(o, init), 'delete'), url),
      init,
      `DELETE ${url}`
    )
  ) as Promise<T>;
}

export function del<T = unknown>(url: string, init?: RequestInitish) {
  return delJSON<T>(baseClient, url, init);
}

export function post<T = unknown>(
  url: string,
  data: unknown,
  init?: RequestInitish
) {
  return sendJSON<T>('post', url, data, init, baseClient);
}

export function put<T = unknown>(
  url: string,
  data: unknown,
  init?: RequestInitish
) {
  return sendJSON<T>('put', url, data, init, baseClient);
}

// ---- 效果幂等写出口（toggle 端点专用）------------------------------------
// 仅用于效果幂等 toggle；新增实体的写必须走 post/put（永不重放）。
export function postRetryable<T = unknown>(
  url: string,
  data: unknown,
  init?: RequestInitish
) {
  return sendJSON<T>('post', url, data, init, toggleBase);
}

export function delRetryable<T = unknown>(url: string, init?: RequestInitish) {
  return delJSON<T>(toggleBase, url, init);
}

function sendJSON<T>(
  m: string,
  url: string,
  data: unknown,
  init: RequestInitish | undefined,
  client: ff.Options
): Promise<T> {
  return ff.fetchJSON<T>(
    withSchema(
      ff.body(
        ff.method(ff.url(withInit(client, init), url), m),
        JSON.stringify(data)
      ),
      init,
      `${m.toUpperCase()} ${url}`
    )
  ) as Promise<T>;
}
