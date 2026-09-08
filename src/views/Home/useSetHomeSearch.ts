// useSetSearch(homeSearchWriteSchema) 的本地替代：库实现用
// history.location.pathname（含 baseUrl）+ toLocation 再拼 baseUrl 前缀，
// 绝对 base（GitHub Pages /painless/）下 tag 写入导航出双段路径
// /painless/painless/…（dev 相对 base '' 无感，decisions.md #32）。
// 这里用同一批 core 导出原语重放写管道（input → string → writeSchema
// validate → string），导航目标改绝对 '/?' 拼装，避开双前缀。
import {
  commitReplace,
  navigate,
  parseSearchSync,
  resolveEntry,
  reusableEntry,
  toLocation
} from '@native-router/core';
import {useRouter} from '@native-router/react';

import {homeSearchWriteSchema, type HomeSearchInput} from '@/types/search';

// react 包内部 stringifySearch（components/link-behavior.js，非公开导出）
// 的同形复刻：过滤 null/undefined、数组多键、键值 encodeURIComponent。
function stringifySearch(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, v]) => v != null)
    .map(([k, v]) =>
      (Array.isArray(v) ? v : [v])
        .map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`)
        .join('&')
    )
    .join('&');
}

// 吞 NCE（core 1.15：被取代/取消的导航 reject）——同库实现的 catch(noop)。
function swallow<T>(p: Promise<T>): Promise<T> {
  p.catch(() => undefined);
  return p;
}

export function useSetHomeSearch(): (
  input: HomeSearchInput,
  opts?: {replace?: boolean}
) => Promise<void> {
  const router = useRouter();
  return (input, opts) => {
    const coerced = parseSearchSync(
      homeSearchWriteSchema,
      stringifySearch(input as unknown as Record<string, unknown>)
    );
    const search = stringifySearch(coerced);
    const to = search ? `/?${search}` : '/';
    const location = toLocation(router, to);
    if (opts?.replace) {
      // 同库实现：会话内已有同址条目则复用并 replace 提交，否则先解析。
      const entry = reusableEntry(router, location);
      return swallow(
        entry
          ? commitReplace(router, entry.task, entry.location)
          : resolveEntry(router, location).then((e) =>
              commitReplace(router, e.task, e.location)
            )
      );
    }
    return swallow(navigate(router, to));
  };
}
