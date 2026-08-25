import {create, on, emit} from '@for-fun/event-emitter';

import * as http from '@/util/http';
import {clearAllCaches} from '@/util/useQuery';

export type User = {
  username: string;
  email: string;
  token: string;
  bio?: string;
  image?: string;
}

const STORAGE_KEY = 'painless.user';

// localStorage 是外部输入，解析失败或形状不对时按未登录处理。
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const user = raw ? (JSON.parse(raw) as unknown) : null;
    if (
      user &&
      typeof user === 'object' &&
      typeof (user as User).token === 'string'
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

// 401 自动登出：已登录态凭据过期时后端返回 401，http 层在错误映射处
// 判「401 且 tokenGetter() 非空」后触发此回调。登录/注册失败的 401
// （密码错误）发生在未登录态，token 为空，天然不触发，这里无需再判。
// logout/getCurrentUser 是函数声明，回调真正执行时模块早已初始化完成，
// 不存在 TDZ 问题。
http.setUnauthorizedHandler(() => logout());

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
