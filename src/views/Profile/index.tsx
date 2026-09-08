import type {AppRoutes} from '@/views';
import type {ProfileFeedQuery} from '@/types';

import {useEffect, useState} from 'react';
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
  Title,
  useTitle
} from 'haze-ui';

import {getCurrentUser, onAuthChange, type User} from '@/services/auth';
import {useProfileData, useProfileFeedQuery} from '@/services/dataloaders';
import {favoriteOnProfileFeed, followOnProfile} from '@/services/mutations';
import {useToastError} from '@/util/toastError';
import {DEFAULT_LIMIT} from '@/types/search';
import ArticlePreview from '@/views/Home/ArticlePreview';
import {useFavorite, useRequireAuth} from '@/views/_shared/useFavorite';

// 两个 tab 的查询维度：'author' = 我的文章（?author=username），
// 'favorited' = 收藏的文章（?favorited=username）
type ProfileTab = 'author' | 'favorited';

export default function Profile() {
  // useProfileData（createDataLoader 第二元素）：路由声明了 profileLoader
  //（见 views/index.tsx / dataloaders.ts），进组件前数据必已 resolve
  const profile = useProfileData();
  useTitle(`${profile.username} · Painless`);
  // 登录态订阅（Layout 同款形态）：isOwn 判定与 follow 闸门都要最新
  // 用户——登录/登出/设置更新经 auth change 事件驱动重渲染，不订阅则
  // 登录后留在本页的按钮态是过期值
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  useEffect(() => onAuthChange(setUser), []);
  const isOwn = user?.username === profile.username;

  // tab 状态经 useControl 双向绑定 haze Tabs：传 control 即受控形态，
  // Tab 点击 setValue 回写本组件状态，查询与面板共用同一事实源。首参
  // 必须给非 null 的种子（react-use-control 运行时分派：显式 null 会被
  // 当初始值本身，第二参被忽略——DevTool/PreviewLink 的 `undefined`/
  // 值种子形态）；tab/分页是页内浏览态而非可分享过滤面，不落 URL（与
  // Home 的 search 语义刻意不同——见 Home 的 useSetHomeSearch 注释）。
  const [tab, , tabCtrl] = useControl<ProfileTab>('author');
  // 分页状态挂 username × tab 维度：换维度时旧偏移不适用（两个维度
  // 的总量不同），换档案（同路由 :username 参数变化不卸载组件——
  // Layout 导航的用户名链接即该路径）时旧偏移同样不适用（另一人的
  // 总量不同，稀疏档案会停在越界 offset 上误显「No articles yet」）。
  // 渲染期按当前 username+tab 取数——非当前组合的偏移视为 0（回第一
  // 页），不会产生「新 tab × 旧 offset」的中间查询；切回原组合时旧
  // 偏移仍在（缓存里的页本来就在，恢复页位零成本）
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

  // 场景 hook（声明见 dataloaders.ts 的 useProfileFeedQuery）：args 即
  // profileFeedCache 的 key 元组——tab 切换/翻页换 args，未缓存 key 诚实
  // 重入 loading（AsyncSection 占位），已缓存 key 直接命中（来回切换
  // 不重拉）
  const feedQuery: ProfileFeedQuery = {
    username: profile.username,
    scope: tab,
    offset,
    limit: DEFAULT_LIMIT
  };
  const {data: feed, loading, error, refetch} = useProfileFeedQuery([feedQuery]);

  const toastError = useToastError();
  const requireAuth = useRequireAuth();
  // follow 写穿 profileCache（key=[username] 与 profileLoader 同寻址，
  // 声明见 services/mutations.ts 的 followOnProfile）：乐观翻转 → 服务
  // 调用 → 字段选择式 apply → 失败自动回滚；scope 按 username 串行连点。
  // 写穿后的 set 事件经 bindRefresh 自动 refresh 本路由（loader 新鲜
  // 命中），banner 无需手工刷新
  const [follow] = useMutation(followOnProfile, {
    scope: (username: string) => `profile-follow:${username}`
  });
  // 列表卡片收藏：useFavorite 收敛未登录跳转/toast/scope 串行（同
  // Home），spec 换成 profile 列表投影层（favoriteOnProfileFeed：article
  // 实体层 + profileFeed 投影层的组合管道）
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

  // 两个 TabPanel 展示同一份 tab 驱动的列表：内容只挂进当前激活面板
  //（TabPanel 自身恒渲染、hidden 类隐藏），避免双份 DOM；tab 的
  // aria-controls 指向的 panel id 恒存在（TabPanel 内建
  // id=`tabpanel-${value}`）。
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
              <Flex align='center' justify='center' gap='sm'>
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
    <>
      <Card>
        <Flex align='center' gap='md'>
          <Avatar src={profile.image ?? undefined} alt={profile.username} size='lg' />
          <div>
            <Title>{profile.username}</Title>
            {profile.bio ? <Text>{profile.bio}</Text> : null}
          </div>
          {/* 自己的档案：不显示 follow，改放设置入口（RealWorld 惯例）；
              他人档案：follow toggle（乐观写穿见 followOnProfile） */}
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
    </>
  );
}
