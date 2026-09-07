import type {RouterInstance} from '@native-router/core';

import {invalidate, navigate} from '@native-router/core';
import {create, on, emit} from '@for-fun/event-emitter';

import * as http from '@/util/http';
import {clearAllCaches} from '@/util/useQuery';

// bio/image 必填且可 null（对齐 spec，decisions.md #6）。
export type User = {
  username: string;
  email: string;
  token: string;
  bio: string | null;
  image: string | null;
}

// Settings 更新载荷：全部可选；省略密码 = 不改密码（视图空串转省略），bio/image 可置 null。
export type UserUpdate = {
  email?: string;
  username?: string;
  password?: string;
  bio?: string | null;
  image?: string | null;
}

const STORAGE_KEY = 'painless.user';

// localStorage 是外部输入，解析失败/形状不对按未登录处理。校验覆盖 token/username/
// image（视图直接消费）；脏数据一律按未登录（decisions.md #22）。
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 按 unknown 形状校验（as User 会让 typeof 恒真被 lint 拦截）：token/username/email 必 string，image 可选/null/string
    const user = raw
      ? (JSON.parse(raw) as Record<string, unknown> | null)
      : null;
    if (
      user &&
      typeof user.token === 'string' &&
      typeof user.username === 'string' &&
      typeof user.email === 'string' &&
      (user.image === undefined ||
        user.image === null ||
        typeof user.image === 'string')
    ) {
      return user as unknown as User;
    }
    return null;
  } catch {
    return null;
  }
}

let currentUser: User | null = readStoredUser();

// http 不能反向依赖 auth：注册 token 供应商，登录/登出后管道自动取最新 token。
http.setTokenGetter(() => currentUser?.token);

// 401 处置需 router 实例（invalidate/navigate），模块加载拿不到——注册点在 Router 树内
//（views/index.tsx 经 bindUnauthorizedRedirect 挂载）；token 供应商注册在此（冷刷新首请求需凭据）。

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

// 登出/切账号后缓存不可复用，整体清空。先 clear 再 setUser(null)（decisions.md #27）：
// setUser 发 change 事件订阅者随即发新请求，先清保证写回匿名数据而非被本次 clear 误删。
export function logout() {
  clearAllCaches();
  setUser(null);
}

// 手动登出三段链：logout → invalidate 丢旧账号 viewStack 快照 → navigate（decisions.md #28）。
// NCE reject 吞掉 = 停在旧视图；401 链不收敛于此（条件分支不同）。
export function logoutAndNavigate(
  router: RouterInstance<any>,
  to = '/'
) {
  logout();
  invalidate(router);
  void navigate(router, to).catch(() => undefined);
}

// 401 处置链（http 判「401 且 token 非空」，登录失败 401 在未登录态不进来）：
// logout → invalidate → navigate 到 /login?redirect=<原 path+search>（与守卫同款编码）。
// 两级去重：未登录态返回（并发 401 导航只一次）；已在 /login 只登出不导航。
export function bindUnauthorizedRedirect(router: RouterInstance<any>) {
  http.setUnauthorizedHandler(() => {
    if (!getCurrentUser()) return;
    const {pathname, search} = window.location;
    logout();
    if (pathname === '/login') return;
    // 形参即 RouterInstance（#27 收口）：views/index.tsx 注入 useRouter() 产物
    invalidate(router);
    // NCE reject 吞掉 = 停在旧视图（core 1.15）
    void navigate(
      router,
      `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`
    ).catch(() => undefined);
  });
}

// 登录/注册即身份变化（login 也覆盖换账号），匿名期 settle 的 per-user 投影不可复用
//（收藏/关注匿名期恒 false）。对称 logout「先清后 set」（decisions.md #27 P0）：
// 先清保证订阅者新请求从空缓存出发；tags 镜像随 clear 内建擦盘。
export async function login(email: string, password: string) {
  const {user} = await http.post<{user: User}>('users/login', {
    user: {email, password}
  });
  clearAllCaches();
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
  // 身份变化清场同 login（见其函数头注释）
  clearAllCaches();
  setUser(user);
  return user;
}

// 更新当前用户（PUT /user，{user} 请求/响应）：身份不变但 username/bio/image 嵌各缓存实体，
// 旧值不得新鲜命中——同 login/register「先清后 set」（decisions.md #28）。返回权威 User 供跳转。
export async function updateUser(update: UserUpdate): Promise<User> {
  const {user} = await http.put<{user: User}>('user', {user: update});
  clearAllCaches();
  setUser(user);
  return user;
}


// fetchProfile 已移至 services/profile.ts（decisions.md #28）；auth 只管身份链。

