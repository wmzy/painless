import {Link} from '@native-router/react';
import {Card, Title, Text} from 'haze-ui';

// /article/:title 的路由级 errorComponent：data（findByTitle）失败时由
// native-router 在出错路由层级渲染，不再落到全局 errorHandler。props
// 形状见 @native-router/react dist/types/types.d.ts 的 errorComponent
// 声明：{error: Error; ctx: Context<Route>}——ctx 本组件用不到，声明
// 较窄的 props 依然可赋值（参数逆变）。
type Props = {
  error: Error;
};

// 404 判别用 duck-typing：http 层错误是 fetch-fun HTTPError（带 status
// 字段），但这里刻意不 import 该类型，避免视图层耦合 http 模块（其它
// 来源的 error 只要形状一致同样命中）。
function isNotFound(error: Error): boolean {
  return 'status' in error && (error as {status?: unknown}).status === 404;
}

export default function NotFound({error}: Props) {
  return (
    <Card>
      <Title>Article not found</Title>
      <Text>
        {isNotFound(error)
          ? 'The article does not exist or has been removed.'
          : `Failed to load the article: ${error.message}`}
      </Text>
      <Link to='/'>Back to home</Link>
    </Card>
  );
}
