// 独立纯状态模块：useQuery.persistEnabled 也读它，从 mock.ts import 会成循环（decisions.md #12）。
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
  // setMockConfig 每次请求都调；清缓存只在用户交互点（DevTool 切 when/Refresh/Clear）。
  ee.emit(emitter, 'change');
}

export function onMockConfigChange(cb: () => void) {
  return ee.on(emitter, 'change', cb);
}
