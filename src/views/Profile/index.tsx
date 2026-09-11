import type {AppRoutes} from '@/views';
import type {ProfileFeedQuery} from '@/types';

import {useEffect, useState} from 'react';
import {css} from '@linaria/core';
import {TypedLink} from '@native-router/react';
import {useMutation} from 'react-toolroom/async';
import {useControl} from 'react-use-control';
import {
  AsyncSection,
  Avatar,
  Button,
  ButtonLink,
  Card,
  Flex,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Title
} from 'haze-ui';

import {getCurrentUser, onAuthChange, type User} from '@/services/auth';
import {useProfileData, useProfileFeedQuery} from '@/services/dataloaders';
import {favoriteOnProfileFeed, followOnProfile} from '@/services/mutations';
import {useToastError} from '@/util/toastError';
import {useTitle} from '@/util/useTitle';
import {DEFAULT_LIMIT} from '@/types/search';
import ArticlePreview from '@/views/Home/ArticlePreview';
import {useFavorite, useRequireAuth} from '@/views/_shared/useFavorite';

// 单列内容页收敛到文章页同宽（860）——banner 与 tab feed 对齐成一个
// 编辑栏，与首页双栏（feed+aside）是刻意两种宽度体系
const column = css`
  max-width: 860px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: var(--haze-space-5);
`;

// 两个 tab 的查询维度：'author' = 我的文章（?author=username），
// 'favorited' = 收藏的文章（?favorited=username）
type ProfileTab = 'author' | 'favorited';

