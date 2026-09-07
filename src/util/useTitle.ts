// 进入设页标题，离开恢复进入前的值。选 hook + 两段 effect 而非 React 19 <title> JSX
//（JSX 方案省不掉恢复 effect，收益只在流式 SSR）——论证见 decisions.md #11。
// 两段 effect：写入 effect 无 cleanup（title 变化只覆写）；恢复 effect 空依赖只在卸载
// cleanup（快照取 effect 期而非渲染期——路由换树同一次 commit，渲染期读到的是旧页标题）。
import {useEffect, useRef} from 'react';

export function useTitle(title: string): void {
  // null = 首次 setup 尚未发生；快照在首帧写入 effect 期（见文件头）
  const entryTitleRef = useRef<string | null>(null);

  // 首帧快照进入前值（此后不再更新），随后覆写 document.title
  useEffect(() => {
    if (entryTitleRef.current === null) entryTitleRef.current = document.title;
    document.title = title;
  }, [title]);

  // 仅卸载 cleanup 恢复（StrictMode 双调用 setup 空操作，快照经 ref 存活）
  useEffect(
    () => () => {
      if (entryTitleRef.current !== null) {
        document.title = entryTitleRef.current;
      }
    },
    []
  );
}
