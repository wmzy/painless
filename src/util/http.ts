import * as ff from 'fetch-fun';

import {parseApiError} from './apiError';
import {pushRequestLog} from './requestLog';

const BASE_URL: string =
  import.meta.env.VITE_API_URL || 'https://api.realworld.show/api/';

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
type TokenGetter = () => string | undefined;

let tokenGetter: TokenGetter = () => undefined;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

// ---- 401 未授权钩子 ------------------------------------------------------
// 登录/注册自身的 401 在未登录态，不触发。
type UnauthorizedHandler = () => void;

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

// ---- 管道：主 client 与 toggle 兄弟 client 由无重试基链派生 ---------------
// 重试策略只能在链声明处给定（fetch-fun 同名中间件直接抛错，不能替换）。
const retryLess = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  // timeout 选项：fetch 每趟尝试建全新信号预算（区别于整链 totalTimeout）。
  .pipe(ff.timeout, 10_000)
  .pipe(ff.totalTimeout, 30_000)
  // 空凭据自动跳过 Authorization 报头（未登录保持匿名）。
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.mapError, (e: unknown) => {
    if (!(e instanceof ff.HTTPError)) return e;
    if (e.status === 401 && tokenGetter()) fireUnauthorized();
    return e.withMessage(errorText(e.data) || e.message);
  });

const requestLogging = () =>
  ff.withLogging((msg: string, data: unknown) => pushRequestLog(msg, data));

// 日志挂在共享基链（DEV 才接线）：withLogging 是命名中间件且声明
// outer: NORMAL，排序系统保证它包在兄弟链各自的 retry 之外——每请求
// 仍只记一组最终成败，不逐尝试刷屏。生产折叠后 logged 恒等于 retryLess。
const logged = import.meta.env.DEV
  ? retryLess.pipe(ff.use, requestLogging())
  : retryLess;

// ---- DEV 响应校验：validate 与日志同法挂共享基链（DEV 才接线） -----------
// schema 不再逐端点烘焙进链：调用点经 withSchema 把 schema 写入
// Options.context 业务槽（fetch-fun 文档钦点的 validate-factory 用法），
// factory 在 fetch 时收到完全合并的链——从 context 读 schema、从
// url/method 现场合成 label（`GET <url>`），同一基链服务全部 URL。
// 契约约束：factory 必须返回 Standard Schema，未带 schema 的端点（auth、
// 删除等）返回恒等 schema，校验槽位零行为。validate 是独立 symbol 槽，
// 由 data 中间件在最终 2xx 响应上消费一次（非 HTTP 错误不进重试白名单），
// 挂接位置不参与中间件排序。ajv 经 validate 函数内的分支动态 import
// 进入，DEV 折叠后零生产字节（decisions.md #7）。
const passthroughSchema: ff.StandardSchema = {
  '~standard': {
    version: 1,
    vendor: 'painless/passthrough',
    validate: (value: unknown) => ({value})
  }
};

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

// factory 参数保持烘焙链类型（F 泛型约束要求），运行时实收完全合并链
// （url/method/context 皆在）——收窄一次后合成 label。
const validation = (client: typeof logged): ff.StandardSchema => {
  const {context: schema, url, method} = client as typeof client & {
    context: unknown;
    url: string;
    method: string;
  };
  if (!schema) return passthroughSchema;
  return responseSchema(schema, `${method.toUpperCase()} ${url}`);
};

// 生产折叠后 validated 恒等于 logged（与 logged 同款 DEV 接线）。
const validated = import.meta.env.DEV
  ? (ff.validate(logged, validation) as typeof logged)
  : logged;

// 默认白名单把 POST 挡在外（写重放=重复提交）；重试仅瞬态码，4xx 永不重放。
// withRetry 是命名入口（builtin:retry）：withAuth 的 inner: 'builtin:retry'
// 约束从此有锚点，auth 每次重试重取 token（与先前执行顺序一致）。
const client = validated.pipe(ff.use, ff.withRetry(2));

// 只服务效果幂等 toggle（favorite/follow）：重复施加收敛同一终态。
const toggleClient = validated.pipe(ff.use, ff.withRetry(2, {methods: ['POST', 'DELETE']}));

