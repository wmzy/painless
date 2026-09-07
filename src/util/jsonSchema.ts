// 纯 schema 组合/裁剪工具（零依赖）；校验执行侧在 ./validate（分工：这里造 schema，那里跑校验）。

// 造数注解（@minItems/@maxItems/@unique/@faker）不约束真实响应，校验前剔除（decisions.md #7）。
const MOCK_ONLY_KEYWORDS = new Set(['minItems', 'maxItems', 'unique', 'faker']);

/** 递归剔除 schema 里的 mock 生成专用关键字，返回可校验真实响应的副本。 */
export function forResponse(schema: unknown): unknown {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (!MOCK_ONLY_KEYWORDS.has(key)) out[key] = walk(value);
      }
      return out;
    }
    return node;
  };
  return walk(schema);
}

// 单实体响应包一层 {entity}；envelope 补最小 object schema，required 保证键存在。
// definitions 上提：$ref 按根文档解析（draft-07），嵌套副本里的 definitions 对 ajv 不可见
//（会抛 can't resolve reference），连同 $schema 一并剥到信封根部。
export function envelope(key: string, schema: unknown): object {
  const inner =
    schema === null || typeof schema !== 'object'
      ? undefined
      : (schema as Record<string, unknown>);
  const definitions = inner?.definitions as
    | Record<string, unknown>
    | undefined;
  const stripped = Object.fromEntries(
    Object.entries(inner ?? {}).filter(
      ([k]) => k !== 'definitions' && k !== '$schema'
    )
  );
  return {
    type: 'object',
    properties: {[key]: stripped},
    required: [key],
    ...(definitions ? {definitions} : {})
  };
}
