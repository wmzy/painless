import {useEffect, useState} from 'react';
import {View, useRouter, ScrollRestoration} from '@native-router/react';
import {navigate, invalidate, refresh} from '@native-router/core';
import {NavigationBar, NavLink, Container, Title} from 'haze-ui';

import {
  getCurrentUser,
  logout,
  onAuthChange,
  type User
} from '@/services/auth';

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
        <NavLink href='/'>
          <Title level={3}>Painless</Title>
        </NavLink>
        <NavLink href='/'>Home</NavLink>
        <NavLink href='/help'>Help</NavLink>
        <NavLink href='/about'>About</NavLink>
        {user ? (
          <>
            <span>{user.username}</span>
            <NavLink href='/editor'>New Article</NavLink>
            <NavLink
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
            </NavLink>
          </>
        ) : (
          <>
            <NavLink href='/login'>Login</NavLink>
            <NavLink href='/register'>Register</NavLink>
          </>
        )}
      </NavigationBar>
      <Container>
        <View />
      </Container>
    </div>
  );
}
