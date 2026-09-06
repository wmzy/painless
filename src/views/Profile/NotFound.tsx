import type {AppPaths} from '@/views';

import {TypedLink} from '@native-router/react';
import {Card, Title, Text, useTitle} from 'haze-ui';


// /profile/:username 的路由级 errorComponent（与 Article/NotFound 同构）：
// data（fetchProfile）失败时由 native-router 在出错路由层级渲染。props
// 形状同 Article/NotFound——{error: Error; ctx: Context<Route>}，ctx 本
// 组件用不到，声明较窄的 props 依然可赋值（参数逆变）。
type Props = {
  error: Error;
};

// 404 判别用 duck-typing：http 层错误是 fetch-fun HTTPError（带 status
// 字段），刻意不 import 该类型（同 Article/NotFound 先例）——其它来源
// 的 error 只要形状一致同样命中。
function isNotFound(error: Error): boolean {
  return 'status' in error && (error as {status?: unknown}).status === 404;
}

export default function NotFound({error}: Props) {
  useTitle('Not Found · Painless');
  return (
    <Card>
      <Title>Profile not found</Title>
      <Text>
        {isNotFound(error)
          ? 'The profile does not exist.'
          : `Failed to load the profile: ${error.message}`}
      </Text>
      <TypedLink<AppPaths> to='/'>Back to home</TypedLink>
    </Card>
  );
}
