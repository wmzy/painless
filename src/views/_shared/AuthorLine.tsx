// 文章卡「作者行」与「tag 徽标列表」的跨视图收敛：Home/ArticlePreview、
// Article 视图、About/Feed 三处各自手写同构的 <Avatar + username (+右侧
// 动作槽)>，ArticlePreview 与 Feed 另有两处同构的 tag Badge 列表——
// 视觉（Flex align/gap）、ARIA（Avatar alt=username）与收敛前逐处一致，
// 视图测试零改动。纯展示组件：数据/动作仍由调用点持有，右侧按钮经
// children 槽注入（FavoriteButton / Follow 按钮等）。
import type {ReactNode} from 'react';

import type {Author} from '@/types';
import {Avatar, Badge, Flex, Text} from 'haze-ui';
import type {AvatarProps} from 'haze-ui';

type AuthorLineProps = {
  author: Author;
  // Avatar 尺寸透传（缺省 md）：三处调用点目前同尺寸，留给需要差异
  // 化的未来调用点，不在本组件内私设默认
  size?: AvatarProps['size'];
  // 右侧动作槽：渲染在 username 之后、同一行内
  children?: ReactNode;
};

export function AuthorLine({author, size, children}: AuthorLineProps) {
  return (
    <Flex align='center' gap='sm'>
      <Avatar src={author.image ?? undefined} alt={author.username} size={size} />
      <Text>{author.username}</Text>
      {children}
    </Flex>
  );
}

// tag 徽标列表（ArticlePreview / Feed 同构收敛）：tags 来自文章实体，
// 只读展示，readonly 数组照收
export function TagList({tags}: {tags: readonly string[]}) {
  return (
    <Flex gap='xs' wrap>
      {tags.map((tag) => (
        <Badge key={tag}>{tag}</Badge>
      ))}
    </Flex>
  );
}
