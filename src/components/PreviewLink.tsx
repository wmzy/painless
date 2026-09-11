import type {AppRoutes} from '@/views';

import {useRef} from 'react';
import {TypedLink, type TypedLinkProps} from '@native-router/react';
import {useControl, type Control} from 'react-use-control';

import Preview from './Preview';

// 除 children 外全部透传给 TypedLink<AppRoutes>（表形态）：to 按路由表
// 模式编译期判别，动态段（/article/:title）同时要求 params，search 按
// 目标模式 schema 的 Input 位判别（调用点 search 载荷编译期受检；无
// schema 的模式保持宽松 SearchInput）——
// 此前停留无类型 PrefetchLink 的原因（TypedLinkProps 不透传 prefetch）
// 已随 react 1.15 消失：声明 prefetch 时 TypedLink 内部按 PrefetchLink
// 渲染，未声明走普通 Link。prefetch 缺省 'viewport'（卡片滚入视口即预取
// data+chunk，点击近乎零等待——本组件的唯一调用语义），调用方可显式
// 覆盖（含 'none'）。省流量模式下两者皆拦——见组件内守卫。
// NetworkInformation 不在 TS dom lib 保证范围，按需窄化到唯一关心的
// saveData 字段（不引依赖）
type ConnectionLike = {saveData?: boolean};
// visible 遵循 control 模式（同 haze-ui 组件约定）：传 Control 受控
//（宿主接管显隐，如触屏设备用长按替代 hover），传 boolean 为非受控
// 初值，不传则默认隐藏——hover/focus 两种交互仍走组件内 setVisible
type Props = TypedLinkProps<AppRoutes> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({
  children,
  visible: visibleControl,
  prefetch,
  ...props
}: Props) {
  const [visible, setVisible] = useControl(
    visibleControl as Control<boolean>,
    false
  );
  // 触发器 ref：Preview 用它取锚点几何（面板钉在链接下方/上方）
  const triggerRef = useRef<HTMLSpanElement>(null);
  // 省流量守卫：saveData 用户（计费/带宽敏感）对预取一视同仁地拦——
  // 无论缺省 'viewport' 还是调用点显式传入。取舍：预取全是投机流量
  //（用户未表达意图就可能发 GET，显式传入也只是模板作者意图而非用户
  // 意图），省流量模式下这类请求正是用户要求避免的；拦法是置
  // undefined——TypedLink 对 undefined 视同未声明，走普通链接路径，
  // 不经 PrefetchLink（也就零 router.preload）。hover 预览不动：那是
  // 显式用户意图。无 connection API 的旧环境 saveData 天然 undefined →
  // 不拦，随仓库特性检测降级惯例（同 About feed 哨兵
  // IntersectionObserver）
  const connection = (navigator as Navigator & {connection?: ConnectionLike})
    .connection;
  const prefetchProp =
    connection?.saveData === true ? undefined : prefetch ?? 'viewport';
  return (
    <TypedLink<AppRoutes> {...props} prefetch={prefetchProp}>
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
      >
        {children}
      </span>
      <Preview visible={visible} anchorRef={triggerRef} />
    </TypedLink>
  );
}
