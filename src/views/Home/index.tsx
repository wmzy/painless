import type {AppRoutes} from '@/views';

import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {
  TypedLink,
  useMatched,
  useSearch,
  useSetSearch,
  type SearchInput
} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex, Chip, Button,useToast} from 'haze-ui';
import {useMutation} from 'react-toolroom/async';

import {Article} from '@/types';
import {homeSearchSchema, homeSearchWriteSchema} from '@/types/search';
import {favoriteOnHome} from '@/services/mutations';
import {getCurrentUser} from '@/services/auth';
import {useHomeData} from '@/services/dataloaders';
import {useTitle} from '@/util/useTitle';
import PreviewLink from '@/components/PreviewLink';

import Tags from './Tags';

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;

// 分页链接的锚点样式：按设计 token 复刻 Button variant='outline'（缺省
// 尺寸 md）的外观。haze-ui 没有按钮外观的链接组件，而 as={Button} 会把
// href 落到 <button> 上（非法属性，⌘/中键新标签也随之失效）——token 是
// 设计系统对外的扩展点，锚点直接消费 token，换肤随主题自动跟随。边界
// 禁用是按钮 disabled 语义的锚点等价物：aria-disabled 上报状态（链接
// 没有 disabled 属性），pointer-events 断鼠标交互 + tabIndex 移出焦点
// 序，视觉降半透明
const pageLink = css`
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--haze-color-border);
  border-radius: var(--haze-radius-md);
  padding: var(--haze-space-2) var(--haze-space-4);
  font-size: var(--haze-text-sm);
  font-weight: var(--haze-weight-medium);
  color: var(--haze-color-text);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    border-color: var(--haze-color-border-hover);
    background: var(--haze-color-bg-subtle);
  }

  &:active {
    background: var(--haze-color-bg-muted);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--haze-color-focus-ring);
  }

  &[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
`;

