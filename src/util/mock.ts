// mock 核心（自 components/DevTool.tsx 平移）：mockViewData（路由视图
// data）/ useMock（场景 query hook 请求）两类 mock 入口；mock 配置状态
// 在 './mock-config'（本模块 re-export，消费方 import 路径不破）。
// 刻意不静态依赖 './faker'——@faker-js/faker + json-schema-faker 体积达数
// MB，只应在开发模式真正要造数时动态 import， faker 生态才不会被打进
// 生产 chunk（'./validate' 的 ajv 同理，见 validatedMock）。生产旁路：
// import.meta.env.PROD 时 mockViewData 原样返回 fn、useMock 不注册任何
// 中间件（连 setMockConfig 副作用也不做），弱网空响应也不会在运行时
// 动态拉取 faker。
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

// mock 响应与真实请求共用同一校验器（./validate）：faker 产物失配
// schema（缺 required 字段、类型漂移）在 dev 以 console.error 报出定位
// 信息（哪个 mock + 数据路径 + 期望 vs 实际），数据照常返回。真实响应
// 侧是抛错挡下（fail fast），mock 侧刻意保持告警不抛——生成器是第三方
// 黑盒，任何未来造数缺陷不该把 DevTool 的 always 模式整个打死（当初的
// 触发案例 jsf 深度截断已在 ./faker 用 maxDepth 修复，见 decisions.md
// 第 7 条）。只在 always（纯 mock）分支校验：empty 分支可能返回真实
// 数据，不该按 mock 口径报错。
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
          // 只删当前条目：Refresh 语义是「重新生成本条 mock」，不是
          // 「清空整个实体」——多 key 实体（articleCache 各 slug）的
          // 无关条目不得误伤。捕获的 args 与缓存条目同 key：stableHash
          // 把每个 signal 实例归一到同一占位（useRun 每次追加的 signal
          // 不同实例不拆 key），元组长度与写入时一致
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
