import * as ff from 'fetch-fun';

import {parseApiError} from './apiError';
import {pushRequestLog} from './requestLog';

// VITE_API_URL 已并入 ImportMetaEnv 声明合并（src/typings/vite.d.ts），无需断言
const BASE_URL: string =
  import.meta.env.VITE_API_URL || 'https://api.realworld.io/api/';

// 优先 message，否则把 fieldErrors 拼成可读文案（mapError 换写 HTTPError.message）。
// 契约解析共用 ./apiError（decisions.md #22）。
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
// 本模块不能反向 import auth（循环依赖）：注册 token 供应商，登录/登出只换变量，管道不重建。
export type TokenGetter = () => string | undefined;

let tokenGetter: TokenGetter = () => undefined;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

// ---- 401 未授权钩子 ------------------------------------------------------
// 触发仅当 401 且 tokenGetter() 非空（登录/注册自身的 401 在未登录态，不触发）；
// fire-and-forget：handler 抛错被吞，不影响原错误照常上抛。
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

// fetch-fun Options 是 RequestInit 超集；headers 单独逐个合并（覆盖默认头）。
export type RequestInitish = RequestInit & {
  headers?: Record<string, string>;
  /** dev-only 校验 schema：2xx 失配抛 ValidationError，非 2xx 跳过；生产忽略。 */
  schema?: unknown;
};

// ---- 管道工厂：主 client 与 toggle 兄弟 client 同源 -----------------------
// 同一条中间件链，唯一参数是 withRetry 方法白名单。重试策略只能在链声明处一次给定
//（fetch-fun 同名中间件直接抛错，不能同组替换）。
function createApiClient(retryMethods?: readonly string[]) {
  return (
    ff
      .create({baseUrl: BASE_URL})
      .pipe(ff.header, 'content-type', 'application/json')
      .pipe(ff.header, 'accept', 'application/json')
      // 10s 每次尝试预算（withTimeout 定位 inner:'builtin:retry'，每趟全新预算）；
      // 重试仅白名单方法 + 瞬态码，4xx 永不重放。totalTimeout 30s 兜总预算 → TimeoutError。
      .pipe(ff.use, ff.withTimeout(10_000))
      // 写重试边界：默认集把 POST 挡在外（新增实体的写重放=重复提交）；
      // 效果幂等 toggle 由 toggleClient 放宽。
      .pipe(
        ff.use,
        ff.withRetry(2, retryMethods ? {methods: retryMethods} : undefined)
      )
      .pipe(ff.totalTimeout, 30_000)
      // Token <token> 前缀；空凭据自动跳过 Authorization 报头（未登录保持匿名）。
      .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
      // withMessage 换写 message，保留 HTTPError 身份与 .status/.data；解析不出文案时用库默认句式兜底。
      .pipe(ff.mapError, (e: unknown) => {
        if (!(e instanceof ff.HTTPError)) return e;
        if (e.status === 401 && tokenGetter()) fireUnauthorized();
        return e.withMessage(errorText(e.data) || e.message);
      })
  );
}

const client = createApiClient();

// toggle 专用兄弟 client：白名单仅 POST+DELETE，只服务效果幂等的 toggle 端点
//（favorite/follow，重复施加收敛同一终态）。比「默认集 + POST」更窄。
const toggleClient = createApiClient(['POST', 'DELETE']);

// dev-only 请求日志：事件推入 requestLog 环形缓冲，DEV 折叠后整个 pipe 摇掉；
// 两个 client 各套同一接收器。
const requestLogging = () =>
  ff.withLogging((msg: string, data: unknown) => pushRequestLog(msg, data));

const baseClient = import.meta.env.DEV
  ? client.pipe(ff.use, requestLogging())
  : client;

const toggleBase = import.meta.env.DEV
  ? toggleClient.pipe(ff.use, requestLogging())
  : toggleClient;

// init 其余字段合入 Options，headers 逐个合并。schema 是校验指令：从 rest 剥离
//（不散进 Options，由 withSchema 消费）；rest 是解构副本，delete 不动调用方 init。
function withInit(o: ff.Options, init?: RequestInitish) {
  const {headers, ...rest} = init ?? {};
  delete rest.schema;
  let result = {...o, ...rest} as ff.Options;
  for (const [name, value] of Object.entries(headers ?? {})) {
    result = ff.header(result, name, value);
  }
  return result;
}

// dev-only 响应校验：init.schema 经 Standard Schema v1 鸭子适配挂 validate 中间件，
// ajv 经分支内动态 import 进入（DEV 折叠后零生产字节，decisions.md #7）。
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

// baseClient 同时导出为 api（供 article.openapi.ts 类型化客户端复用同一中间件链）；
// 显式标注可命名类型（baseClient 推断类型含内部 symbol，declaration 命名不了）。
export const api: ff.Options & ff.Pipe = baseClient;

export function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInitish
): Promise<T> {
  const o = withSchema(
    ff.url(withInit(baseClient, init), url),
    init,
    // 只大写 method，URL 原样（路径段大小写是服务器语义，校验定位不得改写）
    `${(init?.method ?? 'GET').toUpperCase()} ${url}`
  );
  // 双重断言：泛型 T 与 ResolveData 互不可证，经 unknown 中转
  return ff.fetchJSON<T>(o) as unknown as Promise<T>;
}

// signal 经 withInit 直通 fetch。init 不收 method（Omit 收紧 + 运行时后置合并兜底）：
// get 的方法语义由本出口固定，误传 method 会与 schema label 脱节。
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
// 走 toggleBase（白名单 POST+DELETE）；仅用于「重复施加收敛同一终态」的 toggle。
// 新增实体的写必须走 post/put（POST 默认白名单外，永不重放）。
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
