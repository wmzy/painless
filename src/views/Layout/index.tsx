import type {AppPaths} from '@/views';

import {useEffect, useState} from 'react';
import {View, useRouter, ScrollRestoration, TypedNavLink} from '@native-router/react';
import {navigate, invalidate, refresh} from '@native-router/core';
import {NavigationBar, NavLink as HazeNavLink, Container, Title} from 'haze-ui';

import {
  getCurrentUser,
  logout,
  onAuthChange,
  type User
} from '@/services/auth';

import ThemeToggle from '@/components/ThemeToggle';

export default function Layout() {
  const router = useRouter();
  // 初始值取 auth 模块加载时恢复的当前用户，之后靠订阅驱动更新
  const [user, setUser] = useState<User | null>(() => getCurrentUser());

  useEffect(() => onAuthChange(setUser), []);

  // bfcache 恢复后的新鲜度补偿：pageshow(persisted) 时页面从往返缓存
  // 整体复活（SPA 收不到任何导航事件），内存里的 viewStack 快照与缓存
  // 原样续用，数据可能早已过时。refresh 使 loader 重跑——withCache 新鲜
  // 命中则零成本，stale 则旧值先行+后台重验证，用户无感换新（组件树
  // 不闪、不回骨架）。
  useEffect(() => {
    const onPageshow = (e: PageTransitionEvent) => {
      if (e.persisted) void refresh(router);
    };
    window.addEventListener('pageshow', onPageshow);
    return () => window.removeEventListener('pageshow', onPageshow);
  }, [router]);

  return (
    <div>
      {/* back/forward 恢复滚动位置；push 回到顶部（POP 始终恢复） */}
      <ScrollRestoration />
      <NavigationBar>
        {/* 品牌 + 导航链接统一走 native-router TypedNavLink：in-app 导航
            （点击 preventDefault + navigate，不再整页刷新），as={HazeNavLink}
            把计算出的 href / 组合 onClick 注入 haze-ui NavLink（其
            forwardRef + rest 透传接住注入）。单类型实参 + as 是官方支持
            的组合形态：to 收窄到 AppPaths（路径拼写错误编译期暴露），
            as 组件自身 props 松检查（TS 无法在首个实参显式后推断第二
            泛型）。active 高亮无需手传：native 侧命中当前路由时注
            aria-current='page'，haze-ui 侧 active 缺省兜底读
            aria-current，两段标准 aria 链路自动点亮。根路径链接（品牌/
            Home）须加 end：不加时 to='/' 按前缀规则对所有路径 active，
            任何页面都会点亮，高亮语义被稀释（react-router 同款惯例）。 */}
        <TypedNavLink<AppPaths> as={HazeNavLink} to='/' end>
          <Title level={3}>Painless</Title>
        </TypedNavLink>
        <TypedNavLink<AppPaths> as={HazeNavLink} to='/' end>
          Home
        </TypedNavLink>
        <TypedNavLink<AppPaths> as={HazeNavLink} to='/help'>
          Help
        </TypedNavLink>
        <TypedNavLink<AppPaths> as={HazeNavLink} to='/about'>
          About
        </TypedNavLink>
        <ThemeToggle />
        {user ? (
          <>
            <span>{user.username}</span>
            <TypedNavLink<AppPaths> as={HazeNavLink} to='/editor'>
              New Article
            </TypedNavLink>
            {/* Logout 不是导航：保持 haze-ui NavLink 的按钮语义（href 缺省
                落 '#' + preventDefault），onClick 里的登出链路原样 */}
            <HazeNavLink
              onClick={() => {
                // logout 已清全部实体缓存；viewStack 里还留着本会话旧账号
                // 的视图快照——不清则 POP 回退会直接渲染旧账号数据、绕过
                // 会话内已执行过的守卫。invalidate 丢弃全部快照，后续
                // POP 落入重解析路径（守卫+loader 重跑）；当前视图不受
                // 影响，由随后的 navigate 接管。
                logout();
                invalidate(router);
                void navigate(router, '/');
              }}
            >
              Logout
            </HazeNavLink>
          </>
        ) : (
          <>
            <TypedNavLink<AppPaths> as={HazeNavLink} to='/login'>
              Login
            </TypedNavLink>
            <TypedNavLink<AppPaths> as={HazeNavLink} to='/register'>
              Register
            </TypedNavLink>
          </>
        )}
      </NavigationBar>
      <Container>
        <View />
      </Container>
    </div>
  );
}