// ---- 链派生品牌 ----------------------------------------------------------
// 请求函数只接受从 api/toggleApi 派生的链：phantom symbol 属性无法自然
// 构造，ff.create(...) 裸链在编译期被拒——auth/401/retry/timeout/
// mapError 整链不变量从约定升级为类型保证。config 函数的返回类型保留
// 泛型 T（pipe 的 this: T 传播），品牌随每次派生原样流转。
declare const apiBrand: unique symbol;

/** 由 api 派生出的链；请求函数的第三个参数。 */
export type ApiClient = ff.Options & ff.Pipe & {readonly [apiBrand]: never};

// 显式标注可命名类型（推断含内部 symbol）；article.openapi.ts 复用同一中间件链。
// 铸点唯一：never 型 phantom 属性无法自然构造，断言经 unknown 中转一次，
// 此后品牌只随 pipe 的 this: T 泛型流转，不再出现任何断言。
export const api: ApiClient = client as unknown as ApiClient;
export const toggleApi: ApiClient = toggleClient as unknown as ApiClient;

// ---- 响应 schema 声明（Options.context 业务槽） ----------------------------
// 调用点声明「本链响应须符合该 schema」（DEV 才生效）：schema 写入
// fetch-fun Options.context，基链上的 validate factory 在 fetch 时从
// 合并链读回并校验。与 withSignal 同构——每端点静态数据，模块级烘焙
// 一次；生产折叠恒等返回 o（validate 槽位与 schema 引用一并摇出）。
export function withSchema<T extends ff.Options>(o: T, schema: unknown): T {
  if (!import.meta.env.DEV || !schema) return o;
  return {...o, context: schema};
}

// ---- per-request signal 挂点 ---------------------------------------------
// 信号是每请求瞬态（query 层尾附 AbortSignal，失败/卸载即中止）；
// 显式存 undefined 保持调用点契约形状稳定，runner 透传无副作用。
export function withSignal<T extends ff.Options>(
  o: T,
  signal?: AbortSignal
): T {
  return {...o, signal};
}

// ---- 请求出口 ------------------------------------------------------------
// 第三个参数默认 api（toggle 出口默认 toggleApi）；需要扩展配置的调用
// 方一律从 api/toggleApi 派生（withSchema/withSignal/任意 ff config
// 函数），RequestInit 不再有独立通道。
export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  o: ApiClient = api
) {
  let chain = ff.url(ff.method(o, 'get'), url);
  if (params) {
    // 与 qss 语义一致：undefined 值跳过序列化
    const defined = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number | boolean>;
    chain = ff.query(chain, defined);
  }
  return ff.fetchJSON<T>(chain) as Promise<T>;
}

function delJSON<T>(o: ff.Options, url: string) {
  return ff.fetchJSON<T>(ff.url(ff.method(o, 'delete'), url)) as Promise<T>;
}

export function del<T = unknown>(url: string, o: ApiClient = api) {
  return delJSON<T>(o, url);
}

export function post<T = unknown>(
  url: string,
  data: unknown,
  o: ApiClient = api
) {
  return sendJSON<T>('post', url, data, o);
}

export function put<T = unknown>(
  url: string,
  data: unknown,
  o: ApiClient = api
) {
  return sendJSON<T>('put', url, data, o);
}

// ---- 效果幂等写出口（toggle 端点专用）------------------------------------
// 仅用于效果幂等 toggle；新增实体的写必须走 post/put（永不重放）。
export function postRetryable<T = unknown>(
  url: string,
  data: unknown,
  o: ApiClient = toggleApi
) {
  return sendJSON<T>('post', url, data, o);
}

export function delRetryable<T = unknown>(url: string, o: ApiClient = toggleApi) {
  return delJSON<T>(o, url);
}

function sendJSON<T>(
  m: string,
  url: string,
  data: unknown,
  o: ff.Options
): Promise<T> {
  return ff.fetchJSON<T>(
    ff.body(ff.method(ff.url(o, url), m), JSON.stringify(data))
  ) as Promise<T>;
}
