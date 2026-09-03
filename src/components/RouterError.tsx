import type {AppPaths} from '@/views';

import {refresh} from '@native-router/core';
import {TypedLink, useRouter} from '@native-router/react';
import {Card, Title, Text, Button} from 'haze-ui';


type Props = {
  error: Error;
};

export default function RouterError({error}: Props) {
  const router = useRouter();
  return (
    <Card>
      <Title>Error</Title>
      <Text>{error.message}</Text>
      {/* stack 仅 DEV 渲染（import.meta.env.DEV 被 vite define 常量折叠，
          生产整块摇出——同 DevTool/http 的既有先例）：生产错误页只留
          message 与操作项，不向用户泄露文件路径/源码片段等内部信息 */}
      {import.meta.env.DEV ? <pre>{error.stack}</pre> : null}
      <Button onClick={() => void refresh(router)}>Refresh</Button>
      <TypedLink<AppPaths> to='/'>Home</TypedLink>
    </Card>
  );
}
