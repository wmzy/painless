// 纯 JSON Schema 组合/裁剪工具（无任何依赖，可被生产代码静态引用——
// 引用点都包在 import.meta.env.DEV 分支里，生产构建整组折叠后本模块
// 会被摇出 chunk）。校验执行侧（ajv 动态加载）在 ./validate，两者分工：
// 这里只造 schema，那里只跑校验。

// mock 生成专用注解：@minItems/@maxItems 是「每页 10 条」的造数口径
//（真实 API 的最后一页可以不足 10 条），@unique 只约束 faker 采样，
// @faker 是造数指令——它们都不该反过来约束真实响应，校验前剔除，
// 避免合法响应误报。真正的契约约束（类型/required/minimum 等）保留。
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

// RealWorld 单实体端点的响应是 {article} / {profile} / {comment} / {tags}
// 包一层，而生成的 schema 只覆盖实体本身（Article/Author/Comment/TagList）
//。envelope 补一层最小 object schema：required 确保键存在，值交给实体
// schema——校验失败的指针形如 /article/slug，可直接定位到响应里的位置。
//
// definitions 上提（回归修复）：生成的实体 schema 以自身为根文档，
// $ref '#/definitions/Word' 这类引用按【根文档】解析（draft-07 语义）
//，definitions 就挂在它自己身上。包进信封后根文档换人，嵌套副本里的
// definitions 不再可见——ajv compile 会抛 "can't resolve reference"。
// 因此把内层 definitions 上提到信封根部，并从嵌套副本剥掉（连同 $schema
// ，它同样只在根文档有意义）。
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
