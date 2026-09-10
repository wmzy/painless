import {css} from '@linaria/core';
import {Button} from 'haze-ui';

type Props = {
  favorited: boolean;
  favoritesCount: number;
  onToggle: () => void;
};

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;

// 心形状态色：favorited 时朱红实心观感（编辑部红——主色墨蓝之外唯一
// 的强调色），未收藏继承按钮墨色；计数同色跟随。aria-pressed 语义与
// 乐观管道不变。
const heart = css`
  color: oklch(57% 0.19 27);
`;

const heartOff = css`
  opacity: 0.55;
`;

// 收藏按钮（Home 卡片 / Article 视图两处同构 JSX 的收敛）：状态化外观
//（心形换色 + 计数跟随）与 aria-pressed 语义在此唯一样式点；点击意图
// 由调用方经 onToggle 注入（useFavorite 管道，见
// views/_shared/useFavorite.ts）。props 刻意标量化——favorited/
// favoritesCount 是 number/boolean，浅比较即语义比较。
export default function FavoriteButton({
  favorited,
  favoritesCount,
  onToggle
}: Props) {
  return (
    <Button
      variant='outline'
      size='sm'
      aria-pressed={favorited}
      className={pushRight}
      onClick={onToggle}
    >
      <span className={favorited ? heart : heartOff}>❤</span>{' '}
      <span className={favorited ? heart : undefined}>{favoritesCount}</span>
    </Button>
  );
}
