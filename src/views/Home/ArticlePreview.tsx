import type {ArticleSummary} from '@/types';

import {memo} from 'react-toolroom';
import {css} from '@linaria/core';
import {Card, Title, Text, Flex} from 'haze-ui';

import FavoriteButton from '@/components/FavoriteButton';
import PreviewLink from '@/components/PreviewLink';
import {AuthorLine, TagList} from '@/views/_shared/AuthorLine';

// 日期格式器：模块级单例，避免每张卡片每帧重建。locale 跟随浏览器
// （Intl 零依赖；date-fns 是 devDependency，不进应用代码）
const formatDate = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

// 卡片 hover：微抬升 + 阴影加深 + 边线向主色靠——标题链在卡内的整卡
// 可点性提示。组件 css 在 bundle 中晚于 theme.css，同特异性靠后赢
const cardHover = css`
  transition: box-shadow var(--haze-duration-fast),
    border-color var(--haze-duration-fast), transform var(--haze-duration-fast);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--haze-color-border-hover);
    box-shadow: var(--haze-shadow-lg);
  }
`;

// 标题链 hover：主色细下划线（此前是浏览器默认蓝 + 默认下划线）
const titleLink = css`
  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--haze-color-primary);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 4px;
  }
`;

// 底行：tag 徽标左、日期右（日期把「发布时间」补进卡片，feed 不再
// 只有作者一行的时间维度缺失）
const metaRow = css`
  gap: var(--haze-space-4);
`;

const dateCls = css`
  flex-shrink: 0;
  font-size: var(--haze-text-xs);
`;

type Props = {
  article: ArticleSummary;
  // on* 前缀：react-toolroom memo 自动稳定化，父层新建闭包在子组件眼里身份不变
  onFavorite: (slug: string, on: boolean) => void;
};

function ArticlePreview({article, onFavorite}: Props) {
  return (
    <Card className={cardHover}>
      <AuthorLine author={article.author}>
        <FavoriteButton
          favorited={article.favorited}
          favoritesCount={article.favoritesCount}
          onToggle={() => onFavorite(article.slug, !article.favorited)}
        />
      </AuthorLine>
      <Title level={2}>
        {/* prefetch='viewport' 是 PreviewLink 缺省：滚入视口即预取 data+chunk；
            to/params/search 对路由表（AppRoutes 表形态）编译期判别 */}
        <PreviewLink
          to='/article/:title'
          params={{title: article.slug}}
          className={titleLink}
        >
          {article.title}
        </PreviewLink>
      </Title>
      <Text>{article.description}</Text>
      <Flex justify='space-between' align='center' className={metaRow}>
        <TagList tags={article.tagList} />
        <Text type='muted' className={dateCls}>
          {formatDate.format(new Date(article.createdAt))}
        </Text>
      </Flex>
    </Card>
  );
}

// react-toolroom memo：React.memo 的免 useCallback 版——on* 经稳定转发
// 器呈现同一身份、调用时转发到最新闭包。收藏翻转的写穿 + 整页 refresh
// 只替换目标项（mutations.ts 其余项原引用返回），未变卡片的 article
// 引用相等 → 重渲染成本收敛到受影响的那一张卡。
export default memo(ArticlePreview);
