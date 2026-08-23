import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useData, useMatched, useSearch} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex, Chip, Button} from 'haze-ui';
import {encode} from 'qss';

import {Article, ArticlePage} from '@/types';
import {homeSearchSchema} from '@/types/search';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
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

  // 筛选与分页都编码进 search：search 变化会触发 route loader 重新查询
  // （见 views/index.tsx 的 data），返回后整棵视图以新数据重渲染；
  // offset 为 0 时省略，保持 URL 干净
  const go = (next: {tag?: string; offset?: number}) => {
    const search = encode({tag: next.tag, offset: next.offset || undefined});
    void navigate(router, search ? `/?${search}` : '/');
  };

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(articlesCount / limit));

  // 卡片级乐观收藏（与 Article 视图同款模式）：列表数据来自路由 loader
  // （非 useQuery injectable），useOptimistic 的 patch 目标不存在，故用
  // 本地 useState 覆盖实现——slug -> 覆盖值，点击先写，成功后以服务端
  // 返回校正，失败删掉覆盖回到 useData 的服务端值。
  const [favOverrides, setFavOverrides] = useState<
    Record<string, {favorited: boolean; favoritesCount: number}>
  >({});

  const toggleFavorite = (a: Article) => {
    if (!getCurrentUser()) {
      void navigate(router, '/login');
      return;
    }
    const base = favOverrides[a.slug] ?? {
      favorited: a.favorited,
      favoritesCount: a.favoritesCount
    };
    const next = {
      favorited: !base.favorited,
      favoritesCount: base.favorited
        ? base.favoritesCount - 1
        : base.favoritesCount + 1
    };
    setFavOverrides((prev) => ({...prev, [a.slug]: next}));
    articleService
      .favoriteArticle(a.slug, next.favorited)
      .then((updated) =>
        setFavOverrides((prev) => ({
          ...prev,
          [a.slug]: {
            favorited: updated.favorited,
            favoritesCount: updated.favoritesCount
          }
        }))
      )
      .catch(() => {
        // 回滚：清掉覆盖即回到服务端值（请求失败，服务端状态未变）
        setFavOverrides((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([slug]) => slug !== a.slug)
          )
        );
      });
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
            const override = favOverrides[a.slug];
            const favorited = override?.favorited ?? a.favorited;
            const favoritesCount =
              override?.favoritesCount ?? a.favoritesCount;
            return (
              <Card key={a.slug}>
                <Flex align='center' gap='sm'>
                  <Avatar src={a.author.image} alt={a.author.username} />
                  <Text>{a.author.username}</Text>
                  <Button
                    variant={favorited ? 'solid' : 'outline'}
                    size='sm'
                    aria-pressed={favorited}
                    className={pushRight}
                    onClick={() => toggleFavorite(a)}
                  >
                    ❤{' '}
                    <Badge variant={favorited ? 'success' : 'default'}>
                      {favoritesCount}
                    </Badge>
                  </Button>
                </Flex>
                <Title level={2}>
                  <PreviewLink to={`/article/${a.slug}`}>{a.title}</PreviewLink>
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
