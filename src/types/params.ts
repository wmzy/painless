import type {StandardSchemaV1} from '@native-router/react';

// /editor/:slug 路由的 params 契约（@native-router ≥1.9 的 route.params）。
// 手写 Standard Schema（与 src/types/search.ts 同风格）——模板不为此引入
// schema 库，同时演示 params 校验对任何标准实现开放。schema 在 resolve
// 期匹配后、beforeLoad 前运行：守卫与 loader 拿到的已是 coerce 后的值；
// 校验失败以 ParamsError 经路由器全局 errorHandler（RouterError）呈现
// （native-router 的通道分工：params/search 段失败走全局，data 段失败
// 才走路由级 errorComponent）。校验必须同步完成。

export type EditorParams = {
  slug: string;
};

// 读侧核心：matcher 抽出的原始 string map → coerce（trim）+ 校验。
// slug 即文章路径段（RealWorld 的 GET articles/{title}，e2e 对
// /article/:title 的注释：:title 即 slug）。URL 解码后的首尾空白不是
// slug 的一部分，trim 掉；trim 后为空（/editor/%20 之类病态输入）即
// 非法——报 issue 走 ParamsError → NotFound，而不是带空 slug 去请求。
const parseEditorParams = (
  input: unknown
): StandardSchemaV1.Result<EditorParams> => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  if (slug === '') {
    return {
      issues: [{message: 'slug must be a non-empty path segment'}]
    };
  }
  return {value: {slug}};
};

export const editorParamsSchema: StandardSchemaV1<unknown, EditorParams> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => parseEditorParams(input)
  }
};
