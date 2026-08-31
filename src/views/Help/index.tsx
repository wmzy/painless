import {Card, Title, Text} from 'haze-ui';

import {useTitle} from '@/util/useTitle';

export default function Help() {
  // 页标题（统一口径见 Home 的 useTitle 注释）
  useTitle('Help · Painless');
  return (
    <Card>
      <Title>Help</Title>
      <Text>
        Welcome to Painless — a lightweight React framework for modern
        client-side apps.
      </Text>
    </Card>
  );
}
