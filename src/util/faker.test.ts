import {describe, it, expect, vi} from 'vitest';

import {schemaFaker, fakerWhenNothing} from '@/util/faker';

describe('schemaFaker', () => {
  it('should generate data from a simple schema', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: {type: 'string'},
        age: {type: 'integer', minimum: 0, maximum: 100}
      },
      required: ['name', 'age']
    };
    const result = await schemaFaker(schema);
    expect(result).toBeDefined();
    expect(typeof (result as any).name).toBe('string');
    expect(typeof (result as any).age).toBe('number');
  });

  it('should generate data from a schema with nested objects', async () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            email: {type: 'string', format: 'email'}
          },
          required: ['email']
        }
      },
      required: ['user']
    };
    const result = await schemaFaker(schema);
    expect(result).toBeDefined();
    expect((result as any).user).toBeDefined();
    expect(typeof (result as any).user.email).toBe('string');
  });

  it('should generate data from an array schema', async () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {type: 'integer'},
          title: {type: 'string'}
        },
        required: ['id', 'title']
      },
      minItems: 1,
      maxItems: 3
    };
    const result = await schemaFaker(schema);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect((result as any).length).toBeGreaterThanOrEqual(1);
    expect((result as any).length).toBeLessThanOrEqual(3);
    expect(typeof (result as any)[0].id).toBe('number');
    expect(typeof (result as any)[0].title).toBe('string');
  });
});

describe('fakerWhenNothing', () => {
  it('should call original function when it returns data', async () => {
    const mockFn = async () => ({data: 'test'});
    const schema = {type: 'object', properties: {data: {type: 'string'}}};
    const wrappedFn = fakerWhenNothing(mockFn, schema);
    const result = await wrappedFn();
    expect(result).toEqual({data: 'test'});
  });

  it('should generate fake data when original returns null', async () => {
    const mockFn = async () => null;
    const schema = {
      type: 'object',
      properties: {name: {type: 'string'}},
      required: ['name']
    };
    const wrappedFn = fakerWhenNothing(mockFn, schema);
    const result = await wrappedFn();
    expect(result).toBeDefined();
  });

  it('should generate fake data when original throws an error', async () => {
    const mockFn = async () => {
      throw new Error('Network error');
    };
    const schema = {
      type: 'object',
      properties: {name: {type: 'string'}},
      required: ['name']
    };
    const wrappedFn = fakerWhenNothing(mockFn, schema);
    const result = await wrappedFn();
    expect(result).toBeDefined();
  });

  it('should pass arguments through to original function', async () => {
    const mockFn = vi.fn(async (id: number) => ({id, name: 'test'}));
    const schema = {
      type: 'object',
      properties: {id: {type: 'integer'}, name: {type: 'string'}},
      required: ['id', 'name']
    };
    const wrappedFn = fakerWhenNothing(mockFn, schema);
    await wrappedFn(42);
    expect(mockFn).toHaveBeenCalledWith(42);
  });
});
