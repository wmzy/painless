import type {AppPaths} from '@/views';

import {useEffect, useState} from 'react';
import {css} from '@linaria/core';
import {View, useRouter, ScrollRestoration, TypedNavLink} from '@native-router/react';
import {refresh} from '@native-router/core';
import {NavigationBar, NavLink as HazeNavLink, Container, Title} from 'haze-ui';

import {
  getCurrentUser,
  logoutAndNavigate,
  onAuthChange,
  type User
} from '@/services/auth';

import ThemeToggle from '@/components/ThemeToggle';

// 应用外壳：纵向 flex 撑满视口——main（flex:1）把 footer 压到短页面
// 底部，根 div 的纸色背景因此铺满整屏（见 theme.css 的根选择器）
const shell = css`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
`;

// 主内容区：flex:1 占满剩余高度；块向 padding 是页面级呼吸位——此前
// Container 只有 inline padding，内容贴着导航栏下沿开始
const main = css`
  flex: 1;
  padding-block: var(--haze-space-8) var(--haze-space-12);
`;

// 导航右簇：主题开关 + 会话动作推右，与主导航分层
const navEnd = css`
  margin-inline-start: auto;
  display: flex;
  align-items: center;
  gap: var(--haze-space-3);
`;

const footerStyle = css`
  border-top: 1px solid var(--haze-color-border);
  padding: var(--haze-space-6) var(--haze-space-4);
  text-align: center;
  font-size: var(--haze-text-xs);
  color: var(--haze-color-text-muted);
`;

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
      // refresh 同为可取消链：被取代 reject NCE（core 1.15），吞掉即保持
      // 旧快照续用，与旧版 void（永不 settle）等价
      if (e.persisted) void refresh(router).catch(() => undefined);
    };
    window.addEventListener('pageshow', onPageshow);
    return () => window.removeEventListener('pageshow', onPageshow);
  }, [router]);

  return (
    <div className={shell}>
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
        {/* 右簇：主题开关 + 账号动作——margin-inline-start:auto 推右，
            与主导航在视觉上分层（浏览项 vs 会话项） */}
        <div className={navEnd}>
          {user ? (
            <>
              {/* 用户名即本人档案入口（RealWorld 惯例）：动态段 params
                  必传，username 经 TypedLink 编译期判别 */}
              <TypedNavLink<AppPaths>
                as={HazeNavLink}
                to='/profile/:username'
                params={{username: user.username}}
              >
                {user.username}
              </TypedNavLink>
              <TypedNavLink<AppPaths> as={HazeNavLink} to='/editor'>
                New Article
              </TypedNavLink>
              <TypedNavLink<AppPaths> as={HazeNavLink} to='/settings'>
                Settings
              </TypedNavLink>
              {/* Logout 不是导航：保持 haze-ui NavLink 的按钮语义（href 缺省
                  落 '#' + preventDefault），onClick 里的登出链路原样——
                  三段链收敛进 logoutAndNavigate（见 services/auth.ts） */}
              <HazeNavLink onClick={() => logoutAndNavigate(router)}>
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
          {/* 主题开关收尾：会话动作之后、视觉上不横插在导航与账号动作
              之间 */}
          <ThemeToggle />
        </div>
      </NavigationBar>
      <Container className={main}>
        <View />
      </Container>
      {/* 页脚：模板身份落款——整句一个文本节点（品牌词不再单独成
          span，与导航品牌文本查询互不干扰），页面不再戛然而止 */}
      <footer className={footerStyle}>
        <span>Painless — a lightweight React SPA template · RealWorld demo</span>
      </footer>
    </div>
  );
}
