import type {RouterInstance} from '@native-router/core';

import {invalidate, navigate} from '@native-router/core';
import {create, on, emit} from '@for-fun/event-emitter';

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

// Settings 更新载荷（openapi.d.ts 的 UpdateUser schema）：全部字段可选，
// 至少一个字段——省略密码表示不改密码（空串由视图层转成省略），
// bio/image 可置 null（清空简介/头像）。
export type UserUpdate = {
  email?: string;
  username?: string;
  password?: string;
  bio?: string | null;
  image?: string | null;
}

const STORAGE_KEY = 'painless.user';

// localStorage 是外部输入，解析失败或形状不对时按未登录处理。校验覆盖
// 视图直接消费的字段：token（http 凭据）、username（Layout 导航/Avatar
// 直接渲染，缺失时会渲染出 undefined 用户名、头像拿非 string 当图片地
// 址）、image（可选，null 合法，存在时必须是 string 或 null）。email 暂
// 无 UI 消费点，但存储校验与 User 类型形状对齐——类型上必有 string 的
// 字段不放宽，脏数据一律按未登录处理，不把「漂移的存储契约」带进运行时。
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // 校验按 unknown 形状做（而非 as User 直取——那会让 typeof 校验在
    // 类型层恒真，ESLint no-unnecessary-condition 拦截）：token/username/
    // email 必为 string（email 对齐 User 类型形状，见函数头注释），
    // image 可选且 null 合法、存在时必须是 string
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

// 手动登出的三段链收敛（Layout 导航栏与 Settings 页两处同构调用）：
// logout 清缓存+登录态 → invalidate 丢旧账号 viewStack 快照（不清则
// POP 回退直接渲染旧账号数据、绕过会话内已执行过的守卫）→ navigate
// 接管当前视图（缺省回首页）。被取代/取消的导航 reject NCE（core
// 1.15）：吞掉即「停在旧视图」语义。401 处置链不收敛于此——其 navigate
// 目标带 redirect 且已在 /login 时不导航，条件分支不同（见
// bindUnauthorizedRedirect）。
export function logoutAndNavigate(
  router: RouterInstance<any>,
  to = '/'
) {
  logout();
  invalidate(router);
  void navigate(router, to).catch(() => undefined);
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
export function bindUnauthorizedRedirect(router: RouterInstance<any>) {
  http.setUnauthorizedHandler(() => {
    if (!getCurrentUser()) return;
    const {pathname, search} = window.location;
    logout();
    if (pathname === '/login') return;
    // 形参即 RouterInstance（同 util/routerHost 的单 any 参口径）：调用方
    // 注入 views/index.tsx 的 useRouter() 产物，结构兼容无需断言
    invalidate(router);
    // 被取代/取消的导航 reject NCE（core 1.15）：吞掉即「停在旧视图」
    // 语义，与旧版 void（永不 settle）等价
    void navigate(
      router,
      `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`
    ).catch(() => undefined);
  });
}

// 登录/注册成功即账号身份变化（login 同时覆盖「已登录换账号再登录」路
// 径），匿名期 settle 的缓存不可复用：实体投影含 per-user 字段（收藏/
// 关注按观察者视角计算，匿名期恒 false），不清场会在登录后 staleTime 窗
// 口内被 loader 当新鲜命中，登录用户看到错误的未收藏/未关注态。对称
// logout 的「先清后 set」：setUser 发 change 事件，订阅者（Layout 导航）
// 随即以新身份发请求，先清保证这些请求从空缓存出发、写回的是新账号数
// 据而非被本次 clear 误删。tagsCache 的持久化镜像随 clear 内建擦盘——
// tags 是全局数据、重拉廉价，与登出同款清场语义，换取新身份干净冷启动。
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

// Settings 页更新当前用户：RealWorld 契约 PUT /user（鉴权，请求体
// {user: UpdateUser}，200 返回 {user}）。账号身份不变但用户可见面变了
// ——username/bio/image 嵌在各缓存实体（article.author、comment.author、
// profileCache）里，旧值会在 staleTime 窗口内被当新鲜命中渲染成过时
// 数据；与 login/register 同一「先清后 set」链：clearAllCaches 保证
// setUser 的 change 事件订阅者（Layout 导航）随即发起的新请求从空缓存
// 出发。返回服务端权威 User（含可能被改写的 username）供视图跳转。
export async function updateUser(update: UserUpdate): Promise<User> {
  const {user} = await http.put<{user: User}>('user', {user: update});
  clearAllCaches();
  setUser(user);
  return user;
}


// 按 username 查公开档案已移至 services/profile.ts（档案实体服务，
// Profile 路由 loader 与 Register 查重共用同一数据源）——auth 模块只
// 管身份链（登录态、token、账号切变清场）。

