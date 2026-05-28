import * as R from 'ramda';
import {format} from 'date-fns';
import {
  type JsonSchema,
  generate,
  define,
  registerFormat
} from 'json-schema-faker';
import {faker} from '@faker-js/faker';

define('faker', () => faker);
registerFormat('date-string', () => format(faker.date.recent(), 'yyyy-MM-dd'));

export function schemaFaker<T = unknown>(schema: unknown): Promise<T> {
  console.log('faker:', schema);
  return generate(schema as JsonSchema) as Promise<T>;
}

export function fakerWhenNothing<F extends (...args: any) => Promise<any>>(
  fn: F,
  schema: unknown
): F {
  return R.pipe(
    fn,
    R.andThen(R.when(R.isEmpty, () => schemaFaker(schema))),
    R.otherwise(() => schemaFaker(schema))
  );
}
