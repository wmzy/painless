// DevTool 路由面板与 Router 树的实例通道：根级 DevTool 在 Router 树外拿不到 context，
// 树内 null 探针（views/index.tsx 的 RouterHost，DEV 门控）挂载时登记实例。无副作用，
// 生产探针随 DEV 折叠、本模块摇掉（decisions.md #23）。
import type {RouterInstance} from '@native-router/core';

// 单 router 应用恒为同一实例；卸载只撤自己的登记（防误清后来者）。
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
