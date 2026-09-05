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

### Token in localStorage — A Documented Trade-off

The auth token lives in `localStorage` (`src/services/auth.ts`) — RealWorld mandates `Token`-header authentication, and localStorage survives refresh, so a login isn't lost on reload. The cost is stated plainly: any successful XSS can read the token, where an httpOnly cookie keeps it out of JavaScript's reach entirely.

We accept the trade deliberately. The textbook alternative — an httpOnly refresh cookie plus an access token held in memory — requires backend cooperation a pure client-side template cannot assume, and it discards the session on every refresh: a narrower attack surface bought with a worse product. The main XSS vector is already closed — React escapes by default and the template never touches `dangerouslySetInnerHTML` — and what remains is defense-in-depth (CSP and friends) that is application-specific and deliberately left to you. A template's job is to put the trade-off on the table, not to decide it for you. If your threat model differs, the whole mechanism is one file: swap the storage in `src/services/auth.ts`.

### Platform-Agnostic Deployment

Painless produces standard static assets. It does not couple to any specific deployment platform — no proprietary middleware, no platform-specific APIs, no vendor lock-in. Deploy to GitHub Pages, Netlify, Vercel, Cloudflare Pages, your own CDN, or a USB drive. The output is yours.

Deep-link refreshes under a subpath need one line of config each side, and the build chain carries the fallback: for GitHub Pages, build with `VITE_BASE=/painless/` — the absolute base prefixes assets, the router derives its `baseUrl` from the same value (`src/views/index.tsx`), and the build appends `dist/404.html` (index.html copy, `scripts/make-404.mjs`) which Pages serves for unknown paths so the SPA takes over the route; Netlify/Cloudflare Pages instead honor `public/_redirects` (the `/* → /index.html 200` rewrite). Serving from a domain root works with the default relative base out of the box.

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

## Coming from TanStack?

If you know TanStack Query/Router/Form, the problems they solve are solved here too — with different shapes: per-entity caches instead of a client + provider, scenario hooks instead of option bags, composable functions instead of a framework runtime. The map below is written against the actual code in `src/`, not marketing.

