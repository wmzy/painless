// 视图级 document.title：进入设页标题，离开恢复「进入前」的值（即
// index.html 的 <title>Painless</title>——SPA 内没有第二处会写回它，
// 恢复即回退入口默认）。
//
// 方案选型——hook + effect，而非 React 19 的原生 <title> JSX：
// 1. 「离开恢复」是硬需求，而 React 19 的 head 管理只承诺卸载时移除
//    它自己浮升渲染的那个 <title> 元素——index.html 的静态 <title>
//    在 React 树外，React 从未追踪，移除后不会自动写回。要恢复终究
//    得在 cleanup 里命令式赋值，<title> JSX 方案省不掉这段 effect，
//    反而多依赖一层浮升/去重语义（多视图共存时「谁后渲染谁赢」）。
// 2. <title> JSX 的核心收益在流式 SSR 的提前注入，本项目零 SSR，
//    收益不存在；代价（约束在 React 19+）却真实。
// 3. effect 方案 jsdom 可直接断言，不依赖 React 版本的 head 管理细节。
//
// 实现的两个坑：
// - 不能写成单 effect + [title] 依赖、cleanup 里写回「effect 运行时的
//   旧值」的经典形态——title 变化触发的 cleanup 同样会执行，把
//   document.title 写回上一轮的本页 title 而非入口默认值。拆两个
//   effect：写入 effect 无 cleanup，随 title 变化只覆写；恢复 effect
//   空依赖，cleanup 只在卸载时执行，恢复挂载首帧快照的进入前值。
// - 快照取在 effect 期而非渲染期（useRef(document.title) 初始化）：
//   路由换树是同一次 commit，新视图渲染时旧视图的 cleanup 还没跑，
//   渲染期读到的 document.title 是上一页的标题；effect 期旧视图已
//   恢复默认值，基线才正确。
import {useEffect, useRef} from 'react';

export function useTitle(title: string): void {
  // string | null：null 表示「首次 setup 尚未发生」。渲染期不初始化
  // （见上），首次写入 effect 运行时才快照
  const entryTitleRef = useRef<string | null>(null);

  // 写入：首帧快照进入前值（此后不再更新——title 中途变化不改变
  // 「离开时回到哪」的答案），随后覆写 document.title
  useEffect(() => {
    if (entryTitleRef.current === null) entryTitleRef.current = document.title;
    document.title = title;
  }, [title]);

  // 恢复：仅卸载 cleanup 执行（StrictMode 双调用下 setup 空操作，
  // 快照经 ref 存活，重挂后写入 effect 重设值，净效果不变）
  useEffect(
    () => () => {
      if (entryTitleRef.current !== null) {
        document.title = entryTitleRef.current;
      }
    },
    []
  );
}
