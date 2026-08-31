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

  // 回归（类型契约漂移）：Comment.createdAt/updatedAt 必须是 date-time
  // 字符串（PastDate）而非数字时间戳——RealWorld API 返回 ISO 字符串
  // （openapi.d.ts 的 Comment schema），schema 由该类型自动生成，若回退
  // 成 number，dev 运行时校验会把真实后端的响应整个挡下
  // （ValidationError）。双向钉死：数字被拒且定位到 /createdAt、
  // /updatedAt，ISO 形态（/\d{4}-\d{2}-\d{2}T/）放行。刻意不断言
  // schemaFaker(commentSchema) 的日期形态：date.past 注解经
  // json-schema-faker 0.6 产出 Date.toString() 文案，是 decisions.md
  // 已记录的生成侧漂移，与本契约无关。
  it('should reject numeric comment timestamps and accept date-time strings', async () => {
    const {commentSchema} = await import('@/types/index.schema');
    const {check} = await import('@/util/validate');

    const comment = {
      id: 'c1',
      body: 'contract fixture',
      slug: 'some-title-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      author: {username: 'bob', image: 'https://example.com/b.png', following: false}
    };
    expect(comment.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const good = await check(commentSchema, comment, 'test comment');
    expect(good).toEqual({value: comment});

    const bad = await check(
      commentSchema,
      {...comment, createdAt: 1_767_225_600_000, updatedAt: 1_767_225_600_000},
      'test comment'
    );
    expect('issues' in bad).toBe(true);
    const issues = (bad as {issues: {path: string; message: string}[]}).issues;
    expect(issues.some((i) => i.path === '/createdAt')).toBe(true);
    expect(issues.some((i) => i.path === '/updatedAt')).toBe(true);
  });
});
