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

// 类型→schema→mock→运行时校验 全链闭环：生成 schema（与 mock 管道同一
// 份虚拟模块）→ faker 造数 → util/validate（ajv）校验。这正是 dev-only
// 响应校验要保证的两个方向：好数据放行、坏数据可定位报错。
// 用 authorSchema（$ref 深度 2，生成稳定）作样本：ArticlePage 的
// articles[].author.image 在 json-schema-faker 0.6 下会丢 @faker 注解
// 生成 null（见 decisions.md 第 7 条的已知漂移记录），不适合当好数据
// 样本。
describe('schema → faker → validate', () => {
  it('should pass runtime validation for generated author data', async () => {
    const {authorSchema} = await import('@/types/index.schema');
    const {check} = await import('@/util/validate');

    const data = await schemaFaker(authorSchema);
    const result = await check(authorSchema, data, 'test author');

    expect(result).toEqual({value: data});
  });

  it('should flag a deliberately broken mock shape with a located issue', async () => {
    const {authorSchema} = await import('@/types/index.schema');
    const {check} = await import('@/util/validate');

    const data = await schemaFaker<{image: unknown}>(authorSchema);
    // 故意改坏 mock 响应形状：image 应为 string
    data.image = 42;

    const result = await check(authorSchema, data, 'test author');
    expect('issues' in result).toBe(true);
    const issues = (result as {issues: {path: string; message: string}[]})
      .issues;
    const imageIssue = issues.find((i) => i.path === '/image');
    expect(imageIssue).toBeDefined();
    expect(imageIssue!.message).toContain('must be string');
    expect(imageIssue!.message).toContain('42');
  });

  // 回归（e2e 缺陷）：services/article.ts 的 envelope 包裹生成 schema 时，
  // 内层 $ref '#/definitions/X' 按根文档解析——definitions 不上提到信封
  // 根部，ajv compile 直接抛 "can't resolve reference"，dev 校验把响应
  // 整个挡下。修复见 jsonSchema.ts envelope 的 definitions 上提。
  it('should compile enveloped generated schemas (definitions hoisting)', async () => {
    const {articleSchema, tagListSchema} = await import('@/types/index.schema');
    const {check} = await import('@/util/validate');
    const {envelope} = await import('@/util/jsonSchema');

    const tags = await check(
      envelope('tags', tagListSchema),
      {tags: ['a', 'b']},
      'test tags'
    );
    expect(tags).toEqual({value: {tags: ['a', 'b']}});

    // 失配也要定位到信封内的指针：/article/slug
    const bad = await check(
      envelope('article', articleSchema),
      {article: {slug: 42}},
      'test article'
    );
    expect('issues' in bad).toBe(true);
    const issues = (bad as {issues: {path: string; message: string}[]}).issues;
    const slugIssue = issues.find((i) => i.path === '/article/slug');
    expect(slugIssue).toBeDefined();
    expect(slugIssue!.message).toContain('must be string');
  });
});