| TanStack | Here | Note |
| --- | --- | --- |
| `QueryClient` + `QueryClientProvider` | per-entity `createQueryCache(name, cacheTime?, {persist?})` + the `allCaches` registry | No provider, no context — caches are plain module-level objects; the registry drives logout clears and the DevTool cache view. `cacheTime` defaults to 5 min (TanStack's `gcTime` default); `tagsCache` is the one persisted entity. |
| `queryKey` array + hashing | the args tuple, hashed by `hashArgs` (`react-toolroom` ≥0.24 — signals stripped, `undefined` keys dropped recursively) | The key's *shape* is pinned on the cache type (`EntityCache<T, K>`), so a wrong-shaped key is a compile error, not a silent cache miss. |
| `useQuery(options)` | `createQueryHook(config)` → a scenario hook (`useTagsQuery`, `useCommentsQuery`, …) | All options (`staleTime`, `initData`, `mock`) close once at the scenario declaration point; the call site takes only `args`. `fetch` × cache are paired exactly once by `bindQueryFn(fetch, cache)` — loader, hook and mutation channels resolve the same binding. |
| `onMutate`/`onError` optimistic ritual | `cache.mutation((…) => ({mutate, key, update, apply}))` | `update` is the optimistic step, `apply` a field-selecting merge, rollback automatic and identity-guarded (a concurrent writer's newer value survives); layers compose — favoriting writes the article entity *and* every home page containing it in one call. |
| `invalidateQueries` prefix match | `useMutation(fn, {invalidates: [[commentsCache, slug]]})` (exact key) or `{invalidates: [homeCache, articleCache]}` (whole entity); imperative `invalidate(router)` for view-stack snapshots | Granularity follows "does the write map 1:1 to the key?" — a comment maps to `[slug]`, an edit can't enumerate home's search-combination keys; failures never invalidate. |
| `useInfiniteQuery` | `useInfinite` (`react-toolroom/async`) | `fetchNextPage`/`fetchPreviousPage`/`maxPages` equivalents; deliberately not wired into a cache — the About feed (`src/services/feed.ts`) is the in-repo example. |
| `refetchInterval` | `usePolling` | Skips ticks while a call is slow, pauses when the tab is hidden. |
| `queryFn` + fetch defaults | the fetch-fun pipe (`src/util/http.ts`) | Timeout, retry, auth injection and error mapping are pipe stages, not options — the role ky plays; the OpenAPI graft on `openapi-typescript` types (`src/services/article.openapi.ts`) is the openapi-fetch analogue. |
| Router `loader` | route `data` via `createDataLoader({fetch, cache, keyOf})` → the `[loader, useData, queryFn]` triplet | The loader shares the entity cache with component queries through `withCache` (fresh hit = zero requests, stale = old value first + background revalidate); cache `set` events auto-`refresh(router)`, so views contain zero refresh calls. |
| `beforeLoad` + router `context` | same names, same semantics | Returning a path from `beforeLoad` redirects during resolve — the URL never lands on the guarded route; `Router context={{getUser}}` is typed via the route's third generic. |
| Search-param validation | route `search:` takes any Standard Schema (zod / valibot / hand-written) | `useSearch(schema)` on the read side; `TypedLink<AppRoutes>`'s `search` prop is checked against the schema's Input side, so a typo'd field is a compile error. Writes go through `useSetSearch(writeSchema(readSchema, defaults))` (`@native-router/core` ≥1.13): the write side is derived from the one read contract, validates through it and strips keys equal to their defaults, so URLs stay clean and read back identically (`src/types/search.ts`). |
| `useBlocker` | same name, `@native-router/react` | Sync predicate (`() => !isDirty(form)`) with `{state, proceed, reset}` to drive a confirm dialog; a vetoed POP is automatically pushed back. |
| `useForm` / `<Form>` | react-f0rm `useForm` / `<Form>` + haze-ui `FormItem` | Controlled fields via the `control` token, per-field subscriptions (`useIsSubmitting`, `useHasErrors`); this template composes small field-level `validate` callbacks, and `react-f0rm/resolvers/standard-schema` exists for zod/valibot/arktype; cross-field rules (Register's password-confirm) declare `validateDeps` on `useForm` (react-f0rm ≥0.10, TanStack's `onChangeListenTo` counterpart) so editing either field re-runs the form-level validate; server 422s land in the same error channel via `setServerErrors`. |
| Query Dev Tools | the DevTool panel (dev-only) | Cache view (per-entry age, in-flight badges, event stream), a request log, and a routes/viewStack panel (navigation event timeline + router snapshot, on `onDebug`/`getDebugInfo` — core ≥1.16) — dev-only modules that fold out of production builds. |

### Bundle Size, Same Yardstick

All numbers measured the same way: esbuild `--bundle --minify` (peer deps external, regular deps included), zlib gzip level 9. "used" = the import set painless actually pulls (for TanStack, the hooks an app of this shape needs); "full" = the whole entry. The "Here" column was re-measured on 2026-09-05 at the versions installed today; the counterpart column is the 2026-08-31 measurement — npm latest for all four counterparts is unchanged, so those figures stand.

| Role | Here (min+gzip) | Counterpart (min+gzip) |
| --- | --- | --- |
| Async state | react-toolroom/async **~7.0 kB** (full: 8.1) | @tanstack/react-query **~10.9 kB** (full: 13.9) |
| Forms | react-f0rm **~7.6 kB** (full: 9.7) | @tanstack/react-form **~17.6 kB** |
| HTTP client | fetch-fun **~4.5 kB** (full: 6.1) | ky **~9.3 kB** |
| Routing | @native-router core+react **~18.0 kB** (core 5.6 + react 12.4) | @tanstack/react-router **~34.8 kB** |

Versions measured (Here): react-toolroom 1.1.0, react-f0rm 1.1.1, fetch-fun 0.12.1, @native-router/core 1.16.1 + react 1.15.0 (installed, 2026-09-05) — previously 0.18.2 / 0.7.0 / 0.10.0 / 1.10.0+1.9.0 at ~6.0 / 6.3 / 5.5 / 11.0 kB; the growth is the documented runtime additions (keyed result semantics, per-entry cache defaults, navigation observability, typed-link prefetch) — vs @tanstack/react-query 5.102.8, @tanstack/react-form 1.33.5, @tanstack/react-router 1.170.32, ky 2.1.0 (npm latest, unchanged since 2026-08-31).

### What TanStack Has That This Stack Deliberately Doesn't

- **Structural sharing** — deep equality costs O(payload) on every successful fetch to skip a re-render that is usually a no-op DOM reconcile; a hot component gets `React.memo` + scalar props instead (see Design Philosophy).
- **The `enabled` switch** — options close once at the scenario declaration point, so conditional fetching is a conditional hook call; runtime option switches are the option-bag problem this layer exists to avoid, and unused options are YAGNI'd away (`docs/decisions.md` §2).
- **Offline mutation queue** — replaying writes across reloads is a conflict-resolution *product* policy; even cache persistence is per-entity and opt-in here (only `tagsCache`), and a template refuses to make product calls for you.
- **`pendingMs`-style pending timeout** — in-app navigations keep the current view with a global loading indicator and stale hits render the old value instantly, so pending is cold-start-only; a hanging loader keeps showing the skeleton rather than silently rendering a data-less view.
- **Nested / parallel routes** — the route is the page and the page is the state; a URL fragment that needs independent state is a component, not a route (see Design Philosophy).
- **SSR / streaming** — zero server runtime by design; bots get pre-rendered HTML from a headless-browser service and the app ships as plain static assets.

## Features

All examples below are taken from (or lightly adapted from) the actual source in `src/`.

### Flat, Config-Driven Routing

Routes are a plain module-level object: each route owns a `path`, a lazy `component`, and an optional async `data` loader that runs before the view renders.

```tsx
// src/views/index.tsx (excerpt)
import {View, HistoryRouter as Router, createRoutes} from '@native-router/react';

// createRoutes (satisfies semantics): the table is checked against Route
// while every path keeps its string-literal type — `as Route` would widen
// the paths to string and kill TypedLink's path union
const routes = createRoutes({
  component: () => import('./Layout'),
  children: [
    {
      path: '/',
      // search schema: parsed + coerced at resolve time; changing the search
      // re-runs `data` (the URL is the state). withCache shares the entity
      // cache with useQuery (fresh hit = zero requests, stale = old value
      // first + background revalidate); mockViewData wraps the outside so
      // only real data enters the cache.
      search: homeSearchSchema,
      data: mockViewData(
        withCache(
          homeCache,
          ({search}: {search: HomeSearch}): [HomeSearch] => [search],
          ({search, signal}: {search: HomeSearch; signal: AbortSignal}) =>
            articleService.query(search, signal)
        ),
        articlePageSchema,
        'articlePage'
      ),
      pendingComponent: HomeSkeleton, // cold start only — see Design Philosophy
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      component: () => import('./Article'),
      data: withCache(
        articleCache,
        ({params}: {params: {title?: string}}): [string] => [params.title!],
        ({params: {title}, signal}: {params: {title?: string}; signal: AbortSignal}) =>
          articleService.findByTitle(title!, signal)
      ),
      errorComponent: NotFound // article-level 404; others go to errorHandler
    },
    // ... /help, /about, /login, /register
    {path: '/editor', beforeLoad: requireLogin, component: () => import('./Editor')},
    {path: '/editor/:slug', beforeLoad: requireLogin, component: () => import('./Editor')}
  ]
});

export type AppPaths = RoutePaths<typeof routes>;

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

`PrefetchLink` prefetches the target route's data **and** view chunk on hover (or focus). The template's `PreviewLink` wraps the typed `TypedLink` (its `prefetch` prop passes through since `@native-router/react` 1.15 — declared, the link renders via `PrefetchLink` internally) and additionally renders a scaled-down live preview of the prefetched view:

```tsx
// src/components/PreviewLink.tsx
import {TypedLink, type TypedLinkProps} from '@native-router/react';
import {useControl, type Control} from 'react-use-control';
import type {AppPaths} from '@/views';

type Props = TypedLinkProps<AppPaths> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({children, visible: visibleControl, prefetch, ...props}: Props) {
  const [visible, setVisible] = useControl(visibleControl as Control<boolean>, false);
  return (
    // prefetch defaults to 'viewport' — data + chunk prefetch when the card
    // scrolls into view; the call site passes a literal pattern + params
    // (compile-time checked against the route table), not a runtime string
    <TypedLink<AppPaths> {...props} prefetch={prefetch ?? 'viewport'}>
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
    </TypedLink>
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

### A Project-Level Query Preset (`createQueryHook`)

Instead of adopting a data-fetching library, the template composes `react-toolroom/async` primitives (`useInjectable`, `useCache`, `useRun`, `useResultSelect`, `useLoading`, `useArgsStatus`, `useFocusRevalidate`, `useReconnectRevalidate`, `useRefresh`) into **one** project-owned factory — demonstrating the idea that each project should shape its own query layer. `createQueryHook(config)` closes every option at the **scenario declaration point** (once, immutable); the hook it returns takes only `args` at the call site — zero options, zero plumbing:

```ts
// src/util/useQuery.ts (signature)
export function createQueryHook<C extends QueryHookConfig>(
  config: C
): (args: SceneArgs<C>) => QueryResult<SceneData<C>>;
// SceneArgs: the queryFn's args (trailing optional signal stripped);
// SceneData: its return type, plus undefined unless initData was declared

type QueryHookConfig = {
  queryFn: QueryFn<any, any[]>;  // required — a bindQueryFn(fetch, cache) product
  staleTime?: number;            // defaults to 2000ms
  initData?: unknown;            // initial data; narrows data to non-nullable
  mock?: MockConfig;             // {schema, key} — hooks the DevTool mock panel
};

type QueryResult<T> = {
  data: T;
  loading: boolean;     // initial load only — true until the first result exists
  fetching: boolean;    // any request in flight (incl. background refetches)
  error: Error | undefined;
  failureCount: number; // per-args failures since the last success
  stale: boolean;
  dataUpdatedAt: number | undefined; // last successful settle for these args (TanStack's namesake)
  refetch: () => void | Promise<unknown>; // drops the cache entry for the current args and re-runs
};
```

Note what the config does **not** contain: `cache`. The fetch function and its cache are paired exactly once by `bindQueryFn(fetch, cache)` into a branded `QueryFn` — a plain service function lacks the phantom brand and cannot enter `createQueryHook` at compile time — and the loader, scenario-hook and mutation channels all resolve that one binding (no re-pairing at assembly points).

The caches are **per-entity** (`articleCache` / `homeCache` / `commentsCache` / `tagsCache`, declared via `createQueryCache(name, cacheTime?, {persist?})`): the value type and the key-tuple type are pinned on the cache itself, so `peek` results are narrowed without `as` casts and a wrong-shaped key is a compile error — the `'article'`-style magic string prefix disappears because identity *is* the cache binding. The hash normalizes two ways (signals stripped; object keys with `undefined` values dropped recursively), so `{tag: undefined}` and `{}` are one key — a loader key from a schema output and a view-side key from component state can never drift apart. `allCaches` registers every entity cache for logout-time clears and the DevTool panel; `tagsCache` additionally carries a localStorage mirror (hydrated on load, wiped on logout).

Out of the box the preset wires the behaviors projects usually hand-roll: concurrent same-args calls are **deduplicated at the provider level** — `useCache`'s miss/stale revalidation routes through the cache's `load` (an atomic get-or-insert of the in-flight slot), so every consumer *and every channel* (another component, a route loader — see below) asking for the same key while a request is pending shares that one promise; dependency changes **abort** the previous request via a trailing `AbortSignal` threaded through the service layer to `fetch` (`useRun({signal: true})`); cache/load/refetch keys are all one **structural hash** (`stableHash` with signals stripped — key-order-insensitive); and window focus / visibility regain and reconnects **revalidate in the background** (`useFocusRevalidate` / `useReconnectRevalidate`) — fresh entries hit the cache without a request, stale ones swap in silently.

Real declarations and call sites, from the tag sidebar and the comment list:

```tsx
// src/services/dataloaders.ts — the scenario declaration points
// (createDataLoader's triplet — loader / useData / queryFn — see the next section)
export const [, , queryTags] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
export const useTagsQuery = createQueryHook({
  queryFn: queryTags,
  initData: [],
  mock: {schema: tagListSchema, key: 'tagList'}
});
export const useCommentsQuery = createQueryHook({queryFn: queryComments, initData: []});

// src/views/Home/Tags.tsx — the call site carries zero options
const {data: tags, loading, error, stale} = useTagsQuery([]);

// src/views/Article/CommentList.tsx — initData: [] narrows data to Comment[]
const {data: comments, loading, error, dataUpdatedAt} = useCommentsQuery([title]);
```

#### When to Reach Past the Preset

The preset wires the behaviors most projects need (dedup, SWR, focus/reconnect revalidation, abort-on-change). `react-toolroom/async` ships more primitives that the preset deliberately does **not** re-export — when one of these fits, drop to the library hook directly on the same injectable/cache instead of growing the preset:

- **Polling** (`usePolling` — TanStack's `refetchInterval`): live dashboards. It skips ticks while a call is slow and pauses when the tab is hidden; pass `args` so the poller addresses the same cache key as your `useRun`.
- **Infinite lists** (`useInfinite` — TanStack's `useInfiniteQuery`): `fetchNextPage`/`fetchPreviousPage`, `maxPages` windowing. The About page's feed (`src/services/feed.ts`) is a working in-repo example — offset pagination aggregated into an endless list, the first page driven by `useRun` like any plain query, the next by an IntersectionObserver sentinel — and it deliberately opts out of the cache: what to cache and for how long belongs to scenarios that actually share data across pages, which is the point of per-scenario assembly over a one-size preset.
- **Retry observability** (`useRetry` + `useFailureCount`): the preset already reports per-args `failureCount` in its result; a scenario that wants automatic retries drops to `useRetry` and pairs it with `useFailureCount` for "retrying (2/3)…" UI.
- **Mutation serialization** (`useMutation` `scope`, react-toolroom 0.11): rapid-fire writes to the same entity — the template's favorite button queues per-slug (`scope: (slug) => \`favorite:${slug}\``), so a second click executes on the *settled* baseline instead of racing.
- **Lower-level stores** (`useResult`/`useLoading`/`useError` share one broadcast domain per injectable): siblings reading the same query sync for free; late mounters start from the last result with zero requests.

The rule of thumb: the preset is the default path; a library primitive beside it is an *addition*, not a fork — both talk to the same entity caches.

### Route Loaders Share the Entity Caches (`withCache`)

The two data channels — route `data` loaders and the scenario hooks (`createQueryHook` products) — deliberately share the **entity caches**. They differ in *when* they trigger and whether they block (loader: navigation resolve, `pendingComponent` skeleton; query: post-mount, loading/error states), but cache and invalidation are one. One declaration covers both channels: `createDataLoader({fetch, cache, keyOf, mock?})` (`src/util/dataLoader.ts`) returns a **triplet** `[loader, useData, queryFn]` — the loader goes on the route, `useData()` reads typed data in the view (the `useData<T>()!` assertion and generic annotations collapse into the factory; `{optional: true}` covers a shared component on a route that may carry no data, and dev builds verify the route actually declared this loader), and `queryFn` feeds `createQueryHook` for the component channel. `keyOf(ctx)` is the **single place** the entity's key is defined — the loader addresses `articleCache` as `[title]` / `homeCache` as `[search]`, and mutations address the same tuples through the cache binding, so views never hand-assemble keys at all (the old `homeCacheArgs` "payload must match the schema output shape" footgun is structurally gone — the hash drops `undefined` keys). All declarations live in `src/services/dataloaders.ts` — the application binding layer the route table and views consume.

Under the hood the loader is wrapped by `withCache(cache, keyOf, fn)` (`src/util/loaderCache.ts`) with SWR semantics — fresh hits return the cached value with zero requests, stale hits return the old value immediately and revalidate in the background, misses fall through to the skeleton/error paths. Combined with the router's view stack, a navigation lands in one of four states:

| Navigation lands on | Loader runs? | What the user sees |
| --- | --- | --- |
| viewStack snapshot (POP within the session window) | no — replay | instant previous view, **zero requests** |
| cache hit, fresh (< `staleTime` 2s) | yes — cache only | instant cached data, **zero requests** |
| cache hit, stale | yes — background revalidate | old value immediately, refreshed in place — no skeleton, no flash |
| cache miss | yes — network | `pendingComponent` skeleton (cold start) |

In-flight requests are shared across channels at the provider level: a `PrefetchLink` warm-up and the real navigation resolve to the *same* in-flight promise, so hovering a link first does not double-fetch. Idle entries are reclaimed per-entry (`cacheTime` ages from each entry's `lastUsedAt` — loader-written entries with no live consumers are reclaimed after the window too; no never-expire special cases).

Two session-level freshness edges are covered: on `logout()` the Layout also calls `invalidate(router)` (native-router ≥1.6) — view-stack snapshots of the previous account are dropped, so a later back POP re-resolves through guards and loaders instead of replaying the old account's views; and `pageshow` with `persisted: true` (bfcache restore — the SPA gets no navigation event) triggers `refresh(router)`: loaders re-run against the cache, fresh hits cost nothing, stale ones swap in silently.

### Composable Optimistic Mutations (`cache.mutation`)

Write-through favorite / follow used to be ~30 hand-rolled lines per call site (peek baseline → set → `refresh(router)` → success merge → failure rollback). Since react-toolroom 0.10, that pipeline is a **cache-bound declarative API** — the recipe lives in the service layer (`src/services/mutations.ts`), composed per cache projection:

```ts
// src/services/mutations.ts
// article layer: the single-entity primitive, reusable by any view / other layer
export const favoriteOnArticle = articleCache.mutation(
  (slug: string, on: boolean) => ({
    mutate: () => api.favoriteArticle(slug, on),
    key: [slug],
    update: (old) => ({...old, favorited: on,
      favoritesCount: old.favoritesCount + (on ? 1 : -1)}),
    // field-selecting merge: only the favorite fields are authoritative —
    // a `following` written while this was in flight survives the apply
    apply: (old, resp) => ({...old, favorited: resp.favorited,
      favoritesCount: resp.favoritesCount})
  })
);

// home layer: the feed projection, composed on top (key omitted = patch every
// settled entry; pages that don't contain the slug miss-bail and are skipped)
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on), // composition point
  update: (page, slug, on) => {
    const target = page.articles.find((x) => x.slug === slug);
    if (!target) return undefined;
    return patchArticleIn(page, slug, {...});
  },
  apply: (page, resp) => patchArticleIn(page, resp.slug, {...})
}));
```

The pipeline journals every write, and on failure rolls back with an identity guard — an entry is restored only if it still holds exactly the optimistic value, so a concurrent writer's newer state survives our rollback. Views reduce to a call plus error surfacing:

```tsx
// src/views/Home/index.tsx
const [favorite] = useMutation(favoriteOnHome, {
  // serialize rapid clicks on the same article; different articles don't block
  scope: (slug: string) => `favorite:${slug}`
});
const toast = useToast();
const toggleFavorite = (a: Article) => {
  if (!getCurrentUser()) return void navigate(router, '/login');
  // rollback is automatic; the toast is the only user-facing feedback left
  void favorite(a.slug, !a.favorited).catch((e) =>
    toast(e instanceof Error ? e.message : 'Favorite failed', {variant: 'danger'})
  );
};
```

Three properties fall out of the composition for free:

- **Multi-projection consistency** — favoriting from `Home` writes both the `articleCache` entry and every `homeCache` page containing the slug in one call; the "back to the list shows the stale count" gap is gone.
- **Refresh is automatic** — `withCache` subscribes each cache's `set` events on first loader run and refreshes the router when an already-seen key's value reference changes (microtask-debounced). Write-through, rollback, `patchWhere` batches and background revalidation settles all flow through it; views contain zero `refresh` calls. The reference-change check doubles as a structural-sharing substitute: a revalidation that settles with the same reference triggers nothing.
- **Failure isolation** — each layer miss-bails independently (nothing is fabricated for absent entries, so an optimistic write can never resurrect an entry a logout just cleared), and a rejection unwinds every composed layer.

Comment posting stays with declarative invalidation, pinned to the exact key: `useMutation(articleService.addComment, {invalidates: [[commentsCache, article.slug]]})` clears only the current article's comment entry (other articles' caches survive, and a mounted `CommentList` refetches passively via the provider's delete event — the list shape after an append is not locally computable, a hard refetch is the right tool). `Editor` saving invalidates wholesale (`invalidates: [homeCache, articleCache]`) — two deliberate granularities: a comment write maps 1:1 to the `[slug]` key, while the home projection's keys are full search combinations that an edit cannot enumerate at the write point.

### A Typed HTTP Client on `fetch-fun`

`src/util/http.ts` builds a pipeable client: base URL (`VITE_API_URL` override, default `https://api.realworld.io/api/`), JSON headers, a per-attempt 10s timeout (inner of retry, so every retry gets a fresh budget), retry ×2 (idempotent methods + transient statuses only, library defaults for backoff/`Retry-After`), a whole-request 30s `totalTimeout` budget that bounds all retries + backoff as one unit, auth injection, and an error mapper. Errors stay `fetch-fun`'s `HTTPError` — identity preserved via `withMessage`, so `instanceof HTTPError`, `.status` and `.data` (the field-structured `errors` object) all keep working downstream; `message` is rewritten for readability (the API's `message` first, otherwise the `errors` object joined into text). A 401 fires the registered unauthorized handler (the auth service uses it to auto-logout on expired tokens):

```ts
// src/util/http.ts (excerpt)
const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  .pipe(ff.use, ff.withTimeout(10_000)) // per-attempt budget, inner of retry
  .pipe(ff.use, ff.withRetry(2))        // idempotent methods + transient statuses only
  .pipe(ff.totalTimeout, 30_000)        // whole-request budget: retries + backoff bounded
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token')) // empty creds → no header
  .pipe(ff.mapError, (e) => {
    if (!(e instanceof ff.HTTPError)) return e;
    if (e.status === 401 && tokenGetter()) fireUnauthorized();
    return e.withMessage(errorText(e.data) || e.message);
  });
```

In dev builds a `withLogging` middleware is appended that pushes every Request/Response/Error event into a ring buffer (`src/util/requestLog.ts`) — the DevTool panel renders it as a request log (see below). `import.meta.env.DEV` folds the branch out of production builds.

Services are thin functions over `get`/`post`/`put`/`del`:

```ts
// src/services/article.ts
export function fetchTags(): Promise<string[]> {
  return http.get<{tags: string[]}>('tags').then(({tags}) => tags);
}
```

### Dev-Only Runtime Response Validation

Types claim a shape; the wire can disagree. In dev builds, every service call also carries the JSON Schema generated from the same domain types (the same module the mock pipeline uses — one contract, three consumers: types, mocks, validation). A 2xx body that violates it rejects with `fetch-fun`'s `ValidationError`, whose message locates the drift in one line — which request, which JSON pointer, what was expected, what arrived:

```text
GET articles: 响应失配于 /articles/0/title — must be string（实际值: 42）
```

```ts
// src/util/http.ts (excerpt) — init.schema is the opt-in hook
function responseSchema(schema: unknown, label: string): ff.StandardSchema {
  return {
    '~standard': {
      version: 1,
      vendor: 'painless/json-schema',
      validate: async (value) => {
        const {check} = await import('./validate'); // ajv, dynamic
        return check(schema, value, label);
      }
    }
  };
}

// src/services/article.ts (excerpt) — schemas fold away in production
const schemas = import.meta.env.DEV
  ? {list: articlePageSchema, article: envelope('article', articleSchema), /* … */}
  : undefined;

export function query(params?: ArticleQuery, signal?: AbortSignal) {
  return http.get<ArticlePage>('articles', params, {signal, schema: schemas?.list});
}
```

Non-2xx responses skip validation (`HTTPError` semantics untouched). Mock-sizing annotations (`@minItems`/`@maxItems`/`@unique`/`@faker` — "10 per page" is a generation directive, and a real last page can be shorter) are stripped before checking. Production pays nothing: `import.meta.env.DEV` folds the branch, `ajv` is a devDependency loaded via dynamic import inside it — verified absent from built chunks (same treatment as the faker stack).

The mock pipeline gets the same check (`mock.ts` validates `always`-mode output against the same schema) but downgrades failure to a located `console.error` instead of throwing — known `json-schema-faker` 0.6 quirks (deep `$ref` nesting drops `@faker` annotations, e.g. `articles[].author.image` comes out `null`) shouldn't brick DevTool's mock mode; see `docs/decisions.md` §7.

### OpenAPI-Typed Client (Demo)

When the backend publishes an OpenAPI spec, `openapi-typescript` (devDependency, zero runtime) turns it into pure types and a thin graft constrains the whole `fetch-fun` pipe at compile time — path, method, request body, and 2xx response. `src/services/article.openapi.ts` is a working demo against the official RealWorld spec (committed at `openapi/realworld.yml`; regenerate types with `npm run openapi`):

```ts
// src/services/article.openapi.ts (excerpt) — full compile-time constraints
export function findBySlug(slug: string, signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedPath, '/articles/{slug}', {slug}) // must be a real spec path + params
      .pipe(typedMethod, 'get')                    // must exist under that path
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'get')                      // response typed by the spec
  );
}
```

Typos fail loudly: `'/article'` is not a key of `paths`; `'post'` doesn't exist under `/tags`; `{nome: 'Ada'}` doesn't satisfy `NewArticleRequest`; a `'post'` reader after a `'get'` method is a type error. The demo coexists with the handwritten `services/article.ts` (they differ on purpose: the handwritten one unwraps `{article}` → `Article`, the demo returns the spec's raw response shape). It's referenced by no view, so it never enters a production chunk. Boundaries and known spec-vs-handwritten drift are recorded in `docs/decisions.md` §6.

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

Both register with the **DevTool** panel (dev-only), where each dataset can be switched between `empty` (mock only when the API errors or returns nothing) and `always`. Mode switches and the panel's Refresh button clear all per-entity caches (`clearAllCaches` walks the `allCaches` registry) — mocks take precedence over cache: they must bypass the loader's fresh `withCache` hits, or the mock would never take effect (dev-only; production has no mock callers).

The panel also hosts two more dev inspectors:

- **Cache view** — `allCaches` snapshots with per-entry age, in-flight badges and a set/delete event stream, plus a Clear button (this is the closest thing to TanStack Query DevTools this stack needs, at ~0 runtime cost).
- **Request log** — the dev-only `withLogging` middleware in `src/util/http.ts` pushes every Request/Response/Error event into a ring buffer (`src/util/requestLog.ts`); the panel renders them newest-first with status coloring, so "did this interaction hit the network?" is one glance away.

### Dark Mode via a Root Theme Control

`src/index.tsx` creates a single `useControl` boolean at the app root — seeded from `prefers-color-scheme`, then user-owned — and drives `lightTheme`/`darkTheme` (haze-ui's `--haze-*` CSS variable classes) off it. The control travels to the nav bar's `ThemeToggle` via a plain context (`src/util/theme.tsx`); the toggle itself is a haze-ui `Switch` whose `checked` prop natively accepts a `Control<boolean>` — no `value`/`onChange` plumbing. This is also the canonical example of *sharing* a control across distant components: the root creates it once, everyone else reuses the same token.

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

### Error Reporting Extension Points

The template ships no error-reporting SDK — reporting is a product decision it refuses to make for you. What it does ship is three mounting points, one per layer, each seeing a different slice of failures:

- **HTTP layer** (`src/util/http.ts`) — every request from every channel (route loaders, `useQuery`, mutations) funnels through the one fetch-fun pipeline, and its final `mapError` stage is where a reporter belongs: capture, then return the error unchanged so `instanceof HTTPError`, `.status` and `.data` keep working downstream. Richest signal per failure (status, parsed error body, request context) — but request failures only, and filter the noise: a request aborted because a newer navigation superseded it (`AbortSignal` threading) is routine, not an error.
- **Router layer** (`src/views/index.tsx`) — navigation-time failures split by segment: `params`/`search` parse failures, and any route without its own fallback, land in the global `errorHandler` (renders `RouterError`); a route's `errorComponent` (e.g. `NotFound` on `/article/:title`) covers only that route's `data` failures. The division of labor: `errorComponent` is presentation — the page decides what "article not found" looks like — while `errorHandler` is the single choke point that sees every other loader failure, and the natural place to report them.
- **Render layer** (`src/index.tsx`) — the router catches resolve failures; an error thrown while a view *renders*, or from an event handler, is outside its pipeline. The template deliberately mounts no root `ErrorBoundary` yet — the natural spot is `Root` in `src/index.tsx`, wrapping `<App />` as the last-resort boundary, paired with a crash fallback UI instead of a white screen.

Wiring one up (Sentry pseudo-code — the template carries no such dependency):

```tsx
// ① HTTP layer — src/util/http.ts, at the mapError exit: report, return as-is
.pipe(ff.mapError, (e) => {
  if (!isAbort(e)) Sentry.captureException(e); // superseded-request aborts aren't errors
  return e;
})
// ② Router layer — src/views/index.tsx, global errorHandler (errorComponent only renders)
errorHandler={(e) => {
  Sentry.captureException(e);
  return <RouterError error={e} />;
}}
// ③ Render layer — src/index.tsx root ErrorBoundary (not mounted yet; wraps <App />)
<ErrorBoundary onError={(e) => Sentry.captureException(e)} fallback={<Crash />}>
  <App />
</ErrorBoundary>
```

The layers overlap by design — a loader's 500 already passed through the HTTP layer — so mount where your product needs signal and let the SDK dedupe (Sentry-class SDKs fingerprint repeats).

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
| `pnpm openapi` | Regenerate `src/types/openapi.d.ts` from `openapi/realworld.yml` |
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
