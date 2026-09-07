// DevTool 在 Router 树外拿不到 context，经树内 null 探针登记实例（decisions.md #23）。
import type {RouterInstance} from '@native-router/core';

// 卸载只撤自己的登记（防误清后来者）。
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
