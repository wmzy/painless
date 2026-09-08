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

// 默认白名单把 POST 挡在外（写重放=重复提交）；重试仅瞬态码，4xx 永不重放。
// withRetry 是命名入口（builtin:retry）：withAuth 的 inner: 'builtin:retry'
// 约束从此有锚点，auth 每次重试重取 token（与先前执行顺序一致）。
const client = logged.pipe(ff.use, ff.withRetry(2));

// 只服务效果幂等 toggle（favorite/follow）：重复施加收敛同一终态。
const toggleClient = logged.pipe(ff.use, ff.withRetry(2, {methods: ['POST', 'DELETE']}));

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

// ---- DEV 响应校验：validate factory 在 fetch 时读合并链合成 label --------
// schema 静态烘焙进链（服务层模块级派生一次，生产折叠原样返回 o）；
// label（`GET <url>`）由 factory 从合并链取 url/method 现场合成——同一
// 烘焙链服务多个 URL，调用点不再手写 label。validate 与 json reader 是
// 独立 symbol 槽（validateData 后置消费），烘焙时机不影响取数顺序。
// ajv 经 validate 函数内的分支动态 import 进入，DEV 折叠后零生产字节
// （decisions.md #7）。
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

export function withDevValidation<T extends ff.Options>(
  o: T,
  schema: unknown
): T {
  if (!import.meta.env.DEV || !schema) return o;
  return ff.validate(
    o,
    (client: T) => {
      // 合并链必有 url/method（请求出口保证），收窄一次合成 label——
      // factory 参数保持精确 T，收窄不参与签名逆变判断。
      const {url, method} = client as T & {url: string; method: string};
      return responseSchema(schema, `${method.toUpperCase()} ${url}`);
    }
  ) as unknown as T;
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
// 方一律从 api/toggleApi 派生（withDevValidation/withSignal/任意 ff
// config 函数），RequestInit 不再有独立通道。
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
