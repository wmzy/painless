# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Painless is a lightweight React SPA template/demo (RealWorld conduit app) that emphasizes zero SSR, zero-runtime CSS (Linaria), and type-safe TypeScript. It fetches data from `https://api.realworld.io/api/`. Private package, not published to npm.

## Design Principles

These are intentional design decisions, not missing features. Do not suggest adding SSR, server actions, nested routes, state management libraries, structural sharing in the query layer, or platform-specific optimizations.

- **Pure client-side SPA** — No SSR/SSG. SEO can be handled by serving pre-rendered HTML to bot traffic via headless browser, not by contaminating the app architecture.
- **Frontend is not the backend** — API Routes/Server Actions belong in dedicated backend frameworks. The web frontend is one of many clients; coupling it with the backend serves only one client.
- **Flat routing** — The route is the page. Nested/parallel routes decompose page state into URL fragments, adding unnecessary complexity. Independent UI sections are components, not routes.
- **No state management libraries** — Proper page/component decomposition keeps state local. Use React primitives (`useState`, `useContext`, `useRef`) and `useControl` from haze-ui for controlled/uncontrolled component state.
- **No structural sharing in the query layer** — Refetches settle new references; content-identical background revalidations re-render subscribers. Deep equality is O(payload) on every fetch; a hot component takes scalar props behind `React.memo` instead (object props are always new references after settle, so memo boundaries must compare scalars).
- **No built-in image optimization** — Image optimization is a service concern, not a framework concern. A dedicated service serves all clients, not just the frontend.
- **Platform-agnostic deployment** — Produces standard static assets. No vendor lock-in to any deployment platform.

## Commands

- `pnpm start` — dev server (Vite)
- `pnpm build` — production build
- `pnpm serve` — preview the production build (`vite preview`)
- `pnpm lint` — ESLint with auto-fix
- `pnpm lint:ci` — ESLint without auto-fix (what CI runs)
- `pnpm test` — Vitest watch mode
- `pnpm test:run` — single test run (CI mode)
- `pnpm test:run -- path/to/file.test.ts` — run a single test file
- `pnpm test:ui` — Vitest UI
- `pnpm coverage` — tests with coverage
- `pnpm deploy` — build demo (`BUILD_DEMO=true`) and publish to GitHub Pages
- `pnpm commit` — lint-staged, then interactive commitizen prompt

CI (`.github/workflows/ci.yml`) runs `lint:ci` → `test:run` → `build` on push/PR to `main`.

## Architecture

