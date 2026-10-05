import {expect, test} from '@playwright/test';

// dev server 同端口挂载 s200 API（vite.config.mts 的
// s200ApiPlugin，decisions.md #42）：/api 前缀由 dev server
// 的 configureServer 中间件直分 s200 应用，是 dev-only
// 表面（prod preview 无此挂载——本 spec 只被 chromium/dev
// 项目收集，prod 项目的 testMatch 精确圈定不包含它）。
// request fixture 直连 dev server，不过 page.route（那只
// 拦截浏览器页面请求），钉住同端口契约：路由分发
// （GET/POST）、查询解析与缺省值、JSON 请求体往返、
// 未命中端点的 404 JSON。
test('dev server mounts the s200 API on the same port', async ({
  request
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({status: 'ok'});

  const hello = await request.get('/api/hello?name=s200');
  expect(hello.status()).toBe(200);
  expect(await hello.json()).toEqual({hello: 's200'});

  const defaultHello = await request.get('/api/hello');
  expect(defaultHello.status()).toBe(200);
  expect(await defaultHello.json()).toEqual({hello: 'painless'});

  const payload = {
    name: 'painless',
    nested: {count: 2, tags: ['s200', 'starter']}
  };
  const echo = await request.post('/api/echo', {data: payload});
  expect(echo.status()).toBe(200);
  expect(await echo.json()).toEqual(payload);

  const missing = await request.get('/api/nope');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type'] ?? '').toMatch(
    /^application\/json/
  );
});
