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

// json-schema-faker 需经 options.extensions 传 faker 实例，@faker 注解才被调用；
// lorem.paragraphs 用真实换行 \n 连接（与 Article 视图 split('\n') 一致）。
// maxDepth 16 / minLength 1：jsf 默认 maxDepth=5 超深节点生成 null、纯 string 可含空串，
// 根因与修复见 decisions.md #7。
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
