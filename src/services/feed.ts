// 场景声明：About 页的无限滚动 feed——「场景化组装哲学」的示范场景。
// 与 useQuery preset（util/useQuery.ts：把通用取数关注点收敛成项目级
// 单一 hook）相对，这里不走任何 preset，直接从 react-toolroom/async 的
// 原子 hooks 组装「offset/limit 分页 + 无限聚合」这一个具体场景：
// - useInjectable：页取数器变为可注入/可观测的 injectable。具名注册
//   （react-toolroom ≥0.16）让 DevTool 面板的 'Cache & Calls' 追踪表能
//   看到每次翻页调用——匿名场景 hook 里的调用默认不可见；
// - useInfinite：翻页聚合。pages/pageParams 状态按 injectable 实例共享
//   （WeakMap，实例回收整体释放），fetchNextPage 追加页，hasNextPage 由
//   getNextPageParam 派生，返回 undefined 即终态；
// - useRun({signal: true})：首页驱动（useInfinite 从不自行发请求，
//   首页与任何普通查询一样由 useRun 发起）；卸载/参数变化时 abort 在飞
//   请求，经服务层尾参 signal 透传到 fetch；
// - useInitialLoading / useError：本场景要的观测面——首载占位与错误
//   呈现（翻页中的加载态由 useInfinite 的 isFetchingNextPage 给出）。
// 刻意不接缓存（useCache/focus 重验证等）：翻页状态已由 useInfinite 按
// injectable 聚合，组件卸载（离开 About）即整体释放，重进重拉首页——
// 「缓存什么、缓存多久」留给真正需要跨页面共享的场景决定，这正是按
// 场景组装而非套 preset 的意义。
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

// 首页 pageParam：offset 0。模块级常量让 useRun 的 args 引用稳定（每次
// 渲染新的 [0] 字面量会触发 useRun 的 dev 内联参数警告；effect 依赖是
// spread 后的原语，本就不会重跑，这里消掉的是控制台噪音）。
const FIRST_PAGE: [number] = [0];

// pageParam 即 offset：GET /articles 是 offset/limit 式分页（非游标），
// 下一页参数 = 已加载页的累计条数；服务端 articlesCount 是总量事实，
// 累计追平即终态（getNextPageParam 返回 undefined → hasNextPage=false）。
export function useFeed(limit = FEED_LIMIT) {
  // 页取数器：闭包捕获 limit（useInjectable 每渲染刷新闭包、返回的
  // injectable 身份稳定），尾参 signal 与服务层「只读查询接可选尾参
  // signal」的约定同构。具名注册见文件头注释。
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

  // 首页驱动（useInfinite 从不自行发请求，首页与任何普通查询一样由
  // useRun 发起）：args 恒为 [0]，不存在触发「重置聚合」的 rerun 路径
  //（useRun 的任何其它调用形态才会重置 pages/pageParams）。signal 让
  // 卸载/参数变化时 abort 在飞请求，经服务层尾参透传到 fetch。
  // runFirstPage 吃掉拒绝：失败只走 useError 通道（错误在 injectable
  // 包装链内已广播进 error store），useRun 的 void 调用不会留下
  // unhandled rejection。
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

  // 场景对外暴露的续拉/重试入口都是「发射后观察」型：结果经 result/
  // error 广播进 UI（useError → error 字段），返回的 promise 对调用方没有
  // 信息量——统一吞掉拒绝，调用点（IO 回调、按钮 onClick）不必逐个挂
  // catch，否则每次失败都是一次 unhandled rejection。
  const swallow = (p: Promise<unknown>) => {
    // 显式返回 undefined 规避 no-empty-function；语义即吞掉续拉/重试的拒绝
    p.catch(() => undefined);
  };

  return {
    // 各页摊平的文章序列（渲染用）
    articles: pages.flatMap((page): Article[] => page.articles),
    // 总量取最后一页的服务端计数（首页错误/未到达时为 0）
    total: pages.at(-1)?.articlesCount ?? 0,
    // 是否已有任一页到达：区分「首载中」（含 useRun 发起请求前的一帧）
    // 与「已渲染的空 feed」——后者走正常终态而非永久占位
    ready: pages.length > 0,
    initialLoading,
    error,
    fetchNextPage: () => swallow(fetchNextPage()),
    isFetchingNextPage,
    hasNextPage,
    // 首页重试：手动直调会按 useInfinite 语义重置聚合（pages 回到单页）
    reload: () => swallow(fetchPage(0))
  };
}
