import * as ff from 'fetch-fun';

import {pushRequestLog} from './requestLog';

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://api.realworld.io/api/';

// RealWorld 非 2xx 错误体是 {errors: {field: string[]}}（如 422
// {"errors":{"email":["has already been taken"]}}}），也有 {message} 形状：
// 优先取 message，否则把 errors 拼成可读文案。调用方依赖 e.message 呈现
// 这份文案，mapError 处据此换写 HTTPError 的 message。
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

// ---- 401 未授权钩子 ------------------------------------------------------
// token 过期/失效时后端返回 401，典型处置是清本地登录态；同样不能让
// http 反向依赖 auth，沿用注册制。触发条件在 mapError 处判：仅当
// 401 且 tokenGetter() 非空——登录/注册自身的 401（密码错误）发生在
// 未登录态，天然不触发。fire-and-forget：handler 抛错被吞掉，绝不影响
// 原错误照常抛给调用方。
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

// 自定义 init：fetch-fun 的 Options 是 RequestInit 的超集，signal 等
// 字段直通原生 fetch；headers 单独挑出做逐个合并（覆盖同名默认头）。
export type RequestInitish = RequestInit & {
  headers?: Record<string, string>;
  /**
   * dev-only 响应校验的 JSON Schema（@/types/index.schema 生成的对象，
   * 或 envelope() 组合的单实体包裹层）。2xx 响应体失配时抛
   * fetch-fun 的 ValidationError（message 定位到路径与期望/实际），
   * 非 2xx 跳过校验（HTTPError 语义不变）；生产构建忽略该字段。
   */
  schema?: unknown;
};

const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  // SPA 三件套（README「The SPA default」）：每次「尝试」10s 超时预算
  // ——withTimeout 自带 inner:'builtin:retry' 定位，重试的每一趟都拿到
  // 全新预算；重试只放行幂等方法 + 瞬态状态码（408/425/429/500/502/
  // 503/504、网络错误、超时），POST 与 4xx 永不重放，退避/Retry-After
  // 均用库默认。totalTimeout 30s 是整请求总预算（含全部重试与退避等待）
  // ：没有它，最坏情形 3 次尝试 × 10s + 指数退避（上限 10s）+ Retry-
  // After（上限 30s）可把一个 GET 挂到分钟级；有它，超预算抛 TimeoutError
  // 收口。
  .pipe(ff.use, ff.withTimeout(10_000))
  .pipe(ff.use, ff.withRetry(2))
  .pipe(ff.totalTimeout, 30_000)
  // RealWorld 规范用 `Token <token>` 前缀；供应商每次尝试重新求值（含
  // 重试），凭据为空串/null/undefined/纯空白时自动跳过 Authorization
  // 报头并删除继承值——未登录请求保持匿名，无需自研剥头中间件。
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  // 官方 mapError 模式：withMessage 换写 message，保留 response/request/
  // data/cause 与 HTTPError 身份——下游 `instanceof HTTPError`、`.status`、
  // `.data`（字段级 errors）全部照常可用。错误体解析不出文案时（如 HTML
  // 错误页）保留库默认的「GET <url> failed with status 401」句式兜底。
  .pipe(ff.mapError, (e: unknown) => {
    if (!(e instanceof ff.HTTPError)) return e;
    if (e.status === 401 && tokenGetter()) fireUnauthorized();
    return e.withMessage(errorText(e.data) || e.message);
  });

// dev-only 请求日志：Request/Response/Error 事件推入 requestLog 环形
// 缓冲，DevTool 面板订阅展示。生产构建里 import.meta.env.DEV 折叠为
// false，整个 pipe 分支被摇掉——logging 中间件与缓冲都不进生产包。
const baseClient = import.meta.env.DEV
  ? client.pipe(
      ff.use,
      ff.withLogging((msg, data) => pushRequestLog(msg, data))
    )
  : client;

// init 的其余字段直接合入 Options，自定义 headers 逐个合并以覆盖默认头。
// schema 是校验指令不是请求参数：在这里剥掉，由出口处的 withSchema 消费。
function withInit(o: ff.Options, init?: RequestInitish) {
  const {headers, ...rest} = init ?? {};
  delete (rest as RequestInitish).schema;
  let result = {...o, ...rest} as ff.Options;
  for (const [name, value] of Object.entries(headers ?? {})) {
    result = ff.header(result, name, value);
  }
  return result;
}

// dev-only 响应校验（类型→schema→运行时校验闭环的最后一环）：
// init.schema 携带的 JSON Schema 经 Standard Schema v1 鸭子适配挂上
// fetch-fun 的 validate 中间件（fetch-fun 0.10 自带，对任何标准实现
// 鸭子探测）。校验实现（ajv 动态加载 + 错误定位格式化）在 ./validate，
// 只经这里分支内的动态 import 进入——生产构建 import.meta.env.DEV
// 折叠为 false，适配器、动态 import 与 ajv 全部不进生产 chunk
//（与 mock/faker 同款处理）。
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

// dev-only 请求日志之后的管道出口（baseClient）同时导出为 api：供
// services/article.openapi.ts 的类型化客户端演示复用同一中间件链
//（超时/重试/鉴权/错误映射），演示与手写服务看到完全一致的运行时行为。
// 显式标注可命名的类型（baseClient 的推断类型含 fetch-fun 内部的
// symbol 槽位，declaration 输出命名不了）。
export const api: ff.Options & ff.Pipe = baseClient;

export function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInitish
): Promise<T> {
  const o = withSchema(
    ff.url(withInit(baseClient, init), url),
    init,
    // 只大写 method：URL 原样保留——路径段大小写是服务器语义（RealWorld
    // 的 /articles 与 /Articles 不同址），校验错误的定位信息不得改写它
    `${(init?.method ?? 'GET').toUpperCase()} ${url}`
  );
  // 双重断言：泛型 T 与 ResolveData 互不可证（其余出口的单断言因 o 的
  // 具体类型可直转，这里经 unknown 中转），eslint 与 tsc 同时接受。
  return ff.fetchJSON<T>(o) as unknown as Promise<T>;
}

// signal 为只读查询的取消通道：经 withInit 合入 Options 后直通 fetch；
// 不传时行为与原先一致。
export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInitish
) {
  let o = ff.url(withInit(baseClient, {method: 'get', ...init}), url);
  if (params) {
    // 与 qss 语义一致：undefined 值跳过序列化
    const defined = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number | boolean>;
    o = ff.query(o, defined);
  }
  return ff.fetchJSON<T>(withSchema(o, init, `GET ${url}`)) as Promise<T>;
}

export function del<T = unknown>(url: string, init?: RequestInitish) {
  return ff.fetchJSON<T>(
    withSchema(
      ff.url(ff.method(withInit(baseClient, init), 'delete'), url),
      init,
      `DELETE ${url}`
    )
  ) as Promise<T>;
}

export function post<T = unknown>(
  url: string,
  data: unknown,
  init?: RequestInitish
) {
  return sendJSON<T>('post', url, data, init);
}

export function put<T = unknown>(
  url: string,
  data: unknown,
  init?: RequestInitish
) {
  return sendJSON<T>('put', url, data, init);
}

function sendJSON<T>(
  m: string,
  url: string,
  data: unknown,
  init?: RequestInitish
): Promise<T> {
  return ff.fetchJSON<T>(
    withSchema(
      ff.body(
        ff.method(ff.url(withInit(baseClient, init), url), m),
        JSON.stringify(data)
      ),
      init,
      `${m.toUpperCase()} ${url}`
    )
  ) as Promise<T>;
}
