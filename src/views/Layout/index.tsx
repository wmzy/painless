import {useEffect, useState} from 'react';
import {View, useRouter, ScrollRestoration} from '@native-router/react';
import {navigate} from '@native-router/core';
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
                logout();
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
