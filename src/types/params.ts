import type {StandardSchemaV1} from '@native-router/react';
// Result 定义在 core namespace；react 1.9 起 StandardSchemaV1 无 namespace 成员，Result 从 core 取。
import type {StandardSchemaV1 as CoreSchemaV1} from '@native-router/core';

// 手写 Standard Schema（不引 schema 库）；resolve 期匹配后、beforeLoad 前运行。
// params/search 段失败走全局 RouterError，data 段才走路由级 errorComponent。
export type EditorParams = {
  slug: string;
};

// trim 后为空报 issue 走 ParamsError → NotFound，不带空 slug 请求。
const parseEditorParams = (
  input: unknown
): CoreSchemaV1.Result<EditorParams> => {
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

// 与 editorParamsSchema 同构 trim + 非空校验。
export type ProfileParams = {
  username: string;
};

const parseProfileParams = (
  input: unknown
): CoreSchemaV1.Result<ProfileParams> => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  if (username === '') {
    return {
      issues: [{message: 'username must be a non-empty path segment'}]
    };
  }
  return {value: {username}};
};

export const profileParamsSchema: StandardSchemaV1<unknown, ProfileParams> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => parseProfileParams(input)
  }
};
