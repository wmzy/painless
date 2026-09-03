import type {AppPaths} from '@/views';

import {TypedLink} from '@native-router/react';
import {Card, Title, Text} from 'haze-ui';

import {useTitle} from '@/util/useTitle';


// Router 的 notFound prop（@native-router/react ≥1.14）：解析以 core 的
// NotFoundError 拒绝（未匹配路径，或守卫/loader 抛 NotFoundError）时，
// 本组件作为该条目的提交视图渲染，优先于全局 errorHandler——未匹配
// 路径不再落 RouterError（裸 stack 对用户无意义）。与 /article/:title
// 的路由级 errorComponent（./Article/NotFound）分工不变：那是 data 段
// 失败的兜底，这里只接「路径本身不存在」。组件类型直传（库对
// ComponentType 以无参 createElement 渲染），风格对齐 Article/NotFound
// 但文案区分页面级 404。
export default function NotFound() {
  useTitle('Page Not Found · Painless');
  return (
    <Card>
      <Title>Page not found</Title>
      <Text>The page does not exist or has been moved.</Text>
      <TypedLink<AppPaths> to='/'>Back to home</TypedLink>
    </Card>
  );
}
