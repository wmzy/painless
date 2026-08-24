import {css} from '@linaria/core';
import {Card, Flex, Skeleton} from 'haze-ui';

// 卡片内的纵向节奏：真实卡片的 Title/Text 由 haze-ui 排版类渲染，
// 骨架 span 没有字号行高，用 grid gap 复刻近似间距，冷启动 → 内容
// 切换时灰块落在真内容将出现的位置，布局不跳
const stack = css`
  display: grid;
  gap: var(--haze-space-3);
`;

// 卡片之间的间隔：真实列表卡片直接堆叠在 div 里（Card 无外边距），
// 骨架给一格 gap，避免灰块连成一整片
const cards = css`
  display: grid;
  gap: var(--haze-space-4);
`;

// 单张文章卡片占位：结构复刻 Home 的卡片（头像+作者行/标题/两行描述/
// 标签行），尺寸取真实元素的缺省值（Avatar md=40px、Badge 高约 20px），
// 灰块即真内容的镜像。haze-ui Skeleton 自带 shimmer 动画，直接组合。
function CardSkeleton() {
  return (
    <Card>
      <Flex align='center' gap='sm'>
        <Skeleton variant='circular' width={40} height={40} />
        <Skeleton variant='text' width={120} />
      </Flex>
      <div className={stack}>
        <Skeleton variant='text' width='60%' height={28} />
        <Skeleton variant='text' width='95%' />
        <Skeleton variant='text' width='80%' />
      </div>
      <Flex gap='xs' wrap>
        <Skeleton variant='rectangular' width={52} height={20} />
        <Skeleton variant='rectangular' width={72} height={20} />
      </Flex>
    </Card>
  );
}

// '/' 的路由级 pendingComponent：只在冷启动/刷新（无前视图可保留）时
// 渲染，应用内导航保持旧视图。张数取首屏可见量而非整页 limit（10），
// 填满视口即可，避免冷启动期渲染超长骨架。
export default function HomeSkeleton() {
  return (
    <div className={cards}>
      {Array.from({length: 5}, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
