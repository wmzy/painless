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

// jsf 需 extensions 传 faker 实例才调 @faker；paragraphs 用 \n 换行；maxDepth/minLength 覆盖默认（超深 null/空串，decisions.md #7）。
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
