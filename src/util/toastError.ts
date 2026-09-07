import {useToast} from 'haze-ui';

// 乐观 UI 已回滚，toast 只补「为什么没反应」；hook 因 useToast 需在 Provider 树内。
export function useToastError(): (e: unknown, fallback: string) => void {
  const toast = useToast();
  return (e: unknown, fallback: string) => {
    toast(e instanceof Error ? e.message : fallback, {variant: 'danger'});
  };
}
