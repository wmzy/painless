// mock 核心（自 components/DevTool.tsx 平移）：mock 配置状态与
// mockViewData（路由视图 data）/ useMock（useQuery 请求）两类 mock 入口。
// 刻意不静态依赖 './faker'——@faker-js/faker + json-schema-faker 体积达数
// MB，只应在开发模式真正要造数时动态 import， faker 生态才不会被打进
// 生产 chunk。生产旁路：import.meta.env.PROD 时 mockViewData 原样返回
// fn、useMock 不注册任何中间件（连 setMockConfig 副作用也不做），
// 弱网空响应也不会在运行时动态拉取 faker。
import * as ee from '@for-fun/event-emitter';
import {refresh} from '@native-router/core';
import {useInject, createMemoryCacheProvider} from 'react-toolroom/async';

import {clearAllCaches} from './useQuery';

type CacheProvider = ReturnType<typeof createMemoryCacheProvider>;

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

export function mockViewData<F extends (ctx: any) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string
): F {
  if (import.meta.env.PROD) return fn;

  // 异步包装：faker 走分支内动态 import，调用方（路由 data loader）
  // 本就以 Promise 消费结果
  return (async (ctx: Record<string, unknown>) => {
    const config = getMockConfig(key);
    const {router, location} = ctx as {router: unknown; location: unknown};

    const localConfig = {
      when: 'empty',
      ...config,
      type: 'viewData',
      location,
      schema,
      // 面板 Refresh 语义：清共享缓存再重解析当前路由——绕过 withCache
      // 的新鲜命中，mock 分支（含 'always' 重新生成）才会真正执行
      refresh: () => {
        clearAllCaches();
        void refresh(router as Parameters<typeof refresh>[0]);
      }
    };

    setMockConfig(key, localConfig);

    if (localConfig.when === 'empty') {
      const {fakerWhenNothing} = await import('./faker');
      // 经 Promise<unknown> 中转，避免 any 直灌返回值（no-unsafe-return）
      const generated: Promise<unknown> = fakerWhenNothing(fn, schema)(ctx);
      return generated;
    }

    if (localConfig.when === 'always') {
      const {schemaFaker} = await import('./faker');
      const mocked: Promise<unknown> = schemaFaker(schema);
      return mocked;
    }

    const passed: Promise<unknown> = fn(ctx);
    return passed;
  }) as F;
}

export function useMock(
  fn: (...params: unknown[]) => Promise<unknown>,
  schema: unknown,
  key: string,
  cache?: Pick<CacheProvider, 'clear'>
) {
  // 生产旁路：useInject 非 React hook，可按环境有无条件调用
  if (import.meta.env.PROD) return;

  useInject(fn, (f: typeof fn) => {
    const config = getMockConfig(key);
    // 异步中间件：faker 走分支内动态 import；被包裹的请求函数本就返回
    // Promise，多一层 async 不改变调用方语义
    return async (...args: Parameters<typeof fn>) => {
      const localConfig = {
        when: 'empty',
        ...config,
        type: 'async',
        location: null,
        schema,
        refresh: () => {
          cache?.clear();
          void fn(...args);
        }
      };

      setMockConfig(key, localConfig);

      if (localConfig.when === 'always') {
        const {schemaFaker} = await import('./faker');
        return schemaFaker(schema);
      }
      if (localConfig.when === 'empty') {
        const {fakerWhenNothing} = await import('./faker');
        return fakerWhenNothing(f, schema)(...args);
      }
      return f(...args);
    };
  });
}
