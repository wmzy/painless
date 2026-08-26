# Painless

> A lightweight React SPA template — zero SSR, zero-runtime CSS, type-safe.

English | [简体中文](./README-zh_CN.md)

Painless is a [RealWorld](https://github.com/gothinkster/realworld) conduit demo built as a **template**: clone it, delete what you don't need, and you have a production-shaped client-side React app — routing with data loading and login guards, an HTTP client, a typed mock pipeline, and a test suite — without buying into any framework runtime.

## Why Painless?

Modern frontend development is overly complex. Painless strips away the complexity while keeping the power.

- **Zero complex concepts** - No SSR, no server-side runtime, just pure client-side React
- **Zero-runtime CSS** - Using Linaria, styles are extracted at build time
- **Type-safe** - Full TypeScript support with zero configuration
- **Instant feedback** - Hot Module Replacement for instant updates
- **Feel the prefetch** - Hovering an article link (`PreviewLink`) renders a scaled-down live preview of the target view before you even click

## Design Philosophy

Painless makes deliberate trade-offs. Here's what we chose NOT to include, and why.

### No SSR / SSG — Pure Client-Side

We believe introducing SSR/SSG adds architectural complexity that isn't justified for most applications. If you need SEO for search engines, serve pre-rendered HTML to bot traffic via a headless browser — a simple, effective solution that doesn't contaminate your application architecture with server-side concerns.

### No Server-Side Capabilities

A frontend framework should not try to be a backend. API Routes, Server Actions, and server-side middleware belong in dedicated backend frameworks. A web frontend is not an application's only client — mobile apps, desktop apps, and other clients all need the same backend. Coupling the web frontend with the backend is a half-measure that serves only one client while leaving others to integrate separately. A clean API layer that all clients can consume is the right boundary.

### Flat Routing — No Nested / Parallel Routes

The route is the page, and the page is the state. Nested and parallel routes attempt to decompose page state into independent URL-driven fragments, which introduces unnecessary complexity in data loading, error boundaries, and layout composition. We believe this is over-engineering — if a section of your UI needs independent state, it's a component, not a route.

### No State Management Libraries

If your application is properly decomposed into pages and components, each with clear responsibilities, state lives where it's used. State management libraries encourage centralizing state that should be local, creating coupling between unrelated parts of the application. Use React's built-in primitives (`useState`, `useContext`, `useRef`) and lift state only when genuinely shared.

### No Structural Sharing — Re-renders Are Cheaper Than Deep Equality

Some data libraries keep old object references when a refetch returns identical content (structural sharing), letting subscribers skip re-renders. We deliberately don't: deep equality costs O(payload) on every successful fetch, while the re-render it prevents is a cheap page-level reconcile that usually produces no DOM changes at all. Refetches are low-frequency — `staleTime` gates background revalidation, and fresh hits fire no request. If a specific component must skip updates, give it scalar props behind `React.memo`; don't tax every fetch of every query to save one component's render.

### No Built-In Image Optimization

Image optimization is a service concern, not a framework concern. A dedicated image service (CDN-based or self-hosted) can serve optimized images to all clients — web, mobile, desktop — not just the frontend framework. Coupling this into the framework creates vendor lock-in and serves only one client.

### Platform-Agnostic Deployment

Painless produces standard static assets. It does not couple to any specific deployment platform — no proprietary middleware, no platform-specific APIs, no vendor lock-in. Deploy to GitHub Pages, Netlify, Vercel, Cloudflare Pages, your own CDN, or a USB drive. The output is yours.

## Tech Stack

- [React](https://react.dev) - UI library
- [@native-router/react](https://github.com/native-router/react) - Lightweight client-side routing with data loading and prefetching
- [react-toolroom](https://github.com/wmzy/react-toolroom) - Async data hooks (`react-toolroom/async`)
- [fetch-fun](https://github.com/wmzy/fetch-fun) - Pipeable functional fetch toolkit
- [react-f0rm](https://github.com/wmzy/react-f0rm) - Event-driven form library
- [haze-ui](https://github.com/wmzy/haze-ui) - Component library with zero-runtime CSS
- [react-use-control](https://github.com/wmzy/react-use-control) - Controlled/uncontrolled state in one line
- [Linaria](https://github.com/callstack/linaria) - Zero-runtime CSS-in-JS
- [Vite](https://vitejs.dev) - Build tooling
- TypeScript - Type safety
- [Vitest](https://vitest.dev) - Test framework

## Features

All examples below are taken from (or lightly adapted from) the actual source in `src/`.

### Flat, Config-Driven Routing

Routes are a plain module-level object: each route owns a `path`, a lazy `component`, and an optional async `data` loader that runs before the view renders.

```tsx
// src/views/index.tsx
import {View, HistoryRouter as Router} from '@native-router/react';

const routes = {
  component: () => import('./Layout'),
  children: [
    {
      path: '/',
      data: ({location}) => {
        const query = decode(location.search.slice(1));
        return articleService.query(query);
      },
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      data: ({params: {title}}) => articleService.findByTitle(title!),
      component: () => import('./Article')
    },
    // ... /help, /about, /login, /register
    {path: '/editor', beforeLoad: requireLogin, component: () => import('./Editor')},
    {path: '/editor/:slug', beforeLoad: requireLogin, component: () => import('./Editor')}
  ]
} as Route;

export default function App() {
  return (
    <Router routes={routes} errorHandler={(e) => <RouterError error={e} />}>
      <View />
      <Loading />
    </Router>
  );
}
```

Views read route data with a typed `useData<T>()` and react to URL changes with `useMatched()`. In `Home`, the tag filter and pagination live entirely in the query string — the route declares a `search` schema (any Standard Schema — zod/valibot/…; here a hand-written one), the loader receives the coerced `ctx.search`, and changing the search re-runs the loader, so the URL is the state:

```tsx
// src/views/Home/index.tsx
import {useData, useSearch} from '@native-router/react';

export default function Home() {
  const {articles, articlesCount} = useData<ArticlePage>() ?? {articles: [], articlesCount: 0};
  const {tag, offset, limit} = useSearch(homeSearchSchema);
  // ...
}
```

### Login Guard via `beforeLoad`

`@native-router` ships route guards: `beforeLoad` runs before the view resolves — return a path string and the router redirects during resolve, before the navigation commits (the URL never lands on the guarded route):

```tsx
// src/views/index.tsx
const requireLogin: Route['beforeLoad'] = () => {
  if (!getCurrentUser()) return '/login';
};

// routes
{path: '/editor', beforeLoad: requireLogin, component: () => import('./Editor')},
{path: '/editor/:slug', beforeLoad: requireLogin, component: () => import('./Editor')}
```

Prefetching runs the same guard — hovering a `PrefetchLink` to a guarded route while logged out just resolves the redirect target, no side effects.

### Hover Prefetching with `PrefetchLink`

`PrefetchLink` prefetches the target route's data **and** view chunk on hover (or focus). The template's `PreviewLink` wraps it and additionally renders a scaled-down live preview of the prefetched view:

```tsx
// src/components/PreviewLink.tsx
import {PrefetchLink} from '@native-router/react';
import {useControl, type Control} from 'react-use-control';

type Props = ComponentProps<typeof PrefetchLink> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({children, visible: visibleControl, ...props}: Props) {
  const [visible, setVisible] = useControl(visibleControl as Control<boolean>, false);
  return (
    <PrefetchLink {...props}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
      >
        {children}
      </span>
      <Preview visible={visible} />
    </PrefetchLink>
  );
}
```

> Note: prefetching runs route `beforeLoad` guards too — hovering a link to a guarded route while logged out just resolves the redirect target, no side effects.

### Controlled/Uncontrolled State in One Prop (`react-use-control`)

State a component exposes to its host — panel open/closed, preview visibility — follows the **control object** convention instead of the classic `value`/`defaultValue`/`onChange` triple. A control is an opaque token returned by `useControl`: whoever creates the state first owns it, everyone else reuses it. The same convention powers every stateful haze-ui component and the `FormItem` form bridge.

Before — the classic triple needs dual-source arbitration on every render and every write:

```tsx
type Props = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function DevTool({open, defaultOpen = false, onOpenChange}: Props) {
  // Two sources of truth: external `open` vs internal state
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };
  // ...
}
```

After — actual `src/components/DevTool.tsx` source, one prop, uncontrolled by default:

```tsx
import {useControl, type Control} from 'react-use-control';

function DevToolInner({open: openControl}: {open?: Control<boolean> | boolean}) {
  const [open, setOpen] = useControl(openControl as Control<boolean>, false);
  // ...
}

export default function DevTool({children, open}: Props) {
  return (
    <>
      {children}
      <DevToolInner open={open} />
    </>
  );
}
```

The host picks a mode per usage — the component never changes:

```tsx
<DevTool />  // uncontrolled: internal state, closed by default
<DevTool open />  // uncontrolled: plain value seeds the initial state

// controlled: the host owns the state — one shared state, not two kept in
// sync; the panel's Close button writes back through the same control
const [open, setOpen, openCtrl] = useControl(false);
<DevTool open={openCtrl} />
<button onClick={() => setOpen(true)}>Open panel</button>  // e.g. a hotkey, or E2E
```

What the token buys over the triple:

- **One prop instead of three** — no `defaultOpen`/`onOpenChange` plumbing; a plain value already means "uncontrolled seed"
- **No arbitration, no mirroring** — there is no second source of truth to reconcile: a control that already holds state is reused as-is (no `useEffect` sync, no callback round-trips)
- **Sibling sharing for free** — pass the same control to several children and they share one state; the triple needs `value`+`onChange` threaded through each child
- **One mechanism across the stack** — `FormItem`'s render-prop `control` is the same token, which is why a react-f0rm field binds a haze-ui input as `value={control}` with zero adapters

Scope discipline — the pattern is for state a host may want to steer. Deliberately not converted:

- read-only receivers: `Preview` keeps `visible: boolean` — it never writes back
- state owned by another library: react-f0rm owns form fields
- page-local state: view-level `error` messages stay `useState`

One caveat: a control prop must be identity-stable across renders — dev builds throw if the same mounted hook receives a different control object.

### A Project-Level `useQuery` Preset

Instead of adopting a data-fetching library, the template composes `react-toolroom/async` primitives (`useInjectable`, `useCache`, `useRun`, `useResult`, `useLoading`, `useInitialLoading`, `useError`, `useRetry`, `useFocusRevalidate`) into **one** project-owned hook — demonstrating the idea that each project should shape its own query layer:

```ts
// src/util/useQuery.ts (signature)
function useQuery<F extends AsyncFunc>(
  fn: F,
  args: Parameters<F>,
  opts: QueryOptions<R<F>>
): QueryResult<R<F> | undefined>;

type QueryOptions<T> = {
  cache: EntityCache<T, any>;  // required — pick the per-entity cache (see allCaches)
  staleTime?: number;          // defaults to 2000ms
  initData?: T;                // initial data to avoid undefined on first render
  retry?: {                    // feeds useRetry; disabled by default
    retries?: number;
    backoff?: 'exponential' | 'linear' | ((attempt: number) => number);
  };
  mock?: MockConfig;           // {schema, key} — hooks the DevTool mock panel
};

type QueryResult<T> = {
  data: T;
  loading: boolean;     // initial load only — true until the first result exists
  fetching: boolean;    // any request in flight (incl. background refetches)
  error: Error | undefined;
  stale: boolean;
  refetch: () => void;  // drops the cache entry for the current args and re-runs
};
```

The cache is **per-entity** (`articleCache` / `homeCache` / `commentsCache` / `tagsCache`): the value type and the key-tuple type are pinned on the cache itself, so `peek` results are narrowed without `as` casts and a wrong-shaped key is a compile error — the `'article'`-style magic string prefix disappears because identity *is* the cache binding. The hash normalizes two ways (signals stripped; object keys with `undefined` values dropped recursively), so `{tag: undefined}` and `{}` are one key — a loader key from a schema output and a view-side key from component state can never drift apart. `allCaches` registers every entity cache for logout-time clears and the DevTool panel.

Out of the box the preset wires the behaviors projects usually hand-roll: concurrent same-args calls are **deduplicated at the provider level** — since react-toolroom 0.8, `useCache`'s miss/stale revalidation routes through `queryCache.load` (an atomic get-or-insert of the in-flight slot), so every consumer *and every channel* (another component, a route loader — see below) asking for the same key while a request is pending shares that one promise; dependency changes **abort** the previous request via a trailing `AbortSignal` threaded through the service layer to `fetch` (`useRun({signal: true})`); cache/load/refetch keys are all one **structural hash** (`stableHash` with signals stripped — key-order-insensitive); and window focus / visibility regain **revalidates in the background** (`useFocusRevalidate`) — fresh entries hit the cache without a request, stale ones swap in silently.

Real usage, from the tag sidebar and the comment list:

```tsx
// src/views/Home/Tags.tsx
const {data: tags, loading, error, stale} = useQuery(articleService.fetchTags, [], {
  cache: tagsCache,
  initData: [],
  mock: {schema: tagListSchema, key: 'tagList'}
});

// src/views/Article/CommentList.tsx
const {data: comments, loading, error} = useQuery(
  articleService.fetchCommentsByTitle,
  [title],
  {cache: commentsCache, initData: []}
);
```

### Route Loaders Share the Entity Caches (`withCache`)

The two data channels — route `data` loaders and `useQuery` — deliberately share the **entity caches**. They differ in *when* they trigger and whether they block (loader: navigation resolve, `pendingComponent` skeleton; query: post-mount, loading/error states), but cache and invalidation are one. `withCache(cache, keyOf, fn)` (`src/util/loaderCache.ts`) wraps a loader; `keyOf(ctx)` is the **single place** the entity's key is defined — the loader addresses `articleCache` as `[title]` / `homeCache` as `[search]`, and mutations address the same tuples through the cache binding, so views never hand-assemble keys at all (the old `homeCacheArgs` "payload must match the schema output shape" footgun is structurally gone — the hash drops `undefined` keys).

`withCache` gives the loader SWR semantics — fresh hits return the cached value with zero requests, stale hits return the old value immediately and revalidate in the background, misses fall through to the skeleton/error paths. Combined with the router's view stack, a navigation lands in one of four states:

| Navigation lands on | Loader runs? | What the user sees |
| --- | --- | --- |
| viewStack snapshot (POP within the session window) | no — replay | instant previous view, **zero requests** |
| cache hit, fresh (< `staleTime` 2s) | yes — cache only | instant cached data, **zero requests** |
| cache hit, stale | yes — background revalidate | old value immediately, refreshed in place — no skeleton, no flash |
| cache miss | yes — network | `pendingComponent` skeleton (cold start) |

In-flight requests are shared across channels at the provider level: a `PrefetchLink` warm-up and the real navigation resolve to the *same* in-flight promise, so hovering a link first does not double-fetch.

Two session-level freshness edges are covered: on `logout()` the Layout also calls `invalidate(router)` (native-router ≥1.6) — view-stack snapshots of the previous account are dropped, so a later back POP re-resolves through guards and loaders instead of replaying the old account's views; and `pageshow` with `persisted: true` (bfcache restore — the SPA gets no navigation event) triggers `refresh(router)`: loaders re-run against the cache, fresh hits cost nothing, stale ones swap in silently.

### Composable Optimistic Mutations (`cache.mutation`)

Write-through favorite / follow used to be ~30 hand-rolled lines per call site (peek baseline → set → `refresh(router)` → success merge → failure rollback). Since react-toolroom 0.10, that pipeline is a **cache-bound declarative API** — the recipe lives in the service layer (`src/services/mutations.ts`), composed per cache projection:

```ts
// src/services/mutations.ts
// article 层：单实体原语，可被任何视图/其它层复用
export const favoriteOnArticle = articleCache.mutation(
  (slug: string, on: boolean) => ({
    mutate: () => api.favoriteArticle(slug, on),
    key: [slug],
    update: (old) => ({...old, favorited: on,
      favoritesCount: old.favoritesCount + (on ? 1 : -1)}),
    // field-selecting merge: the response was captured when the request
    // started — only the favorite fields are authoritative, a `following`
    // written while this was in flight survives
    apply: (old, resp) => ({...old, favorited: resp.favorited,
      favoritesCount: resp.favoritesCount})
  })
);

// home 层：信息流投影，组合在上一层之上（key 省略 = patch every entry）
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on),   // composition point
  update: (page, slug, on) => patchArticleIn(page, slug, {...}),
  apply: (page, resp) => patchArticleIn(page, resp.slug, {...})
}));
```

The pipeline journals every write, and on failure rolls back with an identity guard — an entry is restored only if it still holds exactly the optimistic value, so a concurrent writer's newer state survives our rollback. Views reduce to a call plus error surfacing:

```tsx
// src/views/Home/index.tsx
const [favorite] = useMutation(favoriteOnHome);
const toggleFavorite = (a: Article) => {
  if (!getCurrentUser()) return void navigate(router, '/login');
  void favorite(a.slug, !a.favorited).catch(() => undefined);
};
```

Three properties fall out of the composition for free:

- **Multi-projection consistency** — favoriting from `Home` writes both the `articleCache` entry and every `homeCache` page containing the slug in one call; the "back to the list shows the stale count" gap is gone.
- **Refresh is automatic** — `withCache` subscribes each cache's `set` events on first loader run and refreshes the router when an already-seen key's value reference changes (microtask-debounced). Write-through, rollback, `patchWhere` batches and background revalidation settles all flow through it; views contain zero `refresh` calls. The reference-change check doubles as a structural-sharing substitute: a revalidation that settles with the same reference triggers nothing.
- **Failure isolation** — each layer miss-bails independently (nothing is fabricated for absent entries, so an optimistic write can never resurrect an entry a logout just cleared), and a rejection unwinds every composed layer.

Comment posting stays with declarative invalidation (`invalidates: [commentsCache]`) — list shape after an append is not locally computable, a hard refetch is the right tool; `Editor` saving likewise invalidates `homeCache`/`articleCache` wholesale.

### A Typed HTTP Client on `fetch-fun`

`src/util/http.ts` builds a pipeable client: base URL (`VITE_API_URL` override, default `https://api.realworld.io/api/`), JSON headers, auth injection, retry (idempotent GET/HEAD only) with a per-attempt 10s timeout, and an error mapper that turns non-2xx responses into `ApiError` — `status` and the field-structured `errors` object preserved, `message` flattened for readability (`message` first, otherwise the `errors` object joined into text). A 401 fires the registered unauthorized handler (the auth service uses it to auto-logout on expired tokens):

```ts
// src/util/http.ts (excerpt)
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;
}

const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.use, stripEmptyAuth) // never send an empty Authorization header
  .pipe(ff.use, ff.withRetry(2, {methods: ['GET', 'HEAD']}))
  .pipe(ff.use, ff.withTimeout(10_000)) // per-attempt budget, inner of retry
  .pipe(ff.use, mapToApiError); // HTTPError → ApiError (+ 401 hook)
```

Services are thin functions over `get`/`post`/`put`/`del`:

```ts
// src/services/article.ts
export function fetchTags(): Promise<string[]> {
  return http.get<{tags: string[]}>('tags').then(({tags}) => tags);
}
```

### Auth with Token Injection

`src/services/auth.ts` persists the current user to `localStorage` (`painless.user`), restores it on load, and registers a token supplier with the HTTP layer — so login/logout never requires rebuilding the client pipeline. `src/index.tsx` imports `@/services/auth` for its side effect, ensuring even the first route-`data` request after a cold refresh carries `Authorization`:

```ts
// src/services/auth.ts
let currentUser: User | null = readStoredUser();
http.setTokenGetter(() => currentUser?.token);

export function getCurrentUser(): User | null;
export function onAuthChange(handler: (user: User | null) => void): () => void;
export function login(email: string, password: string): Promise<User>;
export function register(username: string, email: string, password: string): Promise<User>;
export function logout(): void;
```

`Layout` subscribes with `onAuthChange` and swaps the nav between `Login / Register` and `username / New Article / Logout`.

### Typed Mock Data + DevTool Panel

Domain types carry JSON Schema annotations as JSDoc tags. At build time, `rollup-plugin-type-as-json-schema` compiles them into `.schema` files; in dev, `src/util/faker.ts` feeds them to `json-schema-faker` with the `@faker-js/faker` instance (passed via `options.extensions`, as required by json-schema-faker 0.6):

```ts
// src/types/base.ts
/**
 * @faker {"lorem.sentence": [20]}
 */
export type Sentence = string;

/**
 * @faker {"lorem.paragraphs": [5]}
 */
export type Paragraphs = string;

// src/types/index.ts
export type Article = {
  title: Sentence;
  body: Paragraphs;
  slug: Slug;
  // ...
};
```

Two integration points:

- Route loaders: `mockViewData(fn, schema, key)` wraps a route `data` function.
- Component queries: `useQuery`'s `mock: {schema, key}` option.

Both register with the **DevTool** panel (dev-only), where each dataset can be switched between `empty` (mock only when the API errors or returns nothing) and `always`. Every mock-config write (`setMockConfig`) clears the shared `queryCache` — mocks take precedence over cache: a mode switch or panel Refresh must bypass the loader's fresh `withCache` hits, or the mock would never take effect (dev-only; production has no `setMockConfig` callers).

### Zero-Runtime CSS

Linaria styles are tagged template literals extracted at build time by `@wyw-in-js/vite` — nothing ships to the browser but class names:

```tsx
// src/views/Home/index.tsx
import {css} from '@linaria/core';

// Push the favorite button to the right end of the author row
const pushRight = css`
  margin-left: auto;
`;
```

## Getting Started

```bash
# Clone the template
git clone https://github.com/wmzy/painless.git my-app
cd my-app

# Install dependencies
pnpm install

# Start development server
pnpm start
```

## Project Structure

```
painless/
├── src/
│   ├── components/     # Reusable UI: Loading, RouterError,
│   │                   # PreviewLink + Preview, Popover, DevTool (dev-only mock panel)
│   ├── services/       # API layer over http: article.ts, auth.ts
│   ├── types/          # Domain types; base.ts carries JSON Schema annotations
│   ├── typings/        # Ambient declarations (vite.d.ts, schema.d.ts)
│   ├── util/           # http.ts, useQuery.ts, faker.ts
│   ├── views/          # index.tsx (router + routes), Layout/, Home/, Article/,
│   │                   # Editor/, Login/, Register/, About/, Help/
│   └── index.tsx       # Entry point
├── public/             # Static assets
├── .github/workflows/  # CI (lint, test, build) and Pages deploy
├── vite.config.mts     # Vite configuration (@ alias, Linaria, schema plugin)
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start development server (Vite) |
| `pnpm build` | Build for production |
| `pnpm serve` | Preview the production build (`vite preview`) |
| `pnpm lint` | Run ESLint with auto-fix |
| `pnpm lint:ci` | Run ESLint without auto-fix (used in CI) |
| `pnpm test` | Run tests in watch mode (Vitest) |
| `pnpm test:run` | Run tests once (CI mode) |
| `pnpm test:ui` | Run tests in the Vitest UI |
| `pnpm coverage` | Run tests with coverage |
| `pnpm deploy` | Build the demo and publish to GitHub Pages |
| `pnpm commit` | Run lint-staged, then an interactive commitizen prompt |

CI runs on every push/PR to `main`: `lint:ci` → `test:run` → `build`.

## Testing

Tests use Vitest with Testing Library. Component tests (`Home`, `Editor`, `Article`, `PreviewLink`, `Loading`, `RouterError`) mock the service layer rather than the network, so they exercise real view logic; unit tests cover `useQuery`, `http`, `faker`, and `auth` directly.

```bash
pnpm test:run                      # all tests
pnpm test:run -- src/util          # a directory
```

## Related Projects

- [@native-router/react](https://github.com/native-router/react) - Routing
- [react-toolroom](https://github.com/wmzy/react-toolroom) - Async data hooks
- [fetch-fun](https://github.com/wmzy/fetch-fun) - Functional fetch toolkit
- [react-f0rm](https://github.com/wmzy/react-f0rm) - Event-driven forms
- [haze-ui](https://github.com/wmzy/haze-ui) - Component library
- [react-use-control](https://github.com/wmzy/react-use-control) - Controlled/uncontrolled state

## Contributing

Contributions are welcome! Please read our [contributing guide](./CONTRIBUTING.md).

## License

[ISC](https://choosealicense.com/licenses/isc/)
