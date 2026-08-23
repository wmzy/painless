import {create, on, emit} from '@for-fun/event-emitter';

import * as http from '@/util/http';

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

export function logout() {
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
