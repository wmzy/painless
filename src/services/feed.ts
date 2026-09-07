// About 无限滚动 feed：不走 useQuery preset，直接用 react-toolroom 原子 hooks
// 组装「offset/limit 分页 + 无限聚合」这一个场景。useInjectable 具名注册（DevTool 可见）、
// useInfinite 翻页聚合、useRun 首页驱动（useInfinite 从不自行发请求）、useInitialLoading/useError 观测。
// 刻意不接缓存：翻页状态按 injectable 聚合，卸载整体释放，重进重拉首页。
import type {Article, ArticlePage} from '@/types';

import {
  useError,
  useInitialLoading,
  useInjectable,
  useInfinite,
  useRun
} from 'react-toolroom/async';
import {useCallback} from 'react';


import {query} from './article';

// 页大小：对齐 RealWorld 契约的默认 limit（GET /articles）。
export const FEED_LIMIT = 10;

// 首页 pageParam offset 0：模块级常量让 useRun 的 args 引用稳定（消 dev 内联参数警告）。
const FIRST_PAGE: [number] = [0];

// pageParam 即 offset（offset/limit 式分页）：下一页参数 = 累计条数，追平 articlesCount 即终态。
export function useFeed(limit = FEED_LIMIT) {
  // 页取数器：闭包捕获 limit，injectable 身份稳定；尾参 signal 同服务层约定。
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

  // 首页驱动：args 恒 [0]（无重置聚合的 rerun 路径）；signal 卸载/参数变化 abort。
  // 吃掉拒绝：失败只走 useError 通道，避免 useRun 留下 unhandled rejection。
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

  // 续拉/重试入口是「发射后观察」型（结果经 useError 广播），统一吞拒绝避免 unhandled rejection。
  const swallow = (p: Promise<unknown>) => {
    // 显式返回 undefined 规避 no-empty-function；语义即吞掉续拉/重试的拒绝
    p.catch(() => undefined);
  };

  return {
    // 各页摊平的文章序列
    articles: pages.flatMap((page): Article[] => page.articles),
    // 总量取最后一页服务端计数（首页错误/未到达为 0）
    total: pages.at(-1)?.articlesCount ?? 0,
    // 任一页到达即 ready：区分「首载中」与「已渲染空 feed」（后者走终态而非永久占位）
    ready: pages.length > 0,
    initialLoading,
    error,
    fetchNextPage: () => swallow(fetchNextPage()),
    isFetchingNextPage,
    hasNextPage,
    // 首页重试：手动直调按 useInfinite 语义重置聚合（pages 回单页）
    reload: () => swallow(fetchPage(0))
  };
}
