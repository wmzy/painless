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

// auth → http 单向依赖（反向即循环）：只能注册供应商，登录/登出换变量、链不重建。
type TokenGetter = () => string | undefined;

let tokenGetter: TokenGetter = () => undefined;

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

// 无 token 的 401 不触发（登录/注册自身的失败不会重定向）。
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

// 重试无法事后替换（同名中间件抛错）：基链无重试，重试只在派生处给定。
const retryLess = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  // timeout=每趟尝试预算（新信号），totalTimeout=整链预算。
  .pipe(ff.timeout, 10_000)
  .pipe(ff.totalTimeout, 30_000)
  // 空凭据跳过 Authorization 报头。
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.mapError, (e: unknown) => {
    if (!(e instanceof ff.HTTPError)) return e;
    if (e.status === 401 && tokenGetter()) fireUnauthorized();
    return e.withMessage(errorText(e.data) || e.message);
  });

const requestLogging = () =>
  ff.withLogging((msg: string, data: unknown) => pushRequestLog(msg, data));

// withLogging 是命名中间件（outer: NORMAL）：排序保证它包在兄弟链
// 各自的 retry 之外——每请求只记一组最终成败，不逐尝试刷屏。
const logged = import.meta.env.DEV
  ? retryLess.pipe(ff.use, requestLogging())
  : retryLess;

// schema 经 withSchema 写入 Options.context，factory 在 fetch 时读合并
// 链合成 label；无 schema 返回 undefined 跳过（fetch-fun ≥0.14.1）。
// ajv 动态 import 进 validate 内部分支，生产零字节（decisions.md #7）。
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

// 参数类型须保持烘焙链（validate 的 F 泛型约束）；运行时实收合并链，收窄一次。
const validation = (client: typeof logged): ff.StandardSchema | undefined => {
  const {context: schema, url, method} = client as typeof client & {
    context: unknown;
    url: string;
    method: string;
  };
  if (!schema) return undefined;
  return responseSchema(schema, `${method.toUpperCase()} ${url}`);
};

const validated = import.meta.env.DEV
  ? (ff.validate(logged, validation) as typeof logged)
  : logged;

// 默认白名单挡 POST（重放=重复提交）；withRetry 为命名入口（builtin:retry），
// withAuth 每趟重试重取 token。
const client = validated.pipe(ff.use, ff.withRetry(2));

// 效果幂等 toggle（favorite/follow）专用：重复施加收敛同一终态。
const toggleClient = validated.pipe(ff.use, ff.withRetry(2, {methods: ['POST', 'DELETE']}));

// 请求函数只收 api/toggleApi 派生链：phantom symbol 无法自然构造，裸
// ff.create 链编译期被拒——auth/401/retry/timeout/mapError 不变量由
// 约定升级为类型保证。品牌随 pipe 的 this: T 泛型流转，全程无断言。
declare const apiBrand: unique symbol;

/** 由 api 派生出的链；请求函数的第三个参数。 */
export type ApiClient = ff.Options & ff.Pipe & {readonly [apiBrand]: never};

// 铸点唯一：never 型 phantom 属性经 unknown 中转一次；此后品牌随
// pipe 泛型流转，不再出现断言。
export const api: ApiClient = client as unknown as ApiClient;
export const toggleApi: ApiClient = toggleClient as unknown as ApiClient;

// schema 经 context 业务槽传给基链 validate factory（DEV 才生效）；
// 生产折叠为恒等返回，validate 槽位与 schema 引用一并摇出。
export function withSchema<T extends ff.Options>(o: T, schema: unknown): T {
  if (!import.meta.env.DEV || !schema) return o;
  return ff.context(o, schema);
}

// ff.signal 要求非空 signal：本包装收 undefined 透传（query 层信号是
// 每请求瞬态，显式存 undefined 保持调用点形状稳定），展开运行时等价。
export function withSignal<T extends ff.Options>(
  o: T,
  signal?: AbortSignal
): T {
  return {...o, signal};
}

// 扩展配置一律从 api/toggleApi 派生（withSchema/withSignal 等）。
export function get<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  o: ApiClient = api
) {
  let chain = ff.url(ff.method(o, 'get'), url);
  if (params) {
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

// 仅效果幂等 toggle；新增实体的写必须走 post/put（永不重放）。
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
