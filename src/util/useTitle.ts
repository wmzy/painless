// 选 hook + 两段 effect 而非 React 19 <title> JSX（decisions.md #11）。
// 快照取 effect 期而非渲染期：路由换树同一次 commit，渲染期读到旧页标题。
import {useEffect, useRef} from 'react';

export function useTitle(title: string): void {
  const entryTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (entryTitleRef.current === null) entryTitleRef.current = document.title;
    document.title = title;
  }, [title]);

  // StrictMode 双调用 setup 空操作，快照经 ref 存活。
  useEffect(
    () => () => {
      if (entryTitleRef.current !== null) {
        document.title = entryTitleRef.current;
      }
    },
    []
  );
}
