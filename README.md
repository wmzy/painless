# Painless

> A lightweight React framework for building modern web applications.

English | [简体中文](./README-zh_CN.md)

## Why Painless?

Modern frontend development is overly complex. Painless strips away the complexity while keeping the power.

- **Zero complex concepts** - No SSR, no server-side runtime, just pure client-side React
- **Zero-runtime CSS** - Using Linaria, styles are extracted at build time
- **Type-safe** - Full TypeScript support with zero configuration
- **Instant feedback** - Hot Module Replacement for instant updates

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

### No Built-In Image Optimization

Image optimization is a service concern, not a framework concern. A dedicated image service (CDN-based or self-hosted) can serve optimized images to all clients — web, mobile, desktop — not just the frontend framework. Coupling this into the framework creates vendor lock-in and serves only one client.

### Platform-Agnostic Deployment

Painless produces standard static assets. It does not couple to any specific deployment platform — no proprietary middleware, no platform-specific APIs, no vendor lock-in. Deploy to GitHub Pages, Netlify, Vercel, Cloudflare Pages, your own CDN, or a USB drive. The output is yours.

## Tech Stack

- [React](https://react.dev) - UI Library
- [Native Router](https://github.com/native-router/react) - Lightweight routing
- [haze-ui](https://github.com/wmzy/haze-ui) - Component library with zero-runtime CSS
- [react-use-control](https://github.com/wmzy/react-use-control) - Controlled/uncontrolled state in one line
- [react-f0rm](https://github.com/wmzy/react-f0rm) - Event-driven form library
- [Linaria](https://github.com/callstack/linaria) - Zero-runtime CSS-in-JS
- [Vite](https://vitejs.dev) - Next generation frontend tooling
- TypeScript - Type safety

## Features

### Zero-Configuration Routing

```tsx
// routes.ts
export const routes = [
  {
    path: '/',
    component: () => import('./pages/Home')
  },
  {
    path: '/users',
    component: () => import('./pages/Users'),
    data: fetchUsers // Auto data fetching
  }
];
```

### Type-Safe Data Fetching

```tsx
// services/user.ts
interface User {
  id: number;
  name: string;
}

export async function fetchUsers(): Promise<User[]> {
  return get('/api/users');
}

// pages/Users.tsx
import { useData } from '@native-router/react';

export default function Users() {
  const users = useData<User[]>();
  return <ul>{users.map(u => <li>{u.name}</li>)}</ul>;
}
```

### Built-in Mock

```ts
// services/user.ts (Mock)
interface User {
  id: number;
  name: string;
}

/**
 * @mock {
 *   "users|5-10": [
 *     { "id": "@id", "name": "@name" }
 *   ]
 * }
 */
export async function fetchUsers(): Promise<User[]> {
  return get('/api/users');
}
```

### Zero-Runtime CSS

```tsx
// components/Button.tsx
import { css } from '@linaria/core';

const styles = css\`
  button {
    padding: 8px 16px;
    border-radius: 4px;
    background: #0070f3;
    color: white;
    border: none;
    cursor: pointer;
  }
  
  button:hover {
    background: #0050a0;
  }
\`;

export function Button({ children }) {
  return <button class={styles}>{children}</button>;
}
```

### Clean Component State with `useControl`

Every stateful component in React faces the same problem: should it be controlled (parent owns state) or uncontrolled (component owns state)? The traditional solution requires separate `value`/`defaultValue`/`onChange` props, internal `useState`, `useEffect` sync, and conditional logic.

`react-use-control` collapses all of that into one line:

```tsx
import { useControl } from 'haze-ui';

function Toggle({ open }: { open?: Control<boolean> | boolean }) {
  const [isOpen, setOpen] = useControl(open, false);
  return <button onClick={() => setOpen(!open)}>{isOpen ? 'Close' : 'Open'}</button>;
}
```

That's it. The component works in both modes:

```tsx
// Uncontrolled — component owns state
<Toggle />

// Controlled — parent owns state
const [open, setOpen] = useControl(false);
<Toggle open={open} />
```

**How it works:** `useControl(prop, default)` returns `[value, setValue, control]` — same shape as `useState`, plus a `Control` object to pass down. If the prop is a `Control`, state is shared with the parent. If it's a plain value, it becomes the initial value. If omitted, the default is used.

**In this project**, `useControl` is used for component-internal state (DevTool panel open/close, PreviewLink hover visibility). Form inputs use `react-f0rm` directly — form state is the form library's responsibility, not the component's.

**Key principle:** `useControl` is for exposing internal state to external components. If a library already manages the state (like react-f0rm for forms), don't wrap it — let the library do its job.

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
│   ├── components/     # Reusable UI components
│   ├── views/          # Page components
│   ├── services/       # API & data fetching
│   ├── types/          # TypeScript types
│   ├── util/           # Utility functions
│   └── index.tsx       # App entry point
├── public/             # Static assets
├── package.json
└── vite.config.ts      # Vite configuration
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start development server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Run ESLint |

## Native Router API

### Router Props

```tsx
<Router
  routes={routes}
  baseUrl="/app"
  onNavigate={(to, from) => console.log(to)}
/>
```

### Link Component

```tsx
import { Link } from '@native-router/react';

<Link to="/users">Users</Link>
<Link to="/users/1" prefetch>Prefetch on hover</Link>
```

### Data Hooks

```tsx
import { useData, useLoading, useError } from '@native-router/react';

function Page() {
  const data = useData<MyData>();
  const loading = useLoading();
  const error = useError();
  
  if (loading) return <Spinner />;
  if (error) return <Error error={error} />;
  
  return <div>{data}</div>;
}
```

## Migration from Create React App

1. Replace `react-scripts` with Vite
2. Move from `react-router` to `@native-router/react`
3. Replace CSS-in-JS with Linaria

## Related Projects

- [@native-router/react](https://github.com/native-router/react) - Routing
- [react-toolroom](https://github.com/wmzy/react-toolroom) - React utilities
- [Linaria](https://github.com/callstack/linaria) - CSS-in-JS

## Contributing

Contributions are welcome! Please read our [contributing guide](./CONTRIBUTING.md).

## License

MIT
