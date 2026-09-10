import {css} from '@linaria/core';
import {Card, Title, Text} from 'haze-ui';

import {useTitle} from '@/util/useTitle';

// 短文页卡片收敛行宽（与文章页同一编辑部尺度）
const cardCls = css`
  max-width: 720px;
  margin-inline: auto;
`;

export default function Help() {
  // 页标题（统一口径见 Home 的 useTitle 注释）
  useTitle('Help · Painless');
  return (
    <Card className={cardCls}>
      <Title>Help</Title>
      <Text>
        Welcome to Painless — a lightweight React framework for modern
        client-side apps.
      </Text>
    </Card>
  );
}
