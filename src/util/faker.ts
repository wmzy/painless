import * as R from 'ramda';

let initialized = false;

async function initFaker() {
  if (initialized) return;
  const [{format}, {registerFormat}, {faker}] = await Promise.all([
    import('date-fns'),
    import('json-schema-faker'),
    import('@faker-js/faker')
  ]);
  registerFormat('date-string', () => format(faker.date.recent(), 'yyyy-MM-dd'));
  initialized = true;
}

// json-schema-faker@0.6 要求把 faker 实例经 options.extensions 传入，
// schema 里的 @faker 注解（如 {"lorem.paragraphs": [5]}）才会被真正调用；
// lorem.paragraphs 默认用真实换行 \n 连接段落，与 Article 视图的 split('\n') 一致。
//
// maxDepth 16：jsf 默认 maxDepth=5，超深的节点被替换成 {type:'null'} 生成
// 默认值（Author 在 ArticlePage.articles[] 内是第 4-5 层——username 空串、
// image 恒 null、@faker 注解整层失效，即 decisions.md 第 7 条记录的深层
// $ref 丢注解问题，根因实为深度截断而非 $ref 本身）。16 覆盖本项目最深
// 形状（根/数组/实体/author/字段 共 5 层）且对递归 schema 仍是安全上限。
// minLength 1：纯 {type:'string'} 节点的随机长度可含 0，username 等无
// 注解字段会零星造出空串；本仓库没有合法空串字段，统一抬到 1。
export async function schemaFaker<T = unknown>(schema: unknown): Promise<T> {
  await initFaker();
  const [{generate}, {faker}] = await Promise.all([
    import('json-schema-faker'),
    import('@faker-js/faker')
  ]);
  return generate(schema as Parameters<typeof generate>[0], {
    extensions: {faker},
    maxDepth: 16,
    minLength: 1
  }) as Promise<T>;
}

export function fakerWhenNothing<F extends (...args: any) => Promise<any>>(
  fn: F,
  schema: unknown
): F {
  return R.pipe(
    fn,
    R.andThen(R.when(R.isEmpty, () => schemaFaker(schema))),
    R.otherwise(() => schemaFaker(schema))
  ) as F;
}
