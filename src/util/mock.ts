// mock 核心：mockViewData（路由 data）/ useMock（场景 hook）两类入口；配置状态在 './mock-config'。
// 刻意不静态依赖 ./faker（体积数 MB）：只动态 import，生产旁路 PROD 下原样返回 fn /
// 不注册中间件（decisions.md #7 同款 ajv 隔离）。
import {refresh} from '@native-router/core';
import {useInject, createMemoryCacheProvider} from 'react-toolroom/async';

import {clearAllCaches} from './useQuery';
import {getMockConfig, setMockConfig} from './mock-config';

export {
  getMockConfigs,
  getMockConfig,
  setMockConfig,
  onMockConfigChange,
  type MockConfigValue
} from './mock-config';

type CacheProvider = ReturnType<typeof createMemoryCacheProvider>;

// 与真实请求共用 ./validate：mock 失配 console.error 告警不抛（生成器是第三方黑盒，
// 造数缺陷不该打死 always 模式，decisions.md #7）。只在 always 分支校验——
// empty 分支可能返回真实数据，不该按 mock 口径报错。
async function validatedMock(
  key: string,
  schema: unknown,
  mocked: Promise<unknown>
): Promise<unknown> {
  const [data, {check}] = await Promise.all([mocked, import('./validate')]);
  const result = await check(schema, data, `mock ${key}`);
  if ('issues' in result) {
    const paths = result.issues.map((i) => i.path).join(', ');
    console.error(
      `[mock ${key}] 造数与 schema 失配（${result.issues.length} 处）: ${paths}\n首条: ${result.issues[0]!.message}`
    );
  }
  return data;
}

export function mockViewData<F extends (ctx: any) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string
): F {
  if (import.meta.env.PROD) return fn;

  // faker 走分支内动态 import
  return (async (ctx: Record<string, unknown>) => {
    const config = getMockConfig(key);
    const {router, location} = ctx as {router: unknown; location: unknown};

    const localConfig = {
      when: 'empty',
      ...config,
      type: 'viewData',
      location,
      schema,
      // Refresh 语义：清共享缓存再重解析当前路由，绕过 withCache 新鲜命中。
      // 被取代 reject NCE（core 1.15）吞掉；Promise.resolve 兼容 void 测试替身。
      refresh: () => {
        clearAllCaches();
        void Promise.resolve(
          refresh(router as Parameters<typeof refresh>[0])
        ).catch(() => undefined);
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
      return validatedMock(key, schema, schemaFaker(schema));
    }

    const passed: Promise<unknown> = fn(ctx);
    return passed;
  }) as F;
}

export function useMock(
  fn: (...params: unknown[]) => Promise<unknown>,
  schema: unknown,
  key: string,
  cache?: Pick<CacheProvider, 'delete'>
) {
  // 生产旁路：useInject 非 React hook，可按环境有无条件调用
  if (import.meta.env.PROD) return;

  useInject(fn, (f: typeof fn) => {
    const config = getMockConfig(key);
    // 异步中间件：faker 走动态 import，多一层 async 不改变语义
    return async (...args: Parameters<typeof fn>) => {
      const localConfig = {
        when: 'empty',
        ...config,
        type: 'async',
        location: null,
        schema,
        refresh: () => {
          // 只删当前条目（单 key 粒度，多 key 实体的无关条目不误伤）；
          // stableHash 把每次 signal 实例归一同一占位，元组长度与写入一致。
          cache?.delete(args);
          void fn(...args);
        }
      };

      setMockConfig(key, localConfig);

      if (localConfig.when === 'always') {
        const {schemaFaker} = await import('./faker');
        return validatedMock(key, schema, schemaFaker(schema));
      }
      if (localConfig.when === 'empty') {
        const {fakerWhenNothing} = await import('./faker');
        return fakerWhenNothing(f, schema)(...args);
      }
      return f(...args);
    };
  });
}
