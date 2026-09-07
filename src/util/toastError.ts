import {useToast} from 'haze-ui';

// 轻量写失败 → danger toast 的收敛点（乐观 UI 已自动回滚，toast 只补「为什么没反应」）。
// hook 形态：useToast 需在 Provider 树内；非 Error 抛出物落 fallback（toast 场景 fallback 更可读）。
export function useToastError(): (e: unknown, fallback: string) => void {
  const toast = useToast();
  return (e: unknown, fallback: string) => {
    toast(e instanceof Error ? e.message : fallback, {variant: 'danger'});
  };
}
