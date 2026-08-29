import {describe, it, expect} from 'vitest';

import {editorParamsSchema} from './params';

// /editor/:slug 的 params 契约（Standard Schema）：coerce（trim）与
// 非法输入的 issue 上报——后者是路由侧 ParamsError → errorComponent
// （NotFound）的触发源，形状错了整条错误通道就断了。
describe('editorParamsSchema', () => {
  const validate = editorParamsSchema['~standard'].validate;

  it('合法 slug：透传', () => {
    expect(validate({slug: 'old-title-1'})).toEqual({
      value: {slug: 'old-title-1'}
    });
  });

  it('coerce：首尾空白被 trim 掉', () => {
    expect(validate({slug: '  old-title-1  '})).toEqual({
      value: {slug: 'old-title-1'}
    });
  });

  it('非法：trim 后为空报 issue（ParamsError 源）', () => {
    const result = validate({slug: '   '}) as {issues?: {message: string}[]};
    expect(result.issues).toBeDefined();
    expect(result.issues?.[0]?.message).toContain('non-empty');
  });

  it('非法：slug 缺失/非字符串同样报 issue，不给缺省', () => {
    expect((validate({}) as {issues?: unknown}).issues).toBeDefined();
    expect((validate({slug: 42}) as {issues?: unknown}).issues).toBeDefined();
    // 空输入（无 params 的误用）不因 ?? {} 兜底而放行
    expect((validate(undefined) as {issues?: unknown}).issues).toBeDefined();
  });
});
