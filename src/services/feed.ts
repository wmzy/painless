// 不走 useQuery preset：原子 hooks 组装 offset/limit 分页 + 无限聚合。
// 刻意不接缓存：翻页状态按 injectable 聚合，卸载整体释放，重进重拉首页。
import type {ArticlePage, ArticleSummary} from '@/types';

import {
  useError,
  useInitialLoading,
  useInjectable,
  useInfinite,
  useRun
} from 'react-toolroom/async';
import {useCallback} from 'react';


import {query} from './article';

// 对齐 RealWorld 契约的默认 limit（GET /articles）。
const FEED_LIMIT = 10;

// 模块级常量让 useRun 的 args 引用稳定（消 dev 内联参数警告）。
const FIRST_PAGE: [number] = [0];

export function useFeed(limit = FEED_LIMIT) {
  const fetchPage = useInjectable(
    (offset: number, signal?: AbortSignal): Promise<ArticlePage> =>
      query({offset, limit}, signal),
    {name: 'feedPage'}
  );

  const {pages, fetchNextPage, isFetchingNextPage, hasNextPage} = useInfinite(
    fetchPage,
    {
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce(
          (sum, page) => sum + page.articles.length,
          0
        );
        return loaded < lastPage.articlesCount ? loaded : undefined;
      }
    }
  );

  // args 恒 [0]（无重置聚合的 rerun 路径）；失败只走 useError 通道。
  const runFirstPage = useCallback(
    (offset: number, signal?: AbortSignal): Promise<void> =>
      fetchPage(offset, signal).then(
        () => undefined,
        () => undefined
      ),
    [fetchPage]
  );
  useRun(runFirstPage, FIRST_PAGE, {signal: true});

  const initialLoading = useInitialLoading(fetchPage);
  const error = useError<Error>(fetchPage);

  // 续拉/重试结果经 useError 广播，统一吞拒绝避免 unhandled rejection。
  const swallow = (p: Promise<unknown>) => {
    // 显式返回 undefined 规避 no-empty-function。
    p.catch(() => undefined);
  };

  return {
    articles: pages.flatMap((page): ArticleSummary[] => page.articles),
    total: pages.at(-1)?.articlesCount ?? 0,
    // 区分「首载中」与「已渲染空 feed」（后者走终态）。
    ready: pages.length > 0,
    initialLoading,
    error,
    fetchNextPage: () => swallow(fetchNextPage()),
    isFetchingNextPage,
    hasNextPage,
    // 直调按 useInfinite 语义重置聚合（pages 回单页）。
    reload: () => swallow(fetchPage(0))
  };
}
