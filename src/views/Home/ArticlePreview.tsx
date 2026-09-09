import type {ArticleSummary} from '@/types';

import {memo} from 'react-toolroom';
import {Card, Title, Text} from 'haze-ui';

import FavoriteButton from '@/components/FavoriteButton';
import PreviewLink from '@/components/PreviewLink';
import {AuthorLine, TagList} from '@/views/_shared/AuthorLine';

type Props = {
  article: ArticleSummary;
  // on* 前缀：react-toolroom memo 自动稳定化，父层新建闭包在子组件眼里身份不变
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
        {/* prefetch='viewport' 是 PreviewLink 缺省：滚入视口即预取 data+chunk；
            to/params 对 AppPaths 编译期判别 */}
        <PreviewLink to='/article/:title' params={{title: article.slug}}>
          {article.title}
        </PreviewLink>
      </Title>
      <Text>{article.description}</Text>
      <TagList tags={article.tagList} />
    </Card>
  );
}

// react-toolroom memo：React.memo 的免 useCallback 版——on* 经稳定转发
// 器呈现同一身份、调用时转发到最新闭包。收藏翻转的写穿 + 整页 refresh
// 只替换目标项（mutations.ts 其余项原引用返回），未变卡片的 article
// 引用相等 → 重渲染成本收敛到受影响的那一张卡。
export default memo(ArticlePreview);
