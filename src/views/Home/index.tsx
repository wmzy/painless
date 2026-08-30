import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useMatched, useSearch, useSetSearch} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex, Chip, Button,useToast} from 'haze-ui';
import {useMutation} from 'react-toolroom/async';

import {Article} from '@/types';
import {homeSearchSchema, homeSearchWriteSchema} from '@/types/search';
import {favoriteOnHome} from '@/services/mutations';
import {getCurrentUser} from '@/services/auth';
import {useHomeData} from '@/services/dataloaders';
import PreviewLink from '@/components/PreviewLink';

import Tags from './Tags';

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;

export default function Home() {
  // useHomeData（createDataLoader 第二元素）：类型与来源校验都在工厂内
  // 收拢——路由声明了 homeLoader，进组件前数据必已 resolve，不再写
  // useData<ArticlePage>()! / ?? 空值兜底（DEV 下失配即 throw，见
  // src/util/dataLoader.ts）
  const {articles, articlesCount} = useHomeData();
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
