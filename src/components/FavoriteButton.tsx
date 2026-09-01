import {css} from '@linaria/core';
import {Button, Badge} from 'haze-ui';

type Props = {
  favorited: boolean;
  favoritesCount: number;
  onToggle: () => void;
};

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;

// 收藏按钮（Home 卡片 / Article 视图两处同构 JSX 的收敛）：状态化外观
//（solid/outline 换肤 + 计数 Badge 变色）与 aria-pressed 语义在此唯一样
// 式点；点击意图由调用方经 onToggle 注入（useFavorite 管道，见
// views/_shared/useFavorite.ts）。props 刻意标量化——favorited/
// favoritesCount 是 number/boolean，浅比较即语义比较。
export default function FavoriteButton({
  favorited,
  favoritesCount,
  onToggle
}: Props) {
  return (
    <Button
      variant={favorited ? 'solid' : 'outline'}
      size='sm'
      aria-pressed={favorited}
      className={pushRight}
      onClick={onToggle}
    >
      ❤{' '}
      <Badge variant={favorited ? 'success' : 'default'}>
        {favoritesCount}
      </Badge>
    </Button>
  );
}
