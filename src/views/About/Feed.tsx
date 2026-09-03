// About 页的无限滚动 feed 演示区块：数据场景在 services/feed.ts（原子
// hooks 组装），这里只做交互与呈现——IntersectionObserver 哨兵驱动
// useFeed 的 fetchNextPage，加载/终态反馈渲染在哨兵本体上（滚到底时
// 它正是视口里的那个元素，反馈与触发点合一）。
import type {AppPaths} from '@/views';

import {css} from '@linaria/core';
import {useEffect, useRef} from 'react';
import {TypedLink} from '@native-router/react';
import {Button, Card, Text, Title, AsyncSection} from 'haze-ui';


import {useFeed} from '@/services/feed';
import {AuthorLine, TagList} from '@/views/_shared/AuthorLine';

// 演示用内部滚动容器：固定高度 + overflow 剪裁。IntersectionObserver
// 默认视口根会沿祖先链剪裁（overflow: auto 的容器同样把哨兵挡在「不可
// 见」侧），哨兵因此只在容器滚到底时进入视口——不需要把容器设为
// observer 的 root。
const scrollArea = css`
  max-height: 24rem;
  overflow-y: auto;
`;

// 卡片之间留出呼吸位（卡片本体不带外边距）
const stack = css`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

// 哨兵/反馈区：滚到底时它在视口内，加载与终态文案就长在这里
const sentinelArea = css`
  padding: 0.75rem 0;
  text-align: center;
`;

export default function Feed() {
  const {
    articles,
    total,
    ready,
    error,
    reload,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage
  } = useFeed();

  // IntersectionObserver 哨兵：尾部哨兵可见即「滚到底」，自动拉下一页。
  // 观察器随翻页状态重建（依赖里的 isFetchingNextPage/hasNextPage），
  // 回调读到的永远是当前值；真实 IO 在 observe 时会立即派发一次初始
  // 通知，因此「哨兵仍可见时翻完一页」会级联续拉直到填满滚动区或触底
  // ——这正是无限滚动的预期行为。两个守卫挡住重复触发：终态不再拉，
  // 在飞时不重入。
  // 渐进增强：browserslist 目标含不支持 IntersectionObserver 的环境
  //（KaiOS 2.5），不支持时哨兵静默、哨兵区改渲染 Load more 手动按钮
  //（下方 hasNextPage 分支）——功能完整降级而非依赖假设。
  const ioSupported = typeof IntersectionObserver !== 'undefined';
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !ioSupported) return;
    const observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting) &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, ioSupported]);

  // 首载占位：!ready 同时覆盖「请求在飞且无结果」（initialLoading 同期
  // 为真）与 useRun 发起请求前的一帧；空结果集（count=0 的正常响应）
  // 则以 ready=true 走下方正常终态，不会卡在永久占位。
  const loadingFirstPage = !ready && error == null;

  return (
    <section aria-label='Infinite feed demo' className={stack}>
      <Title level={2}>Infinite Feed</Title>
      <Text type='secondary'>
        Scroll to the bottom of the feed below — the next page loads
        automatically (useInfinite + IntersectionObserver sentinel), with a
        visible loading state and an end-of-feed marker.
      </Text>

      {/* 首页三分支收敛给 haze-ui AsyncSection（1.21）：loadingFirstPage
          （!ready 且无错——同时覆盖「请求在飞且无结果」与 useRun 发起
          请求前的一帧；空结果集以 ready=true 走正常终态，不卡永久占位）
          → 占位；首页失败（列表为空，聚合里没有可续的页）→ 错误框 +
          Retry（reload 重置聚合从首页重来）；其余渲染 feed 本体——翻页
          失败的错误留在哨兵反馈区（见下），不升级为整段错误态 */}
      <AsyncSection
        loading={loadingFirstPage}
        error={articles.length === 0 ? error : undefined}
        onRetry={reload}
        loadingText='Loading feed…'
      >
        <div
          role='feed'
          aria-busy={isFetchingNextPage}
          aria-label='Articles'
          className={`${scrollArea} ${stack}`}
        >
          {articles.map((a) => (
            <Card key={a.slug}>
              <AuthorLine author={a.author} />
              <Title level={3}>
                <TypedLink<AppPaths> to='/article/:title' params={{title: a.slug}}>
                  {a.title}
                </TypedLink>
              </Title>
              <Text>{a.description}</Text>
              <TagList tags={a.tagList} />
            </Card>
          ))}

          {/* 哨兵即反馈区（见文件头）：翻页中显示加载态，触底显示终态，
              翻页失败显示重试（此刻 hasNextPage 仍真，fetchNextPage 即
              「续拉失败的那一页」） */}
          <div ref={sentinelRef} role='status' className={sentinelArea}>
            {isFetchingNextPage ? (
              <Text type='muted'>Loading more…</Text>
            ) : error != null ? (
              <>
                <Text type='secondary'>{error.message}</Text>{' '}
                <Button variant='outline' size='sm' onClick={fetchNextPage}>
                  Retry
                </Button>
              </>
            ) : hasNextPage ? (
              // 无 IntersectionObserver 环境的手动降级入口（哨兵不自动
              // 触发，按钮补上「拉下一页」）
              ioSupported ? null : (
                <Button variant='outline' size='sm' onClick={fetchNextPage}>
                  Load more
                </Button>
              )
            ) : (
              <Text type='muted'>All {total} articles loaded</Text>
            )}
          </div>
        </div>
      </AsyncSection>
    </section>
  );
}
