import type {AppRoutes} from '@/views';

import {css} from '@linaria/core';
import {TypedLink, useSearch, useSetSearch} from '@native-router/react';
import {Title, Text, Flex, Chip, ButtonLink, useTitle} from 'haze-ui';

import {
  homeSearchSchema,
  homeSearchWriteSchema,
  type HomeSearchInput
} from '@/types/search';
import {favoriteOnHome} from '@/services/mutations';
import {useHomeData} from '@/services/dataloaders';
import {useFavorite} from '@/views/_shared/useFavorite';

import ArticlePreview from './ArticlePreview';

import Tags from './Tags';

export default function Home() {
  // 页标题统一口径「<页名> · Painless」，后缀对齐 index.html 的默认
  // <title>；离开恢复默认（机制：haze-ui 的 useTitle——写入/恢复双
  // effect + 进入前快照，与原本地实现同构，上游测试已钉）
  useTitle('Home · Painless');
  // useHomeData（createDataLoader 第二元素）：类型与来源校验都在工厂内
  // 收拢——路由声明了 homeLoader，进组件前数据必已 resolve，不再写
  // useData<ArticlePage>()! / ?? 空值兜底（DEV 下失配即 throw，见
  // src/util/dataLoader.ts）
  const {articles, articlesCount} = useHomeData();
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
  // 缺省」同一约定，TypedLink 把它序列化进 href 预览与点击导航两者。
  // 返回类型即链接契约：homeSearchSchema 的 Input 位（HomeSearchInput），
  // TypedLink 的 search prop 按同一类型判别
  const pageSearch = (target: number): HomeSearchInput => ({
    ...(activeTag != null ? {tag: activeTag} : {}),
    ...(target > 0 ? {offset: String(target)} : {})
  });

  // 卡片级乐观收藏：toggleFavorite 已收敛进 useFavorite（views/_shared/
  // useFavorite.ts）——requireAuth 跳登录（带 redirect）、toast 失败提示
  // 与 scope 串行都在 hook 内；乐观 +1 → 服务调用 → apply → 失败回滚的
  // cache.mutation 组合管道见 services/mutations.ts（favoriteOnHome 组合
  // article 层 + home 投影层）。onFavorite 身份每渲染新建，经
  // ArticlePreview 的 react-toolroom memo 稳定化，卡片重渲染只由 article
  // 引用变化驱动
  const onFavorite = useFavorite(favoriteOnHome);

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
          <Flex align='center' justify='center' gap='sm'>
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
