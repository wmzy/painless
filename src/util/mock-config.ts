// mock 配置状态（自 mock.ts 抽出）：独立的纯状态模块——useQuery.ts 的
// attachPersistence 也要读它（always 激活期间挂起持久化镜像写入，见
// docs/decisions.md 第 12 条），若从 mock.ts import 会与其
// clearAllCaches 依赖构成 useQuery↔mock 循环。mock.ts 仍 re-export 全套，
// DevTool 等既有消费方的 import 路径不破。
import * as ee from '@for-fun/event-emitter';

const emitter = ee.create();

export type MockConfigValue = Record<string, unknown>;
let mockConfig: Record<string, MockConfigValue> = {};

export function getMockConfigs(): Record<string, MockConfigValue> {
  return mockConfig;
}

export function getMockConfig(key: string): MockConfigValue {
  return mockConfig[key] ?? {};
}

export function setMockConfig(key: string, config: MockConfigValue): void {
  mockConfig = {...mockConfig, [key]: config};
  // 纯状态写入：mockViewData/useMock 每次 loader 运行/请求都会调本函数
  // 刷新面板条目（携带 location/refresh 闭包），若在此清缓存等于 dev 下
  // 「凡带 mock 的请求即清空共享缓存」，withCache 的命中全被击穿。清
  // 缓存只挂在真正的用户交互点：DevTool 切换 when、Refresh 按钮
  // （mockViewData 的 refresh 闭包）与 CacheView 的 Clear。
  ee.emit(emitter, 'change');
}

export function onMockConfigChange(cb: () => void) {
  return ee.on(emitter, 'change', cb);
}
