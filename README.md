# Painless

> A lightweight React framework for building modern web applications.

English | [简体中文](./README-zh_CN.md)

## Why Painless?

Modern frontend development is overly complex. Painless strips away the complexity while keeping the power.

- **Zero complex concepts** - No SSR, no server-side runtime, just pure client-side React
- **Zero-runtime CSS** - Using Linaria, styles are extracted at build time
- **Type-safe** - Full TypeScript support with zero configuration
- **Instant feedback** - Hot Module Replacement for instant updates

## Tech Stack

- [React](https://react.dev) - UI Library
- [Native Router](https://github.com/native-router/react) - Lightweight routing
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
