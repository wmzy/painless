import type {AppRoutes} from '@/views';

import {css} from '@linaria/core';
import {TypedLink, useSearch} from '@native-router/react';
import {Title, Text, Flex, Chip, ButtonLink, useTitle} from 'haze-ui';

import {
  homeSearchSchema,
  DEFAULT_LIMIT,
  type HomeSearchInput
} from '@/types/search';
import {favoriteOnHome} from '@/services/mutations';
import {useHomeData} from '@/services/dataloaders';
import {useFavorite} from '@/views/_shared/useFavorite';

import ArticlePreview from './ArticlePreview';
import {useSetHomeSearch} from './useSetHomeSearch';

import Tags from './Tags';

// Hero：居中、大字号衬线标题 + 斜体副题，底部分隔线与卡片区划开
const hero = css`
  text-align: center;
  padding: var(--haze-space-2) 0 var(--haze-space-8);
  margin-bottom: var(--haze-space-8);
  border-bottom: 1px solid var(--haze-color-border);
`;

const heroTitle = css`
  font-size: 48px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: var(--haze-space-3);
`;

const heroSub = css`
  font-family: var(--haze-font-serif);
  font-style: italic;
  font-size: 17px;
  color: var(--haze-color-text-secondary);
`;

// 编辑部式点缀：句点用朱红强调色——主色墨蓝之外唯一色彩节奏
const accentDot = css`
  color: oklch(57% 0.19 27);
`;

// 双栏：feed 弹性占满、aside 定宽（Tags 组件内）；窄屏堆叠单列
const columns = css`
  align-items: flex-start;
  gap: var(--haze-space-8);

  @media (max-width: 760px) {
    flex-direction: column;
  }
`;

// feed 列：flex:1 + min-width:0（防长词撑破弹性盒），卡片纵向 gap
// ——此前卡片之间零间距直接堆叠
const feed = css`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--haze-space-5);
`;

export default function Home() {
  // 标题统一口径「<页名> · Painless」（对齐 index.html 默认），离开恢复。
  useTitle('Home · Painless');
  // useHomeData：类型与来源校验在工厂内收拢——路由声明了 homeLoader，
  // 进组件前数据必已 resolve，无需 useData<ArticlePage>()! 兜底。
  const {articles, articlesCount} = useHomeData();
  // coerce 与缺省都在 schema 里完成，tag/offset/limit 直接可用。
  const {tag: activeTag, offset, limit} = useSearch(homeSearchSchema);

  // 写侧经 useSetHomeSearch（decisions.md #32：库版在绝对 base 下双拼
  // baseUrl），读写共用 homeSearchWriteSchema 契约。本写入口只服务「取消
  // tag 筛选」——过滤面用 {replace: true}，back 不回放筛选态，与分页的
  // push 刻意并存。
  const setSearch = useSetHomeSearch();

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(articlesCount / limit));

  // 翻页载荷即链接契约（HomeSearchInput，TypedLink 序列化进 href 与点击
  // 导航两者），等于缺省的字段省略。limit 例外：非缺省时显式携带——
  // 手工 URL 的 ?limit=5 若在翻页载荷丢失，落页解析回缺省 10，页码/
  // 步进/缓存 key 全部静默换轨。
  const pageSearch = (target: number): HomeSearchInput => ({
    ...(activeTag != null ? {tag: activeTag} : {}),
    ...(target > 0 ? {offset: String(target)} : {}),
    ...(limit !== DEFAULT_LIMIT ? {limit: String(limit)} : {})
  });

  // 乐观收藏收敛在 useFavorite（跳登录/toast/scope 串行）+ mutations.ts
  // 的 cache.mutation 组合管道；onFavorite 身份由 ArticlePreview 的
  // react-toolroom memo 稳定化。
  const onFavorite = useFavorite(favoriteOnHome);

  return (
    <div>
      {/* Hero：编辑部版式——居中大衬线标题 + 衬线斜体副题，底部分隔线
          与卡片区划开。副题是 RealWorld 模板惯例文案 */}
      <header className={hero}>
        <Title className={heroTitle}>
          Welcome to Painless<span className={accentDot}>.</span>
        </Title>
        <Text className={heroSub}>A place to share your knowledge.</Text>
      </header>
      <Flex className={columns}>
        {/* feed 列 flex:1 占据剩余宽度（此前无 grow：卡片按内容宽度
            334px，而标签侧栏吃满 690px——主次倒挂）；aside 定宽在
            Tags 组件内声明 */}
        <div className={feed}>
          {activeTag != null && (
            <Flex align='center' justify='center' gap={4}>
              <Chip
                color='primary'
                onClose={() => void setSearch({}, {replace: true})}
              >
                {activeTag}
              </Chip>
            </Flex>
          )}
          {/* 卡片抽成 memo 化的 ArticlePreview（react-toolroom memo）：on*
              事件 props 自动稳定化 + article 引用浅比较——tag 筛选/翻页
              的整页数据换新时，引用未变的卡片整卡跳过重渲染 */}
          {articles.map((a) => (
            <ArticlePreview key={a.slug} article={a} onFavorite={onFavorite} />
          ))}
          {/* 分页链接化：TypedLink 表形态（TypedLink<AppRoutes,
              typeof ButtonLink>），to 与
              search 都对路由表编译期判别——search 按 homeSearchSchema 的
              Input 位（HomeSearchInput）收窄：字段拼错/多传编译期即报，
              offset/limit 的 number/string 均合法（序列化时 String() 化，
              coerce 交给 schema）。href 即目标页真实 URL——⌘/中键新标签、
              爬虫与无 JS 环境都自然可用；普通左键走 SPA 导航（preventDefault +
              navigate，与原 setSearch 同为 push 语义，每次翻页一条
              history 记录，back 逐页回退且落 viewStack 快照）。
              as={ButtonLink}（haze-ui 1.16）：渲染原生 <a> 穿全套 Button
              皮肤——variant='outline' + 缺省尺寸 md，即此前手刻 pageLink
              CSS 复刻的同一外观（该样式已删，换肤随主题自动跟随）。
              双类型实参显式钉死 A：TypedLink 不像 TypedNavLink 有「单
              实参 + 宽松 as」的中间重载，只给 AppRoutes 会让 A 落回
              缺省 'a'（as={ButtonLink} 编译期即报），显式第二实参换来
              variant、aria 与 tabIndex 对 ButtonLink props 的全类型校验。
              边界态：链接没有 disabled 属性，ButtonLink 把
              aria-disabled='true' 样式成 Button 的 :disabled（半透明 +
              not-allowed + pointer-events 断鼠标），tabIndex={-1} 移出
              焦点序。 */}
          <Flex align='center' justify='center' gap={8}>
            <TypedLink<AppRoutes, typeof ButtonLink>
              as={ButtonLink}
              to='/'
              search={pageSearch(Math.max(0, offset - limit))}
              variant='outline'
              aria-disabled={offset <= 0 || undefined}
              tabIndex={offset <= 0 ? -1 : undefined}
            >
              ← Previous
            </TypedLink>
            <Text>
              {page} / {totalPages}
            </Text>
            <TypedLink<AppRoutes, typeof ButtonLink>
              as={ButtonLink}
              to='/'
              search={pageSearch(offset + limit)}
              variant='outline'
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
