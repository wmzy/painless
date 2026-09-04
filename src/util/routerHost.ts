// DevTool 路由面板与 Router 树的实例通道。角标/面板由根级 DevTool 渲染
//（Router 树之外，useRouter() 在那里拿不到 context），而 core ≥1.16 的
// 可观察性面（onDebug 事件流 / getDebugInfo 快照）只要实例不要 context
//——树内 null 探针（views/index.tsx 的 RouterHost，import.meta.env.DEV
// 门控）挂载时把实例登记进来，面板打开时读取。模块无副作用，生产构建
// 里探针随 DEV 常量折叠、本模块被整体摇掉（无消费者）。
import type {RouterInstance} from '@native-router/core';

// 当前登记的实例：单 router 应用里恒为同一个；publish/unpublish 成对
//（探针挂卸），后挂覆盖先挂，卸载只撤自己的登记（防误清后来者）。
let current: RouterInstance<any> | null = null;

export function publishRouter(router: RouterInstance<any>): void {
  current = router;
}

export function unpublishRouter(router: RouterInstance<any>): void {
  if (current === router) current = null;
}

export function getPublishedRouter(): RouterInstance<any> | null {
  return current;
}
