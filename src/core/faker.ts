import {JSONSchemaFaker as jsf, Schema} from 'json-schema-faker';
import * as faker from '@faker-js/faker';
import {sleep} from '@/util';

jsf.extend('faker', () => faker);

export function schemaFaker<T = unknown>(schema: unknown) {
  return jsf.resolve(schema as Schema) as unknown as Promise<T>;
}

export type MockConfig = {
  type: 'disabled' | 'throw' | 'alway' | 'when-error' | 'when-not-implemented';
  delay: number;
};

export const config = {} as Record<string, MockConfig>;

export function withMock<F extends (...p: any[]) => Promise<any>>(
  key: string,
  fn: F,
  schema: unknown,
  option: MockConfig = {type: 'when-not-implemented', delay: 1000}
): F {
  config[key] = option;
  return ((...args: unknown[]) => {
    const {type, delay} = config[key];
    if (type === 'throw') {
      sleep(delay);
      return Promise.reject(new Error(`faker error`));
    }
    if (type === 'alway') {
      sleep(delay);
      return schemaFaker(schema);
    }
    return fn(...args).catch((e: Error) => {
      if (type === 'when-error') {
        return schemaFaker(schema);
      }
      if (
        type === 'when-not-implemented' &&
        ['Function not implemented.'].includes(e.message)
      ) {
        return schemaFaker(schema);
      }
      throw e;
    });
  }) as unknown as F;
}