**Routing:** `@native-router/react` 1.4.x with `HistoryRouter` defined in `src/views/index.tsx`. Routes are a module-level object declared via `createRoutes({...})` — satisfies semantics: checked against `Route` while every `path` keeps its string-literal type (`as Route` widens paths to `string`) — with lazy `import()` views, inline async `data` loaders, route guards (`beforeLoad`/`redirect`), and optional route-level `search` schemas (Standard Schema — see `src/types/search.ts`; the parsed/coerced search reaches the loader as `ctx.search` and components via `useSearch(schema)`). `export type AppPaths = RoutePaths<typeof routes>` extracts the path-pattern union for `TypedLink<AppPaths>` (compile-time path checking; parameterized patterns additionally require `params` — used by RouterError, Article/NotFound, Login, Register; `PreviewLink` stays on `PrefetchLink` because `TypedLinkProps` doesn't pass `prefetch` through and its `/article/${slug}` target is a runtime path). Search *writes* go through `useSetSearch(homeSearchWriteSchema)` (Home pagination/tag, Tags): the input is given in the URL-side string form, coerced by the shared `parseHomeSearch` core, and default-equal fields (offset 0 / limit 10) are stripped so URLs stay clean — read and write share the one contract. Since 1.4 a route-level render error boundary catches component-subtree throws and renders the route's `errorComponent` with `ctx.phase === 'render'` (resolve-phase failures carry no `phase`); without a route `errorComponent` the error reaches the global `errorHandler`. The `errorHandler` prop renders `RouterError` for generic route failures (works from cold start since 1.2.1); `/article/:title` additionally declares a route-level `errorComponent` (`src/views/Article/NotFound.tsx`) that renders "Article not found" vs "Failed to load: message" (duck-typed `status === 404`) with a back-to-home link. `ScrollRestoration` is mounted in `Layout` — back/forward restores scroll position. Home article cards use `PrefetchLink` with `prefetch='viewport'` (via `PreviewLink`) — data + chunk prefetch when the card scrolls into view, hover preview stays intact.

**In-app navigation keeps the old view by design (do not "fix" this):** native-router maps the browser's native navigation semantics — while a navigation chain is in flight, the old view stays rendered (old document stays visible until the new one commits) with only the global `Loading` bar as the tab-spinner equivalent. The URL is pushed only *after* the chain settles (`history.push` follows commit), so a superseded/cancelled navigation leaves the user on the old view with an untouched URL — same as stop/ESC in a browser. Failures render `errorComponent`/`errorHandler` (the error-page equivalent), never a loading page: browsers have **no** UI-level load timeout that swaps to a skeleton — timeouts surface as error pages from network-layer failure only. Do not add TanStack-style `pendingMs`/in-app `pendingComponent` upgrades here: that is an app-convention (YouTube-style placeholder), not native semantics, and it was deliberately rejected in the 2026-08 review (also error-prone upstream — TanStack issues #1349/#1646/#2722). `pendingComponent` remains cold-start/refresh only (no old view to keep).

**Login guard:** `/editor` and `/editor/:slug` declare `beforeLoad: requireLogin` (`@native-router` ≥1.2 route guards) — it returns `'/login'` when `getCurrentUser()` is null, and the router redirects during resolve (before the navigation commits, so the URL never lands on the guarded route). `preload`/`PrefetchLink` run the same guard, so prefetching a guarded route while logged out just resolves the redirect target — no side effects.

**Auth chain:** `src/services/auth.ts` persists the user in `localStorage['painless.user']`, restores it at module load, and registers a token supplier with the HTTP layer (`http.setTokenGetter(() => currentUser?.token)`). The dependency direction is strictly auth → http; http cannot import auth (circular), hence the registration hook. It also registers `http.setUnauthorizedHandler` — any 401 response fires it, and it calls `logout()` only when currently logged in (a failed login attempt's 401 is a no-op). `logout()` clears the shared `queryCache` (`@/util/useQuery`) *before* `setUser(null)`: the `change` event may trigger new requests (e.g. Layout navigation), and clearing first guarantees they start from an empty, account-free cache. `src/index.tsx` side-effect imports `@/services/auth` before rendering so the very first route-`data` request after a cold refresh carries `Authorization`. Login/logout swap the module variable and emit `change` events; `Layout` subscribes via `onAuthChange` to switch the nav.

**HTTP:** All API calls go through `src/util/http.ts`, built on [`fetch-fun`](../fetch-fun) (^0.9.0, pipeable fetch toolkit). Pipeline: `baseUrl` (`VITE_API_URL` override, default `https://api.realworld.io/api/`) → JSON headers → `withTimeout(10_000)` (per-attempt budget — declared `inner of retry`, so every retry gets a fresh timeout) → `withRetry(2)` (library defaults: idempotent methods only, transient statuses 408/425/429/5xx, exponential backoff 1s→10s, respects `Retry-After`) → `withAuth` with `Token` prefix (supplier re-evaluated per attempt; empty credentials skip the `Authorization` header entirely) → `mapError`. Errors: non-2xx responses are mapped to `ApiError` (`readonly status: number; readonly errors: Record<string, string[]>`; `message` keeps the readable flattening — prefer body `message`, else join the `errors` object — so existing `e.message` consumers keep working). When `status === 401` the registered unauthorized handler (`setUnauthorizedHandler`) is fired fire-and-forget (its exceptions are swallowed) and the error still propagates. Exports `fetchJSON`/`get`/`post`/`put`/`del` (+ optional trailing `AbortSignal` on `get`/`fetchJSON`, threaded to fetch by `useQuery`'s `useRun({signal: true})`).

**Async data:** Components do not call the react-toolroom hooks directly — `src/util/useQuery.ts` is the project-level preset that composes `useInjectable`/`useCache`/`useRun`/`useResult`/`useLoading`/`useInitialLoading`/`useError`/`useRetry`/`useFocusRevalidate` into one hook: `useQuery(fn, args?, opts?) → {data, loading, fetching, error, stale, refetch}`. Semantics: `loading` is *initial* loading only (`useInitialLoading` — true until the first result exists, matching TanStack Query's `isLoading`; a post-comment invalidation refetch keeps `loading` false so rendered lists never flash back to a spinner), while `fetching` is any in-flight call. The run is wired as `useRun(injectable, args, {signal: true, hash: hashArgs})`: dependency changes/unmount abort the previous call via a trailing `AbortSignal` (threaded through the service layer to fetch). Concurrent same-args calls are deduplicated at the *provider* level: since react-toolroom 0.8, `useCache`'s miss/stale revalidation routes through `queryCache.load` (atomic get-or-insert of the in-flight slot), so every consumer — and every channel, including route loaders via `withCache` — shares one in-flight promise per key and the underlying `fn` runs once; the old `useDedup` wrapper is gone (redundant with a load-capable provider). Note `refetch` deletes the cache entry first, which also tears down the in-flight registration — rapid re-clicks each restart the request (dedup applies within one in-flight lifetime). `hashArgs = stableHash(args minus AbortSignals)` — structural (key-order-insensitive) and signal-stripped, so all channels agree on one key form. `useFocusRevalidate(injectable, {args})` re-runs on window focus/visibility for bfcache/snapshot-restored freshness (fresh entries hit the cache without a request), and `useReconnectRevalidate` does the same on window `online` (network recovery) with the identical miss/stale gate. Defaults: module-level shared `queryCache` (`cacheTime` 10000ms) and `staleTime` 2000ms; `opts.retry` (`{retries?, backoff?}`, default disabled) feeds `useRetry`. `refetch` deletes the cache entry for the current `args` and re-runs (cache bypass), and its identity follows `args`. Invalidation is cache-addressed since 0.7: `useMutation({invalidates: [[queryCache, ...prefix]]})` / `invalidate()` target the module-level `queryCache` (via `deletePrefix`/`deleteWhere`), so consumers don't need a shared injectable. `opts.mock` wires the DevTool panel via `useMock` — the mock middleware must register *inside* the cache layer, which is why it is an option instead of caller-side composition; the mock config must stay constant per call site. Route-level data (Home, Article) instead uses `mockViewData` + `useData()` (cast, e.g. `useData() as ArticlePage` — typed `useData<T>()` awaits a future native-router release).

**Loader ↔ query shared cache (`withCache`):** route `data` loaders and `useQuery` deliberately share the one module-level `queryCache` — the two channels differ in *when* they trigger and whether they block (loader: navigation resolve, `pendingComponent` skeleton; query: post-mount, loading/error states), but cache and invalidation are one. `withCache(fn, prefix)` (`src/util/loaderCache.ts`) wraps a loader and addresses the cache as `[...prefix, ctx.search ?? ctx.params ?? {}]` with SWR semantics: fresh hit → cached value, zero requests; stale hit → old value immediately + background revalidation via `queryCache.load` (in-flight shared with any channel; generation counter keeps late responses from clobbering mid-flight writes), then `refresh(router)` on success only — failures abort silently keeping the old value; miss → `load` promise with the route skeleton/error paths intact. Views compute the identical key via `homeCacheArgs(search)` / `articleCacheArgs(title)` — Home's payload must match `homeSearchSchema`'s output *shape* (no `tag` key when absent: `stableHash` treats `{tag: undefined}` and `{}` as different keys), which is what makes mutation write-through (below) address the loader's entry. Division of labor: the router viewStack decides *whether* the loader runs at all (POP within the session window replays the snapshot with zero requests); the cache decides *whether a running loader hits the network*. Two session-level freshness edges: `logout()` calls `invalidate(router)` (native-router ≥1.6) so viewStack snapshots of the old account are dropped — a later back POP re-resolves through guards + loaders instead of replaying the previous account's views; and `pageshow` with `persisted: true` (bfcache restore, no SPA event fires) triggers `refresh(router)` — loaders re-run against the cache, fresh hits cost nothing, stale ones swap in silently.

**Optimistic mutations (write-through):** favorite (Home/Article) and follow (Article) no longer keep local override state — they write through the shared cache. `applyCache(next)` does `queryCache.set(key, next); void refresh(router)`: the loader re-run is a fresh cache hit, so the view updates with zero requests and no skeleton (the hand-rolled `useState` override era ended with the shared cache; a write-through also survives back-navigation hits, and the provider's generation counter protects the written value from being clobbered by responses that were already in flight). Pattern per click: capture the click-time `snapshot`, apply the optimistic `next`, on success apply the server's authoritative response, on failure roll back to `snapshot` (the request failed, so the server state is unchanged). Article replaces the whole entry (`articleCacheArgs(params.title)`); Home patches the page entry (`homeCacheArgs({tag, offset, limit})` — must equal `homeSearchSchema`'s output shape) by swapping one article inside the cached list, and bails out when there is no cache entry to patch (post-`clear` views; the next navigation re-fetches). A follow success merges with `queryCache.peek(key)`'s *current* value instead of the closure snapshot, so a favorite written while the follow was in flight survives the merge.

**Comment refresh:** posting a comment goes through `useMutation(articleService.addComment, {invalidates: [[queryCache, article.slug]]})` — since react-toolroom 0.7, invalidation targets the module-level `queryCache` by args prefix (`deletePrefix`), so no shared injectable is needed. On success the mutation deletes the `[queryCache, slug]` prefix entries and re-pulls active subscribers (passive revalidation via the provider's delete events), so `CommentList` refreshes declaratively. The form side just calls `reset(commentForm, {body: ''})` — the comment `Textarea` is bound through `FormItem`'s control (see the Textarea note below), so the reset syncs the displayed text; `CommentList` itself has no refresh prop.

**Editor form pitfalls:** `initialValues` must be given in full for *both* create and edit modes (the create mode seeds `{title: '', description: '', body: '', tagList: []}` — `FormItem`'s control reads `getValueByPath`, and a missing `tagList` crashes `TagInput`). Since react-f0rm 0.5, `setInitialValues` compares by content — an inline object passed to `useForm({initialValues})` alone is fine (no `useMemo`, and `<Form>` ignores `initialValues` when a `form` prop is present). Fields are bound via `FormItem` (haze-ui/form) render-prop: the `control` handle goes straight into the control's `value` prop (writes dispatch through `setValueByPath`, no `eventToValue` adapter needed — that was a `Field`-era workaround for `TagInput`'s non-DOM `onChange`). `useIsSubmitting` drives the `Publishing...`/`Updating...` label.

**Textarea/Input `value` semantics depend on what you pass:** a plain string only *seeds* haze-ui's `useControl` internal state — later prop changes do NOT update the displayed text. A `Control` (e.g. `useFormControl(form, name)` or `FormItem`'s binding) makes the field fully controlled: the handle re-reads the form value every render (`useValueByPath` subscription), so external writes like `reset(form, {...})` sync the displayed text — no subtree remounting needed. Editor fields and the Article comment box use the `FormItem` bridge; see the comment-refresh mechanism above.

**Forms:** `react-f0rm` 0.5.x — `onSubmit` / `onValidSubmit` both fire only after validation passes and both are awaited (`void | Promise<void>`), so `isSubmitting` spans the entire async submission; the project uniformly uses `onSubmit`. All forms — Editor, Article comment, Login, Register — bind fields through the same `FormItem` (haze-ui/form) render-prop, which renders the first field error as a `<span role='alert'>` under the field (`Field` + `FieldError` are gone). Shared validators live in `src/util/validators.ts` (`required`/`email`/`minLength` factories + `compose`); its `applyApiFieldErrors(form, e, fields)` maps `ApiError.errors` onto fields via react-f0rm's `setError` (note: the lower-level `setErrorByPath` takes an internal `Path` object, not a field-name string — `setError` is the public field-name wrapper) and hides the top-level Alert when every server error landed on a field; unmappable keys stay in the Alert as fallback.

**Layout:** `src/views/Layout/index.tsx` is the app shell (header, nav, `<View />` outlet) with auth-driven nav.

**CSS:** Linaria (`@linaria/core`) — zero-runtime CSS-in-JS extracted at build time via `@wyw-in-js/vite`. Styles are defined with `css` tagged template literals.

**Types → JSON Schema:** `src/types/base.ts` types carry JSON Schema annotations as JSDoc tags (`@faker`, `@minimum`, `@unique`, ...). The `rollup-plugin-type-as-json-schema` plugin converts them to `.schema` files (imported from `@/types/index.schema`), which `src/util/faker.ts` uses with `json-schema-faker` + `@faker-js/faker` for dev-mode mock data. Note: `json-schema-faker` 0.6 requires the faker instance via `options.extensions` (`generate(schema, {extensions: {faker}})`) or `@faker` annotations are silently ignored.

**DevTool:** dev-only, loaded via `React.lazy(() => import('./components/DevTool'))` behind `import.meta.env.DEV` in `src/index.tsx` — the UI (and everything it pulls in) is tree-shaken out of production builds. The mock *core* lives in `src/util/mock.ts` (no static faker dependency): config state + `getMockConfig(s)`/`setMockConfig`/`onMockConfigChange` + `mockViewData` + `useMock`; production bypasses entirely (`mockViewData` returns the original fn, `useMock` registers nothing) and faker generation uses branch-local `await import('./faker')`, so the faker/json-schema-faker chain never enters the main chunk. `setMockConfig` also clears the shared `queryCache` — mocks take precedence over the loader's fresh `withCache` hits (a mode switch or panel Refresh must bypass the cache, dev-only). The panel (`src/components/DevTool.tsx`) lists each registered dataset with `empty` (mock only when the API errors or returns nothing) / `always` / `disabled` modes, and includes a **queryCache inspector** (`CacheView`): entry count, hashed key, age in seconds via `queryCache.snapshot()` (entries with an in-flight revalidation carry a `⏳ in-flight` badge — the three-state stale+refetching case shows both), refreshed on `subscribe()` events, a recent-event list (last set/delete/clear changes), plus a Clear button (`queryCache.clear()`).

**Testing:** Vitest + Testing Library. Component tests (`Home`, `Editor`, `Article`, `Layout`, `PreviewLink`, `Loading`, `RouterError`, `NotFound`, `DevTool`) mock the *service layer*, not the network, so real view logic is exercised; unit tests cover `useQuery`, `loaderCache`, `http`, `faker`, `auth`, and `article`; form tests (`Login/form.test.tsx`, `Register/form.test.tsx`) cover validator wiring and server-error field backfill. Home/Article tests model the write-through chain by mocking `refresh` as a re-render broadcast and reading `useData` straight from `queryCache`.

## JSX Extensions

Babel plugins `transform-jsx-condition` and `transform-jsx-class` enable extended JSX syntax:
- `x-if`, `x-elseif`, `x-else` — conditional rendering as JSX attributes
- `x-class` — conditional className merging

These are allowed by ESLint (no `react/no-unknown-property` rule).

## Path Aliases

`@/` maps to `src/` (configured in both `vite.config.mts` and `tsconfig.json`).

## Key Libraries

| Library | Purpose |
|---------|---------|
| `@native-router/react` | Client-side routing: `HistoryRouter`, `View`, `useData` (generic), `useMatched`, `useRouter`, `useSearch` (Standard Schema), `useSetSearch` (schema-aware write), `TypedLink` + `createRoutes` + `RoutePaths` (typed links), `ScrollRestoration`, `PrefetchLink`, `usePrefetch`, `errorHandler`; `@native-router/core` (≥1.6) exports `navigate`, `refresh`, `invalidate` (drops viewStack snapshots) |
| `react-toolroom/async` | Async data primitives: `useInjectable`, `useInject`, `useCache` (revalidates via `provider.load`), `useRun` (+`{signal, hash}`), `useResult`, `useLoading`, `useInitialLoading`, `useError`, `useFocusRevalidate`, `useReconnectRevalidate`, `useRetry`, `useInfinite` (0.9: bidirectional pages/pageParams/maxPages), `stableHash`, `useMutation` + `invalidates`, `invalidate`, `createMemoryCacheProvider` (also `load`/`peek`/`snapshot`/`subscribe`/`clear`) |
| `fetch-fun` | Pipeable functional fetch toolkit (^0.9.0) — basis of `src/util/http.ts` |
| `react-f0rm` | Event-driven forms: `Form`, `useForm`, `useIsSubmitting`, `setServerErrors`, `reset` |
| `haze-ui` | Component library (Card, Input, Textarea, TagInput, Chip, ...), re-exports `useControl`; `haze-ui/form` subpath: `FormItem` / `useFormControl` (react-f0rm ↔ react-use-control bridge) |
| `react-use-control` | Controlled/uncontrolled state — `useControl(prop, default)` |
| `@linaria/core` | Zero-runtime CSS-in-JS |
| `@for-fun/event-emitter` | Tiny emitter — auth change events, DevTool mock-config changes |
| `json-schema-faker` + `@faker-js/faker` | Mock data from JSON Schema |
| `rollup-plugin-type-as-json-schema` | Build-time TS types → `.schema` JSON |
| `qss` | Query string encode/decode (Home tag/pagination state) |
| `ramda` | FP utilities (used in faker.ts) |
| `date-fns` | Registers the `date-string` format with json-schema-faker |

## Component State Pattern: `useControl`

Use `useControl` for component-internal state that may need external control. Do NOT use it to wrap state already managed by another library (e.g., react-f0rm).

```tsx
// Good — component state that could be externally controlled
function DevTool() {
  const [open, setOpen] = useControl(false);
  // ...
}

// Bad — form state is already managed by react-f0rm
function FormField() {
  const {value, onChange} = useField({name: 'email'});
  const [controlled] = useControl(value, ''); // redundant!
  // ...
}
```

**Rule of thumb:** If a library already owns the state (react-f0rm for forms, react-toolroom for async data), pass it through directly. `useControl` is for component-internal state that benefits from the controlled/uncontrolled pattern.

## Code Style

- Prettier config from `tools-config/prettier` (single quotes, jsx single quotes, es5 trailing commas)
- 2-space indentation, LF line endings
- ESLint extends `tools-config/eslint` with TypeScript strict+stylistic type-checked rules, react, react-hooks, import-x, and prettier
- TypeScript extends `tools-config/typescript` (strict, `noUncheckedIndexedAccess`, bundler module resolution)
- `eslint-plugin-compat` for browser compatibility checks (`.browserslistrc`)
- Shared tool configs come from the `tools-config` npm package (source lives in `../tools-config/`)
