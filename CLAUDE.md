# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Painless is a lightweight React SPA template/demo (RealWorld conduit app) that emphasizes zero SSR, zero-runtime CSS (Linaria), and type-safe TypeScript. It fetches data from `https://api.realworld.io/api/`. Private package, not published to npm.

## Design Principles

These are intentional design decisions, not missing features. Do not suggest adding SSR, server actions, nested routes, state management libraries, or platform-specific optimizations.

- **Pure client-side SPA** — No SSR/SSG. SEO can be handled by serving pre-rendered HTML to bot traffic via headless browser, not by contaminating the app architecture.
- **Frontend is not the backend** — API Routes/Server Actions belong in dedicated backend frameworks. The web frontend is one of many clients; coupling it with the backend serves only one client.
- **Flat routing** — The route is the page. Nested/parallel routes decompose page state into URL fragments, adding unnecessary complexity. Independent UI sections are components, not routes.
- **No state management libraries** — Proper page/component decomposition keeps state local. Use React primitives (`useState`, `useContext`, `useRef`) and `useControl` from haze-ui for controlled/uncontrolled component state.
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

**Routing:** `@native-router/react` 1.2.x with `HistoryRouter` defined in `src/views/index.tsx`. Routes are a module-level object (`{component, children} as Route`) with lazy `import()` views, inline async `data` loaders, route guards (`beforeLoad`/`redirect`), and optional route-level `search` schemas (Standard Schema — see `src/types/search.ts`; the parsed/coerced search reaches the loader as `ctx.search` and components via `useSearch(schema)`). The `errorHandler` prop renders `RouterError` for generic route failures (works from cold start since 1.2.1). `ScrollRestoration` is mounted in `Layout` — back/forward restores scroll position.

**Login guard:** `/editor` and `/editor/:slug` declare `beforeLoad: requireLogin` (`@native-router` ≥1.2 route guards) — it returns `'/login'` when `getCurrentUser()` is null, and the router redirects during resolve (before the navigation commits, so the URL never lands on the guarded route). `preload`/`PrefetchLink` run the same guard, so prefetching a guarded route while logged out just resolves the redirect target — no side effects.

**Auth chain:** `src/services/auth.ts` persists the user in `localStorage['painless.user']`, restores it at module load, and registers a token supplier with the HTTP layer (`http.setTokenGetter(() => currentUser?.token)`). The dependency direction is strictly auth → http; http cannot import auth (circular), hence the registration hook. `src/index.tsx` side-effect imports `@/services/auth` before rendering so the very first route-`data` request after a cold refresh carries `Authorization`. Login/logout swap the module variable and emit `change` events; `Layout` subscribes via `onAuthChange` to switch the nav.

**HTTP:** All API calls go through `src/util/http.ts`, built on [`fetch-fun`](../fetch-fun) (local `file:` dependency, pipeable fetch toolkit). Pipeline: `baseUrl` (`VITE_API_URL` override, default `https://api.realworld.io/api/`) → JSON headers → `withAuth` with `Token` prefix (re-evaluated per request via the registered getter) → `stripEmptyAuth` (never send an empty `Authorization`) → `mapError` (flatten error bodies: prefer `message`, else join the `errors` object into readable text; callers read `e.message`). Exports `fetchJSON`/`get`/`post`/`put`/`del`.

**Async data:** Components do not call the react-toolroom hooks directly — `src/util/useQuery.ts` is the project-level preset that composes `useInjectable`/`useCache`/`useRun`/`useResult`/`useLoading`/`useError` into one hook: `useQuery(fn, args?, opts?) → {data, loading, error, stale, refetch}`. Defaults: module-level shared `queryCache` (`cacheTime` 10000ms) and `staleTime` 2000ms. `refetch` deletes the cache entry for the current `args` and re-runs (cache bypass), and its identity follows `args`. The preset also keeps a module-level shared injectable per service fn and exports `useQueryOf(fn)` — the invalidation target for `useMutation({invalidates})` / `invalidate()` (they address caches by injectable identity, so every consumer must reuse the same instance). `opts.mock` wires the DevTool panel via `useMock` — the mock middleware must register *inside* the cache layer, which is why it is an option instead of caller-side composition; the mock config must stay constant per call site. Route-level data (Home, Article) instead uses `mockViewData` + `useData()` (cast, e.g. `useData() as ArticlePage` — typed `useData<T>()` awaits a future native-router release).

