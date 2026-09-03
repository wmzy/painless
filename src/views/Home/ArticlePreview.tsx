import type {Article} from '@/types';

import {memo} from 'react-toolroom';
import {Card, Title, Text} from 'haze-ui';

import FavoriteButton from '@/components/FavoriteButton';
import PreviewLink from '@/components/PreviewLink';
import {AuthorLine, TagList} from '@/views/_shared/AuthorLine';

type Props = {
  article: Article;
  // 收藏翻转意图（slug + 目标态）：on* 前缀——react-toolroom memo 对
  // on* props 自动稳定化，Home 每次渲染新建的闭包在子组件眼里是同一身份
  onFavorite: (slug: string, on: boolean) => void;
};

function ArticlePreview({article, onFavorite}: Props) {
  return (
    <Card>
      <AuthorLine author={article.author}>
        <FavoriteButton
          favorited={article.favorited}
          favoritesCount={article.favoritesCount}
          onToggle={() => onFavorite(article.slug, !article.favorited)}
        />
      </AuthorLine>
      <Title level={2}>
        {/* 卡片滚入视口即预取 data+chunk，比 hover 更早，点击近乎零等待 */}
        <PreviewLink to={`/article/${article.slug}`} prefetch='viewport'>
          {article.title}
        </PreviewLink>
      </Title>
      <Text>{article.description}</Text>
      <TagList tags={article.tagList} />
    </Card>
  );
}

// react-toolroom memo（core 入口）：React.memo 的免 useCallback 版——
// on* 事件 props（onFavorite/onToggle）经稳定转发器呈现同一身份、调用时
// 转发到最新闭包，其余 props 浅比较。README「Design Philosophy」的
// 「React.memo + scalar props」在模板里的兑现点：收藏翻转（cache.mutation
// 写穿 + bindRefresh 整页 refresh）时 patchArticleIn 只替换目标项（见
// services/mutations.ts——其余项原引用返回），未变卡片的 article prop
// 引用相等 + on* 稳定化 → 整页 refresh 的重渲染成本收敛到受影响的那
// 一张卡。
export default memo(ArticlePreview);
