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

// 全部可选；省略密码 = 不改密码，bio/image 可置 null。
export type UserUpdate = {
  email?: string;
  username?: string;
  password?: string;
  bio?: string | null;
  image?: string | null;
}

const STORAGE_KEY = 'painless.user';

// localStorage 是外部输入；脏数据一律按未登录（decisions.md #22）。
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 按 unknown 校验（as User 会让 typeof 恒真被 lint 拦截）。
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

// http 不能反向依赖 auth：注册 token 供应商。
http.setTokenGetter(() => currentUser?.token);

// 401 处置需 router 实例（模块加载拿不到），注册点在 Router 树内。

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

export function onAuthChange(handler: (user: User | null) => void) {
  return on(authEvents, 'change', handler);
}

// 先 clear 再 setUser(null)：订阅者随即发新请求，先清保证写回匿名数据（decisions.md #27）。
export function logout() {
  clearAllCaches();
  setUser(null);
}

// 三段链：logout → invalidate 丢快照 → navigate（decisions.md #28）；NCE reject 吞掉 = 停在旧视图。
export function logoutAndNavigate(
  router: RouterInstance<any>,
  to = '/'
) {
  logout();
  invalidate(router);
  void navigate(router, to).catch(() => undefined);
}

// logout → invalidate → navigate 到 /login?redirect（与守卫同款编码）。
// 两级去重：未登录态返回（并发 401 只导航一次）；已在 /login 只登出不导航。
export function bindUnauthorizedRedirect(router: RouterInstance<any>) {
  http.setUnauthorizedHandler(() => {
    if (!getCurrentUser()) return;
    const {pathname, search} = window.location;
    logout();
    if (pathname === '/login') return;
    invalidate(router);
    // NCE reject 吞掉 = 停在旧视图（core 1.15）。
    void navigate(
      router,
      `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`
    ).catch(() => undefined);
  });
}

// 身份变化：匿名期 per-user 投影不可复用（收藏/关注匿名期恒 false）；先清后 set（decisions.md #27）。
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
  clearAllCaches();
  setUser(user);
  return user;
}

// username/bio/image 嵌各缓存实体，旧值不得新鲜命中——先清后 set（decisions.md #28）。
export async function updateUser(update: UserUpdate): Promise<User> {
  const {user} = await http.put<{user: User}>('user', {user: update});
  clearAllCaches();
  setUser(user);
  return user;
}


// auth 只管身份链（fetchProfile 在 services/profile.ts，decisions.md #28）。

