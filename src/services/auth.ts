import type {Author} from '@/types';

import {invalidate, navigate} from '@native-router/core';
import {create, on, emit} from '@for-fun/event-emitter';
import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {clearAllCaches} from '@/util/useQuery';

// bio/image 对齐 spec（openapi.d.ts 的 User schema）：登录/注册响应里
// 必带且可 null（Author 同款口径，见 types/index.ts）。
export type User = {
  username: string;
  email: string;
  token: string;
  bio: string | null;
  image: string | null;
}

const STORAGE_KEY = 'painless.user';

// localStorage 是外部输入，解析失败或形状不对时按未登录处理。校验覆盖
// 视图直接消费的字段：token（http 凭据）、username（Layout 导航/Avatar
// 直接渲染，缺失时会渲染出 undefined 用户名、头像拿非 string 当图片地
// 址）、image（可选，null 合法，存在时必须是 string 或 null）。
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const user = raw ? (JSON.parse(raw) as unknown) : null;
    if (
      user &&
      typeof user === 'object' &&
      typeof (user as User).token === 'string' &&
      typeof (user as User).username === 'string' &&
      ((user as User).image === undefined ||
        (user as User).image === null ||
        typeof (user as User).image === 'string')
    ) {
      return user as User;
    }
    return null;
  } catch {
    return null;
  }
}

let currentUser: User | null = readStoredUser();

// http 模块不能反向依赖本模块（auth → http 单向）：以注册制把动态
// token 供应商交给 http，登录/登出后管道自动取到最新 token。
http.setTokenGetter(() => currentUser?.token);

// 401 处置链的注册移出模块加载（原 setUnauthorizedHandler(() => logout())
// 只清登录态）：处置在登出之外还要回跳登录页，链路需要 router 实例
//（invalidate/navigate），模块加载时拿不到——注册点在 Router 树内
//（views/index.tsx 经下方 bindUnauthorizedRedirect 挂载，时序论证见彼处
// 注释），token 供应商注册保持在此（冷刷新首个 data 请求就要带凭据）。

const authEvents = create<['change', [User | null]]>();

function setUser(user: User | null) {
  currentUser = user;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  emit(authEvents, 'change', user);
}

export function getCurrentUser(): User | null {
  return currentUser;
}

// 返回取消订阅函数（配合 useEffect 清理）。
export function onAuthChange(handler: (user: User | null) => void) {
  return on(authEvents, 'change', handler);
}

// 切账号/登出后，缓存里上一账号拉过的数据不可复用（可能含私有内容，
// 也会被下一账号的页面当作命中数据直接渲染），必须整体清空。
// 先 clear 再 setUser(null)：setUser 会发 change 事件，订阅者（如
// Layout 导航）可能随即发起新请求；先清缓存可保证这些登出后的新请求
// 写回的是匿名数据，而不是被本次 clear 误删。
export function logout() {
  clearAllCaches();
  setUser(null);
}

// 401 处置链（http 层判「401 且 token 非空」后触发——登录/注册失败的
// 401 发生在未登录态，token 为空，天然不进来）：登出清场后回跳登录页，
// 复用 Layout 手动登出的同一套语义（logout 清缓存+登录态 → invalidate
// 丢旧账号 viewStack 快照 → navigate 接管当前视图），目标换成
// /login?redirect=<原 path+search>（window.location 整体 encodeURIComponent
// ，与 requireLogin 守卫重定向同款编码，Login 侧读回完整原目的页）。
// 两级去重：未登录态直接返回——并发 401 里首个触发已登出（token 清空
// 后 http 侧也不再触发，这里兜测试直调与同拍竞态），导航只发生一次；
// 已在 /login 只登出不导航（回跳目标无意义）。注册点需 router 实例，
// 由 views/index.tsx 在 Router 树内挂载（bindUnauthorizedRedirect 的
// 调用方），本模块加载时不再注册。
export function bindUnauthorizedRedirect(router: unknown) {
  http.setUnauthorizedHandler(() => {
    if (!getCurrentUser()) return;
    const {pathname, search} = window.location;
    logout();
    if (pathname === '/login') return;
    // 宽参经一次断言收拢（同 util/mock.ts 的 refresh 闭包先例）：调用
    // 方注入的就是真 router 实例（views/index.tsx 的 useRouter() 产物）
    const r = router as Parameters<typeof navigate>[0];
    invalidate(r);
    // 被取代/取消的导航 reject NCE（core 1.15）：吞掉即「停在旧视图」
    // 语义，与旧版 void（永不 settle）等价
    void navigate(
      r,
      `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`
    ).catch(() => undefined);
  });
}

export async function login(email: string, password: string) {
  const {user} = await http.post<{user: User}>('users/login', {
    user: {email, password}
  });
  setUser(user);
  return user;
}

export async function register(
  username: string,
  email: string,
  password: string
) {
  const {user} = await http.post<{user: User}>('users', {
    user: {username, email, password}
  });
  setUser(user);
  return user;
}

// 按 username 查公开档案：RealWorld 契约 GET profiles/{username}，无需
// 鉴权（匿名可查），200 返回 {profile}（Author 形状），用户不存在时 404
// ——非 2xx 由 http 层统一映射为 ff.HTTPError（status/data 可判别），
// 调用方据此区分「占用 / 可用」。Register 的用户名异步查重正是复用该
// 端点：200 = 已被占用，404 = 可用（见 util/validators 的
// usernameAvailable）。路径参数经 fillPath（同 services/article.ts 先例）
// ：`{username}` 占位符在编译期约束参数集合，运行时逐值
// encodeURIComponent，用户名里的空格/斜杠/中文不依赖裸插值。尾参 signal
// 透传给 fetch——被超越的校验轮次可撤销在途请求，与其余只读查询一致。
export function fetchProfile(
  username: string,
  signal?: AbortSignal
): Promise<Author> {
  return http
    .get<{profile: Author}>(
      fillPath('profiles/{username}', {username}),
      undefined,
      {signal}
    )
    .then(({profile}) => profile);
}
