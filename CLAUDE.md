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
- `pnpm test` — Vitest watch mode
- `pnpm test:run` — single test run (CI mode)
- `pnpm test:run -- path/to/file.test.ts` — run a single test file
- `pnpm coverage` — tests with coverage
- `pnpm lint` — ESLint with auto-fix

## Architecture

**Routing:** `@native-router/react` with `HistoryRouter` defined in `src/views/index.tsx`. Views are lazy-loaded via dynamic `import()`. Route data loaders are defined inline in the route config.

**Layout:** `src/views/Layout/index.tsx` is the app shell (header, nav, `<View />` outlet).

**Services:** `src/services/article.ts` — all API calls go through `src/util/http.ts` (fetch wrapper with base URL `https://api.realworld.io/api/`).

**Async data:** Components use `react-toolroom/async` hooks (`useResult`, `useLoading`, `useError`, `useCache`, `useRun`) for data fetching with caching and staleness.

**CSS:** Linaria (`@linaria/core`) — zero-runtime CSS-in-JS extracted at build time via `@wyw-in-js/vite`. Styles are defined with `css` tagged template literals.

**Types → JSON Schema:** `src/types/base.ts` types carry JSON Schema annotations. The `rollup-plugin-type-as-json-schema` plugin converts them to `.schema` files at build time, which `src/util/faker.ts` uses with `json-schema-faker` + `@faker-js/faker` for dev-mode mock data.

**DevTool:** `src/components/DevTool.tsx` provides a dev-only mock data control panel. `mockViewData` wraps data fetchers to return faker data. Only loaded in development (`src/index.tsx`).

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
| `@native-router/react` | Client-side routing with data loading and prefetching |
| `haze-ui` | Component library with zero-runtime CSS, re-exports `useControl` |
| `react-use-control` | Controlled/uncontrolled state — `useControl(prop, default)` |
| `react-f0rm` | Event-driven form library with `Form`, `Field`, `useField`, `useError` |
| `react-toolroom/async` | Async data hooks with caching |
| `@linaria/core` | Zero-runtime CSS-in-JS |
| `ramda` | FP utilities (used in faker.ts) |
| `qss` | Query string encode/decode |

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