**Optimistic mutations:** favorite (Home/Article) and follow (Article) keep local override state. Why not `react-toolroom`'s `useOptimistic` (available since 0.6.0)? It patches the result store of the *same injectable* — but this data comes from the route loader, not a `useQuery` injectable, so there is no patch target. Pattern: compute `next`, `setOverride(next)`, on success overwrite with the server's authoritative response, on failure roll back to the captured `prev` (the request failed, so the server value is unchanged). Home keys overrides by slug (`Record<slug, {...}>`, failure deletes the entry); Article uses single nullable overrides.

**Comment refresh:** posting a comment goes through `useMutation(articleService.addComment, {invalidates: [[commentsInjectable, slug]]})` where `commentsInjectable = useQueryOf(articleService.fetchCommentsByTitle)` (the hook from the `useQuery` preset that resolves the *shared* injectable — invalidation targets injectable identity). On success the mutation deletes the `[fn, slug]` prefix cache and re-pulls active subscribers, so `CommentList` refreshes declaratively. The form side does `reset(commentForm, {body: ''})` + incrementing a key that remounts the form subtree (see the Textarea note below); `CommentList` itself has no refresh prop.

**Editor form pitfalls:** `initialValues` must be memoized (`useMemo`) and passed to **both** `useForm` and `<Form>` — `Field`'s `initialValue` alone is cleared by the form's `setInitialValues` effect (`values.clear()`). `TagInput`'s `onChange` returns `string[]` (not a DOM event), so its `Field` needs `eventToValue={(v: string[]) => v}`. `useIsSubmitting` drives the `Publishing...`/`Updating...` label.

**Textarea is uncontrolled:** haze-ui inputs keep their text in `useControl` internal state — changing the `value` prop does NOT update the displayed text, and `reset()` only re-seeds that internal state. The reliable way to clear a `Textarea` after submit is remounting the subtree (increment a `key`). See the comment-refresh mechanism above.

**Forms:** `react-f0rm` 0.4.x — `onSubmit` / `onValidSubmit` both fire only after validation passes and both are awaited (`void | Promise<void>`), so `isSubmitting` spans the entire async submission; the project uniformly uses `onSubmit`. `src/components/FieldError.tsx` is the shared field-error renderer (`useFormContext<Record<string, unknown>>()` is typed since 0.4).

**Layout:** `src/views/Layout/index.tsx` is the app shell (header, nav, `<View />` outlet) with auth-driven nav.

**CSS:** Linaria (`@linaria/core`) — zero-runtime CSS-in-JS extracted at build time via `@wyw-in-js/vite`. Styles are defined with `css` tagged template literals.

**Types → JSON Schema:** `src/types/base.ts` types carry JSON Schema annotations as JSDoc tags (`@faker`, `@minimum`, `@unique`, ...). The `rollup-plugin-type-as-json-schema` plugin converts them to `.schema` files (imported from `@/types/index.schema`), which `src/util/faker.ts` uses with `json-schema-faker` + `@faker-js/faker` for dev-mode mock data. Note: `json-schema-faker` 0.6 requires the faker instance via `options.extensions` (`generate(schema, {extensions: {faker}})`) or `@faker` annotations are silently ignored.

**DevTool:** `src/components/DevTool.tsx` provides a dev-only mock data control panel (only loaded in development via `src/index.tsx`). Each registered dataset can switch between `empty` (mock only when the API errors or returns nothing) and `always`. Two registration paths: `mockViewData` wraps route `data` loaders; `useQuery`'s `mock` option covers component queries.

**Testing:** Vitest + Testing Library. Component tests (`Home`, `Editor`, `Article`, `PreviewLink`, `Loading`, `RouterError`) mock the *service layer*, not the network, so real view logic is exercised; unit tests cover `useQuery`, `http`, `faker`, `auth`, and `article`.

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
| `@native-router/react` | Client-side routing: `HistoryRouter`, `View`, `useData` (generic), `useMatched`, `useRouter`, `useSearch` (Standard Schema), `ScrollRestoration`, `PrefetchLink`, `usePrefetch`, `errorHandler` |
| `react-toolroom/async` | Async data primitives: `useInjectable`, `useInject`, `useCache`, `useRun`, `useResult`, `useLoading`, `useError`, `useMutation` + `invalidates`, `invalidate`, `createMemoryCacheProvider` |
| `fetch-fun` | Pipeable functional fetch toolkit (local `file:` dep) — basis of `src/util/http.ts` |
| `react-f0rm` | Event-driven forms: `Form`, `Field`, `useForm`, `useFormContext`, `useIsSubmitting`, `useError`, `reset`, `eventToValue` |
| `haze-ui` | Component library (Card, Input, Textarea, TagInput, Chip, ...), re-exports `useControl` |
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
- Shared tool configs live in `../tools-config/` (local `file:` dependency)
