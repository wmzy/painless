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
export async function schemaFaker<T = unknown>(schema: unknown): Promise<T> {
  await initFaker();
  const [{generate}, {faker}] = await Promise.all([
    import('json-schema-faker'),
    import('@faker-js/faker')
  ]);
  console.log('faker:', schema);

  return generate(schema as Parameters<typeof generate>[0], {
    extensions: {faker}
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
