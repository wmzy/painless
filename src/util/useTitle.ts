// 选 hook + 两段 effect 而非 React 19 <title> JSX（decisions.md #11）。
// 快照取 effect 期而非渲染期：路由换树同一次 commit，渲染期读到旧页标题。
//
// 与 haze-ui 导出版本同构，多一个 TitleWriteContext 闸门：Preview 浮层
// 渲染的是目标视图的装饰性复制品，其 useTitle 必须静默（悬停文章卡片
// 不应改写标签页标题）。默认 true，浮层用 provider 关掉；正常页不感知。
import {createContext, useContext, useEffect, useRef} from 'react';

export const TitleWriteContext = createContext(true);

export function useTitle(title: string): void {
  const write = useContext(TitleWriteContext);
  const entryTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!write) return;
    if (entryTitleRef.current === null) entryTitleRef.current = document.title;
    document.title = title;
  }, [title, write]);

  // StrictMode 双调用 setup 空操作，快照经 ref 存活；离开作用域即恢复。
  useEffect(
    () => () => {
      if (entryTitleRef.current !== null) {
        document.title = entryTitleRef.current;
      }
    },
    []
  );
}
