import {css} from '@linaria/core';
import {navigate, refresh} from '@native-router/core';
import {useData, useMatched, useSearch, useSetSearch} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex, Chip, Button} from 'haze-ui';

import {Article, ArticlePage} from '@/types';
import {homeSearchSchema, homeSearchWriteSchema} from '@/types/search';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {homeCacheArgs} from '@/util/loaderCache';
import {queryCache} from '@/util/useQuery';
import PreviewLink from '@/components/PreviewLink';

import Tags from './Tags';

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;

export default function Home() {
  const {articles, articlesCount} = useData<ArticlePage>() ?? {
    articles: [],
    articlesCount: 0
  };
  const {router} = useMatched();
  // 路由级 search schema（见 views/index.tsx）解析：coerce 与缺省都在
  // schema 里完成，组件拿到的 tag/offset/limit 直接可用
  const {tag: activeTag, offset, limit} = useSearch(homeSearchSchema);

  // 筛选与分页都写进 search：search 变化会触发 route loader 重新查询
  // （见 views/index.tsx 的 data），返回后整棵视图以新数据重渲染。写侧经
  // homeSearchWriteSchema：输入按 URL 侧的字符串形态给出（coerce 交给
  // schema），等于缺省的字段被抹去——URL 保持 offset 为 0 / limit 为
  // 缺省时不出现，写入口与读入口共用同一契约
  const setSearch = useSetSearch(homeSearchWriteSchema);
  const go = (next: {tag?: string; offset?: number}) => {
    const input: Record<string, string> = {};
    if (next.tag !== undefined) input.tag = next.tag;
    if (next.offset) input.offset = String(next.offset);
    void setSearch(input);
  };

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(articlesCount / limit));

  // 卡片级乐观收藏 → 补丁缓存（与 Article 视图的写穿同源）：列表数据
  // 来自路由 loader，loader 侧 withCache(['home']) 与本处 homeCacheArgs
  // 是同一 key。patchPage 只改当前页缓存里的目标项再 refresh——loader
  // 新鲜命中缓存，纯本地更新（零请求零骨架），useData 换新后整视图以
  // 新数据重渲染。手写 useState 覆盖（0.7 前）作废。
  const key = homeCacheArgs({tag: activeTag, offset, limit});
  const patchPage = (updater: (page: ArticlePage) => ArticlePage) => {
    const cur = queryCache.peek!(key)?.value as ArticlePage | undefined;
    // 条目不在（过期淘汰/被 clear，如登出）：无基线可补丁，放弃——
    // 下一次导航 loader 会 miss 重拉，服务端值自然回来
    if (!cur) return;
    queryCache.set(key, updater(cur));
    void refresh(router);
  };

  const toggleFavorite = (a: Article) => {
    if (!getCurrentUser()) {
      void navigate(router, '/login');
      return;
    }
    const next = {
      ...a,
      favorited: !a.favorited,
      favoritesCount: a.favorited ? a.favoritesCount - 1 : a.favoritesCount + 1
    };
    const replaceWith = (target: Article) => (page: ArticlePage) => ({
      ...page,
      articles: page.articles.map((x) => (x.slug === a.slug ? target : x))
    });
    // 乐观：点击先本地 +1；成功以服务端返回校正；失败还原（请求失败即
    // 服务端状态未变，还原即权威值）
    patchPage(replaceWith(next));
    articleService
      .favoriteArticle(a.slug, next.favorited)
      .then((updated) => patchPage(replaceWith(updated)))
      .catch(() => patchPage(replaceWith(a)));
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
              <Chip color='primary' onClose={() => go({})}>
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
          <Flex align='center' justify='center' gap='sm'>
            <Button
              variant='outline'
              disabled={offset <= 0}
              onClick={() =>
                go({tag: activeTag, offset: Math.max(0, offset - limit)})
              }
            >
              ← Previous
            </Button>
            <Text>
              {page} / {totalPages}
            </Text>
            <Button
              variant='outline'
              disabled={offset + limit >= articlesCount}
              onClick={() => go({tag: activeTag, offset: offset + limit})}
            >
              Next →
            </Button>
          </Flex>
        </div>
        <Tags />
      </Flex>
    </div>
  );
}
