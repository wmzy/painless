import * as ff from 'fetch-fun';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://api.realworld.io/api/';

// 基础客户端：统一 baseUrl 与 JSON 头、超时与重试；mapError 把非 2xx
// 映射为 ApiError（保留 status 与字段级 errors，message 沿用既有可读
// 文案拼接，调用方依赖 e.message 呈现错误文案的部分保持兼容）。
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

// 从错误体提取字段级 errors 并归一为 Record<string, string[]>：
// 响应体是外部输入，非对象形状或非字符串条目一律丢弃，缺省 {}。
function errorFields(data: unknown): Record<string, string[]> {
  const errors = (data as {errors?: unknown} | undefined)?.errors;
  if (!errors || typeof errors !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(errors)) {
    const list = Array.isArray(messages) ? messages : [messages];
    const strings = list.filter((m): m is string => typeof m === 'string');
    if (strings.length) result[field] = strings;
  }
  return result;
}

// 非 2xx 的结构化错误：保留 HTTP 状态码与字段级校验错误，message
// 保持 errorText 的可读拼接（既有调用方按 e.message 展示文案）。
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;

  constructor(
    status: number,
    message: string,
    errors: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
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

// ---- 401 未授权钩子 ------------------------------------------------------
// token 过期/失效时后端返回 401，典型处置是清本地登录态；同样不能让
// http 反向依赖 auth，沿用注册制。错误映射处同步触发，fire-and-forget：
// handler 抛错被吞掉，绝不影响原错误照常抛给调用方。
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
  // 瞬态故障重试：RetryOptions.methods 支持按方法过滤，这里只放行
  // GET/HEAD（读操作幂等，重放无副作用）；statuses/delay/respectRetryAfter
  // 均沿用库默认（statuses = [408,425,429,500,502,503,504]，
  // 指数退避 initial 1s / max 10s，尊重 Retry-After 头）。
  .pipe(ff.use, ff.withRetry(2, {methods: ['GET', 'HEAD']}))
  // 每次「尝试」10s 超时：withTimeout 自带 inner:'builtin:retry' 定位，
  // 中间件排序后包在 retry 内层，重试的每一趟都拿到全新的时间预算。
  .pipe(ff.use, ff.withTimeout(10_000))
  // RealWorld 规范用 `Token <token>` 前缀；供应商每次请求重新求值
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.use, stripEmptyAuth)
  .pipe(ff.mapError, (e: unknown) => {
    if (!(e instanceof ff.HTTPError)) return e;
    // HTTPError 的状态码挂在 response.status（实例上无独立 status 字段）
    const status = e.response.status;
    const apiError = new ApiError(
      status,
      errorText(e.data),
      errorFields(e.data)
    );
    // 已登录态遇 401 视为凭据失效，触发自动登出等处置；未登录态（如
    // 登录失败 401）由注册方自行判空 no-op。
    if (status === 401) fireUnauthorized();
    return apiError;
  });

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

// signal 为只读查询的取消通道：fetch-fun 的 Options 是 RequestInit 的
// 超集，经 withInit 合入后直接透传给 fetch；不传时行为与原先一致。
export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal
) {
  let o = ff.url(withInit(client, {method: 'get', signal}), url);
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
