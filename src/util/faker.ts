import * as R from 'ramda';

let initialized = false;

async function initFaker() {
  if (initialized) return;
  const [{format}, {define, registerFormat}, {faker}] = await Promise.all([
    import('date-fns'),
    import('json-schema-faker'),
    import('@faker-js/faker')
  ]);
  define('faker', () => faker);
  registerFormat('date-string', () => format(faker.date.recent(), 'yyyy-MM-dd'));
  initialized = true;
}

export async function schemaFaker<T = unknown>(schema: unknown): Promise<T> {
  await initFaker();
  const {generate} = await import('json-schema-faker');
  console.log('faker:', schema);
   
  return generate(schema as Parameters<typeof generate>[0]) as Promise<T>;
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