export default function Home() {
  // 页标题统一口径「<页名> · Painless」，后缀对齐 index.html 的默认
  // <title>；离开恢复默认（机制见 useTitle 文件头）
  useTitle('Home · Painless');
  // useHomeData（createDataLoader 第二元素）：类型与来源校验都在工厂内
  // 收拢——路由声明了 homeLoader，进组件前数据必已 resolve，不再写
  // useData<ArticlePage>()! / ?? 空值兜底（DEV 下失配即 throw，见
  // src/util/dataLoader.ts）
  const {articles, articlesCount} = useHomeData();
  const {router} = useMatched();
  // 路由级 search schema（见 views/index.tsx）解析：coerce 与缺省都在
  // schema 里完成，组件拿到的 tag/offset/limit 直接可用
  const {tag: activeTag, offset, limit} = useSearch(homeSearchSchema);

  // tag 筛选写入 search：search 变化会触发 route loader 重新查询（见
  // views/index.tsx 的 data），返回后整棵视图以新数据重渲染。写侧经
  // homeSearchWriteSchema：输入按 URL 侧的字符串形态给出（coerce 交给
  // schema），等于缺省的字段被抹去——URL 保持 offset 为 0 / limit 为
  // 缺省时不出现，写入口与读入口共用同一契约。分页已迁移 TypedLink
  // （见下），本写入口只服务「取消 tag 筛选」
  const setSearch = useSetSearch(homeSearchWriteSchema);

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(articlesCount / limit));

  // 分页目标页的 search 载荷：URL 输入侧的字符串形态（coerce 交给读侧
  // schema），等于缺省的字段省略——与 homeSearchWriteSchema 的「抹去
  // 缺省」同一约定，TypedLink 把它序列化进 href 预览与点击导航两者
  const pageSearch = (target: number): SearchInput => ({
    ...(activeTag != null ? {tag: activeTag} : {}),
    ...(target > 0 ? {offset: String(target)} : {})
  });

  // 卡片级乐观收藏：cache.mutation 组合管道（services/mutations.ts）——
  // 乐观 +1 → 服务调用 → 响应字段选择式 apply（打到全部含该 slug 的
  // 页缓存）→ 失败自动回滚。scope（react-toolroom 0.11）按 slug 串行
  // 同一文章的连点：第二次点击排队等第一次 settle 后执行，乐观翻转
  // 以服务端权威值为基线，不丢点击意图；不同文章互不阻塞。
  const [favorite] = useMutation(favoriteOnHome, {
    scope: (slug: string) => `favorite:${slug}`
  });
  const toast = useToast();

  const toggleFavorite = (a: Article) => {
    if (!getCurrentUser()) {
      void navigate(router, '/login');
      return;
    }
    // 失败时乐观值已被 cache.mutation 管道自动回滚，UI 复原；剩余的用户
    // 侧反馈只有「为什么没反应」——toast 一条 danger 提示补上这一环。
    void favorite(a.slug, !a.favorited).catch((e: unknown) =>
      toast(e instanceof Error ? e.message : 'Favorite failed', {
        variant: 'danger'
      })
    );
  };

  return (
    <div
      className={css`
        text-align: center;
      `}
    >
      <Title>Welcome to Painless.</Title>
      <Flex>
        <div>
          {activeTag != null && (
            <Flex align='center' justify='center' gap='xs'>
              <Chip color='primary' onClose={() => void setSearch({})}>
                {activeTag}
              </Chip>
            </Flex>
          )}
          {articles.map((a) => {
            return (
              <Card key={a.slug}>
                <Flex align='center' gap='sm'>
                  <Avatar src={a.author.image} alt={a.author.username} />
                  <Text>{a.author.username}</Text>
                  <Button
                    variant={a.favorited ? 'solid' : 'outline'}
                    size='sm'
                    aria-pressed={a.favorited}
                    className={pushRight}
                    onClick={() => toggleFavorite(a)}
                  >
                    ❤{' '}
                    <Badge variant={a.favorited ? 'success' : 'default'}>
                      {a.favoritesCount}
                    </Badge>
                  </Button>
                </Flex>
                <Title level={2}>
                  {/* 卡片滚入视口即预取 data+chunk，比 hover 更早，点击近乎零等待 */}
                  <PreviewLink
                    to={`/article/${a.slug}`}
                    prefetch='viewport'
                  >
                    {a.title}
                  </PreviewLink>
                </Title>
                <Text>{a.description}</Text>
                <Flex gap='xs' wrap>
                  {a.tagList.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </Flex>
              </Card>
            );
          })}
          {/* 分页链接化：TypedLink 表形态（TypedLink<AppRoutes>），to 与
              search 都对路由表编译期判别——手写 schema 的 input 位是
              unknown（无 ~standard.types 幻影对），search 收窄为 URL 输入
              侧的宽松 SearchInput（string | string[] 值），字符串形态即
              全部约束。href 即目标页真实 URL——⌘/中键新标签、爬虫与
              无 JS 环境都自然可用；普通左键走 SPA 导航（preventDefault +
              navigate，与原 setSearch 同为 push 语义，每次翻页一条
              history 记录，back 逐页回退且落 viewStack 快照）。边界态语义
              见 pageLink 注释（aria-disabled + tabIndex）。 */}
          <Flex align='center' justify='center' gap='sm'>
            <TypedLink<AppRoutes>
              to='/'
              search={pageSearch(Math.max(0, offset - limit))}
              className={pageLink}
              aria-disabled={offset <= 0 || undefined}
              tabIndex={offset <= 0 ? -1 : undefined}
            >
              ← Previous
            </TypedLink>
            <Text>
              {page} / {totalPages}
            </Text>
            <TypedLink<AppRoutes>
              to='/'
              search={pageSearch(offset + limit)}
              className={pageLink}
              aria-disabled={offset + limit >= articlesCount || undefined}
              tabIndex={offset + limit >= articlesCount ? -1 : undefined}
            >
              Next →
            </TypedLink>
          </Flex>
        </div>
        <Tags />
      </Flex>
    </div>
  );
}