export default function Profile() {
  // 路由声明了 profileLoader，进组件前数据必已 resolve。
  const profile = useProfileData();
  useTitle(`${profile.username} · Painless`);
  // 登录态订阅（Layout 同款）：isOwn 与 follow 闸门要最新用户——auth
  // change 事件驱动重渲染，不订阅则登录后留在本页的按钮态是过期值。
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  useEffect(() => onAuthChange(setUser), []);
  const isOwn = user?.username === profile.username;

  // tab 经 useControl 双向绑定 Tabs，查询与面板共用同一事实源。种子必须
  // 非 null（运行时分派：显式 null 被当初始值本身、第二参被忽略）。tab/
  // 分页是页内浏览态而非可分享过滤面，不落 URL（与 Home 的 search 刻意
  // 不同）。
  const [tab, , tabCtrl] = useControl<ProfileTab>('author');
  // 分页挂 username × tab 维度：换维度/换档案（同路由 param 变化不卸载
  // 组件）时旧偏移不适用。渲染期非当前组合的偏移视为 0（回第一页），不
  // 产生「新 tab × 旧 offset」的中间查询；切回原组合时旧偏移仍在（缓存
  // 页命中，恢复页位零成本）。
  const [paging, setPaging] = useState<{
    username: string;
    tab: ProfileTab;
    offset: number;
  }>({username: profile.username, tab: 'author', offset: 0});
  const offset =
    paging.username === profile.username && paging.tab === tab
      ? paging.offset
      : 0;
  const setOffset = (next: number) =>
    setPaging({username: profile.username, tab, offset: next});

  // args 即 profileFeedCache 的 key：未缓存 key 重入 loading，已缓存 key
  // 直接命中（来回切换不重拉）。
  const feedQuery: ProfileFeedQuery = {
    username: profile.username,
    scope: tab,
    offset,
    limit: DEFAULT_LIMIT
  };
  const {data: feed, loading, error, refetch, fetching} = useProfileFeedQuery([feedQuery]);

  const toastError = useToastError();
  const requireAuth = useRequireAuth();
  // follow 写穿 profileCache（key=[username] 与 profileLoader 同寻址，
  // 声明见 mutations.ts 的 followOnProfile）：乐观翻转 → apply → 失败
  // 回滚；set 事件经 bindRefresh 自动 refresh，banner 无需手工刷新。
  const [follow] = useMutation(followOnProfile, {
    scope: (username: string) => `profile-follow:${username}`
  });
  // 列表卡片收藏：useFavorite 收敛跳登录/toast/scope 串行（同 Home），
  // spec 换成 profile 列表投影层（favoriteOnProfileFeed）。
  const onFavorite = useFavorite(favoriteOnProfileFeed);

  const toggleFollow = () => {
    if (!requireAuth()) return;
    void follow(profile.username, !profile.following).catch((e: unknown) =>
      toastError(e, 'Follow failed')
    );
  };

  const page = Math.floor(offset / DEFAULT_LIMIT) + 1;
  const totalPages = Math.max(
    1,
    Math.ceil((feed?.articlesCount ?? 0) / DEFAULT_LIMIT)
  );

  // 两个 TabPanel 共用同一份 tab 驱动列表：内容只挂进当前激活面板
  //（TabPanel 恒渲染、hidden 隐藏），避免双份 DOM；aria-controls 指向
  // 的 panel id 恒存在。
  const feedSection = (
    <AsyncSection
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      errorText='Failed to load articles'
    >
      {feed && (
        <>
          {feed.articles.length > 0 ? (
            <>
              {feed.articles.map((a) => (
                <ArticlePreview key={a.slug} article={a} onFavorite={onFavorite} />
              ))}
              {/* 分页走本地 offset 状态（按钮而非链接——页内浏览态，
                  无 URL 状态可回退；边界态用原生 disabled 移出交互） */}
              <Flex align='center' justify='center' gap={8}>
                <Button
                  variant='outline'
                  disabled={offset <= 0}
                  onClick={() => setOffset(Math.max(0, offset - DEFAULT_LIMIT))}
                >
                  ← Previous
                </Button>
                <Text>
                  {page} / {totalPages}
                </Text>
                <Button
                  variant='outline'
                  disabled={offset + DEFAULT_LIMIT >= feed.articlesCount}
                  onClick={() => setOffset(offset + DEFAULT_LIMIT)}
                >
                  Next →
                </Button>
              </Flex>
            </>
          ) : (
            <Text type='muted'>No articles yet.</Text>
          )}
        </>
      )}
    </AsyncSection>
  );

  return (
    // aria-busy 挂 column（含 feed 的最近自有元素）：keepPrevious 翻页保
    // 旧值时 loading=false，AsyncSection 内建的 aria-busy 占位态不再出现，
    // 屏幕阅读器改由这里感知 fetching；AsyncSection/TabPanel 均不透传
    // aria 属性，挂列容器是不加节点不换结构约束下的落点
    <div className={column} aria-busy={fetching}>
      <Card>
        <Flex align='center' justify='space-between' gap={16}>
          {/* 身份簇：头像 + 姓名/简介（左侧分组），右侧行动按钮——
              此前三者同排，follow/设置按钮贴着名字而不是推到卡边 */}
          <Flex align='center' gap={16}>
            <Avatar src={profile.image ?? undefined} alt={profile.username} size='lg' />
            <div>
              <Title>{profile.username}</Title>
              {profile.bio ? <Text>{profile.bio}</Text> : null}
            </div>
          </Flex>
          {/* 自己的档案放设置入口（RealWorld 惯例），他人档案 follow toggle */}
          {isOwn ? (
            <TypedLink<AppRoutes, typeof ButtonLink>
              as={ButtonLink}
              to='/settings'
              variant='outline'
              size='sm'
            >
              Edit Profile Settings
            </TypedLink>
          ) : (
            <Button
              variant={profile.following ? 'solid' : 'outline'}
              size='sm'
              onClick={toggleFollow}
            >
              {profile.following ? 'Unfollow' : 'Follow'} {profile.username}
            </Button>
          )}
        </Flex>
      </Card>
      <Tabs value={tabCtrl}>
        <TabList>
          <Tab value='author'>My Articles</Tab>
          <Tab value='favorited'>Favorited Articles</Tab>
        </TabList>
        <TabPanel value='author'>{tab === 'author' && feedSection}</TabPanel>
        <TabPanel value='favorited'>{tab === 'favorited' && feedSection}</TabPanel>
      </Tabs>
    </div>
  );
}
