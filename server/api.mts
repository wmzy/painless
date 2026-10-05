import type {App} from 's200';

import {get, json, post, readJson} from 's200';

export function apiRoutes(app: App): void {
  get(app, '/api/health', (ctx) => json(ctx, {status: 'ok'}));
  get(app, '/api/hello', (ctx) => json(ctx, {hello: ctx.query.get('name') ?? 'painless'}));
  post(app, '/api/echo', async (ctx) => json(ctx, await readJson(ctx)));
}
