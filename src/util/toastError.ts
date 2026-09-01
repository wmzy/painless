import {useToast} from 'haze-ui';

// 「轻量写失败 → danger toast」的收敛点（原三处同构内联：Home favorite、
// Article favorite/follow）。适用前提：乐观 UI 已由 cache.mutation 管道
// 自动回滚、无需页内 Alert 占位的写操作——toast 只补「为什么没反应」这
// 一环；失败需要留在现场的（如评论提交）仍走页内 Alert，不用本 hook。
// hook 形态而非裸函数：useToast 必须在 ToastProvider 树内调用，这里把
// 上下文绑定收进 hook，调用点签名收敛为 (e, fallback)。
// 非 Error 抛出物（字符串 throw 等）没有可用的 message，落调用方给的
// fallback 文案——这与 Article 的 errText（String(e) 直显）是刻意两种
// 策略：toast 场景调用方永远知道自己刚发起什么操作，fallback 比串化
// 值可读；页内 Alert 场景唯一调用点保持原策略不合并。
export function useToastError(): (e: unknown, fallback: string) => void {
  const toast = useToast();
  return (e: unknown, fallback: string) => {
    toast(e instanceof Error ? e.message : fallback, {variant: 'danger'});
  };
}
