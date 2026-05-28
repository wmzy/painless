# haze-ui + react-f0rm Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all plain HTML with haze-ui components and add react-f0rm forms across the painless RealWorld demo app.

**Architecture:** Layer-first — foundation (theme, routes), then layout, then page rewrites, then forms. Each task is self-contained and builds on the previous.

**Tech Stack:** React 19, haze-ui (Linaria component library), react-f0rm (event-driven forms), @native-router/react (routing), Vitest (testing)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/typings/react-f0rm.d.ts` | Create | Type declarations for react-f0rm v0.2.1 (missing .d.ts) |
| `src/index.tsx` | Modify | Import haze-ui CSS + apply lightTheme |
| `src/views/index.tsx` | Modify | Add /login, /register, /editor routes |
| `src/services/auth.ts` | Create | Login/register API functions |
| `src/services/auth.test.ts` | Create | Tests for auth service |
| `src/views/Layout/index.tsx` | Rewrite | NavigationBar + NavLink + Container |
| `src/components/RouterError.tsx` | Rewrite | Card + Title + Text + Button |
| `src/views/Home/index.tsx` | Rewrite | Card + Title + Badge + Avatar + Flex |
| `src/views/Home/Tags.tsx` | Rewrite | TagGroup + Spinner + Alert + Skeleton |
| `src/views/Article/index.tsx` | Rewrite | Card + Title + Text + Divider + comment form |
| `src/views/Article/CommentList.tsx` | Rewrite | List + Avatar + Spinner + Alert |
| `src/views/Help/index.tsx` | Rewrite | Card + Title + Text |
| `src/views/About/index.tsx` | Rewrite | Card + Title + Text |
| `src/components/DevTool.tsx` | Rewrite | react-f0rm Field + haze-ui Button/Card |
| `src/views/Login/index.tsx` | Create | Login form with react-f0rm + haze-ui |
| `src/views/Register/index.tsx` | Create | Register form with react-f0rm + haze-ui |
| `src/views/Editor/index.tsx` | Create | Article editor form with react-f0rm + haze-ui |

---

### Task 1: react-f0rm Type Declarations

**Files:**
- Create: `src/typings/react-f0rm.d.ts`

react-f0rm v0.2.1 ships without `.d.ts` files. Create type declarations so TypeScript works across all form tasks.

- [ ] **Step 1: Create type declarations**

```typescript
// src/typings/react-f0rm.d.ts
declare module 'react-f0rm' {
  import { ComponentType, ReactNode, FormEvent, InputHTMLAttributes, Ref } from 'react';

  export interface FormInstance {
    emitter: any;
    initialValues: any;
    values: Map<string, any>;
    errors: Map<string, string>;
    touched: Set<string>;
    validators: Map<string, any>;
    validating: Set<string>;
    isSubmitting: boolean;
    submitCount: number;
    isSubmitSuccessful: boolean;
  }

  export interface CreateFormOptions {
    initialValues?: any;
    validate?: (values: any) => any;
    revalidateOnChange?: boolean;
  }

  export function createForm(options?: CreateFormOptions): FormInstance;

  export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
    form?: FormInstance;
    initialValues?: any;
    onSubmit?: (values: any, form: FormInstance) => void;
    onValidSubmit?: (values: any, form: FormInstance) => void;
    onInvalidSubmit?: (errors: any, form: FormInstance) => void;
    children?: ReactNode;
  }

  export function Form(props: FormProps): JSX.Element;

  export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
    name: string;
    as?: ComponentType<any> | string;
    validate?: (value: any) => string | undefined | Promise<string | undefined>;
    eventToValue?: (e: any) => any;
    initialValue?: any;
    asProps?: Record<string, any>;
    ref?: Ref<any>;
  }

  export function Field(props: FieldProps): JSX.Element;

  export interface CheckboxProps extends Omit<FieldProps, 'type'> {
    name: string;
    validate?: (value: any) => string | undefined;
  }

  export function Checkbox(props: CheckboxProps): JSX.Element;

  export function useForm(options?: CreateFormOptions): FormInstance;
  export function useFormContext(): FormInstance;

  export interface UseFieldOptions {
    form?: FormInstance;
    name: string;
    initialValue?: any;
    shouldUnregister?: boolean;
    validate?: (value: any) => string | undefined | Promise<string | undefined>;
    [key: string]: any;
  }

  export function useField(options: UseFieldOptions): {
    value: any;
    error: string | undefined;
    onChange: (...args: any[]) => void;
    onBlur: () => void;
    name: string;
    [key: string]: any;
  };

  export interface UseFieldArrayOptions {
    form?: FormInstance;
    name: string;
  }

  export function useFieldArray(options: UseFieldArrayOptions): {
    fields: Array<{ id: string; index: number }>;
    append: (value: any) => void;
    prepend: (value: any) => void;
    insert: (index: number, value: any) => void;
    remove: (index: number) => void;
    swap: (indexA: number, indexB: number) => void;
    move: (from: number, to: number) => void;
  };

  export function useValue(name: string): any;
  export function useTouched(name: string): boolean;
  export function useError(name: string): string | undefined;
  export function useIsDirty(): boolean;
  export function useHasErrors(): boolean;
  export function useIsSubmitting(): boolean;
  export function useSubmitCount(): number;

  export const FormContext: React.Context<FormInstance | null>;
  export const FormProvider: ComponentType<{ value: FormInstance; children: ReactNode }>;
  export const CheckboxGroupContext: React.Context<any>;
  export const CheckboxGroupProvider: ComponentType<{ value: any; children: ReactNode }>;

  export function getValues(form: FormInstance): any;
  export function getValue(form: FormInstance, name: string): any;
  export function setValue(form: FormInstance, name: string, value: any): void;
  export function getError(form: FormInstance, name: string): string | undefined;
  export function getErrors(form: FormInstance): string[];
  export function getFirstError(form: FormInstance): string | undefined;
  export function setError(form: FormInstance, name: string, error: string): void;
  export function clearErrors(form: FormInstance): void;
  export function setTouched(form: FormInstance, name: string): void;
  export function hasTouched(form: FormInstance, name: string): boolean;
  export function isDirty(form: FormInstance): boolean;
  export function isTouched(form: FormInstance): boolean;
  export function hasErrors(form: FormInstance): boolean;
  export function removeField(form: FormInstance, name: string): void;
  export function setInitialValues(form: FormInstance, values: any): void;
  export function reset(form: FormInstance): void;
  export function trigger(form: FormInstance): Promise<void>;
  export function validate(form: FormInstance): Promise<string | undefined>;
  export function ensureValidate(form: FormInstance): Promise<void>;
  export function setIsSubmitting(form: FormInstance, value: boolean): void;
  export function incrementSubmitCount(form: FormInstance): void;
  export function setSubmitSuccessful(form: FormInstance, value: boolean): void;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit --skipLibCheck`
Expected: No errors related to react-f0rm imports

- [ ] **Step 3: Commit**

```bash
git add src/typings/react-f0rm.d.ts
git commit -m "feat: add react-f0rm type declarations"
```

---

### Task 2: Foundation — Entry Point + Theme

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step 1: Rewrite `src/index.tsx`**

```tsx
import {createRoot} from 'react-dom/client';
import 'haze-ui/styles.css';
import {lightTheme} from 'haze-ui';
import App from '@/views';
import DevTool from './components/DevTool';

function AppWithDevtool() {
  return (
    <DevTool>
      <App />
    </DevTool>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className={lightTheme}>
    {import.meta.env.DEV ? <AppWithDevtool /> : <App />}
  </div>
);
```

- [ ] **Step 2: Verify dev server starts**

Run: `pnpm start`
Expected: App loads with haze-ui theme applied (check that haze-ui CSS is loaded in network tab)

- [ ] **Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "feat: import haze-ui styles and apply lightTheme"
```

---

### Task 3: Auth Service

**Files:**
- Create: `src/services/auth.ts`
- Create: `src/services/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/auth.test.ts
import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as auth from '@/services/auth';

vi.mock('@/util/http', () => ({
  post: vi.fn()
}));

import * as http from '@/util/http';

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should call post with login endpoint and return user', async () => {
      const mockUser = {user: {email: 'test@test.com', token: 'abc'}};
      vi.mocked(http.post).mockResolvedValue(mockUser as any);

      const result = await auth.login('test@test.com', 'password');

      expect(http.post).toHaveBeenCalledWith('users/login', {
        user: {email: 'test@test.com', password: 'password'}
      });
      expect(result).toEqual(mockUser.user);
    });
  });

  describe('register', () => {
    it('should call post with register endpoint and return user', async () => {
      const mockUser = {user: {username: 'test', email: 'test@test.com', token: 'abc'}};
      vi.mocked(http.post).mockResolvedValue(mockUser as any);

      const result = await auth.register('test', 'test@test.com', 'password');

      expect(http.post).toHaveBeenCalledWith('users', {
        user: {username: 'test', email: 'test@test.com', password: 'password'}
      });
      expect(result).toEqual(mockUser.user);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/services/auth.test.ts`
Expected: FAIL — module `@/services/auth` not found

- [ ] **Step 3: Implement auth service**

```typescript
// src/services/auth.ts
import * as http from '@/util/http';

export async function login(email: string, password: string) {
  return http
    .post('users/login', {user: {email, password}})
    .then(({user}) => user);
}

export async function register(username: string, email: string, password: string) {
  return http
    .post('users', {user: {username, email, password}})
    .then(({user}) => user);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- src/services/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.ts src/services/auth.test.ts
git commit -m "feat: add auth service with login and register"
```

---

### Task 4: Router — Add New Routes

**Files:**
- Modify: `src/views/index.tsx`

- [ ] **Step 1: Add new routes to the router config**

Add the following routes to the `children` array in `src/views/index.tsx`, after the `/about` route:

```typescript
{
  path: '/login',
  component: () => import('./Login')
},
{
  path: '/register',
  component: () => import('./Register')
},
{
  path: '/editor',
  component: () => import('./Editor')
},
{
  path: '/editor/:slug',
  component: () => import('./Editor')
}
```

The full file should look like:

```tsx
import {View, HistoryRouter as Router, Route} from '@native-router/react';
import {decode} from 'qss';
import {useMemo} from 'react';
import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {mockViewData} from '@/components/DevTool';
import {articlePageSchema} from '@/types/index.schema';

export default function App() {
  return useMemo(() => {
    const routes = {
      component: () => import('./Layout'),
      children: [
        {
          path: '/',
          data: mockViewData(
            ({location}) => {
              const query = decode(location.search.slice(1));
              return articleService.query(query);
            },
            articlePageSchema,
            'articlePage'
          ),
          component: () => import('./Home')
        },
        {
          path: '/article/:title',
          component: () => import('./Article'),
          data: ({params: {title}}) => articleService.findByTitle(title)
        },
        {
          path: '/help',
          component: () => import('./Help')
        },
        {
          path: '/about',
          component: () => import('./About')
        },
        {
          path: '/login',
          component: () => import('./Login')
        },
        {
          path: '/register',
          component: () => import('./Register')
        },
        {
          path: '/editor',
          component: () => import('./Editor')
        },
        {
          path: '/editor/:slug',
          component: () => import('./Editor')
        }
      ]
    } as Route;

    return (
      <Router
        routes={routes}
        errorHandler={(e) => <RouterError error={e} />}
      >
        <View />
        <Loading />
      </Router>
    );
  }, []);
}
```

- [ ] **Step 2: Create placeholder view files so routes don't error**

Create minimal placeholders (will be fully rewritten in later tasks):

```tsx
// src/views/Login/index.tsx
export default function Login() {
  return <div>Login</div>;
}
```

```tsx
// src/views/Register/index.tsx
export default function Register() {
  return <div>Register</div>;
}
```

```tsx
// src/views/Editor/index.tsx
export default function Editor() {
  return <div>Editor</div>;
}
```

- [ ] **Step 3: Verify dev server starts and routes work**

Run: `pnpm start`
Expected: Navigate to `/login`, `/register`, `/editor` — each shows placeholder text

- [ ] **Step 4: Commit**

```bash
git add src/views/index.tsx src/views/Login/index.tsx src/views/Register/index.tsx src/views/Editor/index.tsx
git commit -m "feat: add login, register, and editor routes"
```

---

### Task 5: Layout Rewrite

**Files:**
- Rewrite: `src/views/Layout/index.tsx`

- [ ] **Step 1: Rewrite Layout with haze-ui components**

```tsx
import {css} from '@linaria/core';
import {View} from '@native-router/react';
import {NavigationBar, NavLink, Container, Title} from 'haze-ui';

export default function Layout() {
  return (
    <div>
      <NavigationBar>
        <NavLink to='/'>
          <Title level={3}>Painless</Title>
        </NavLink>
        <NavLink to='/'>Home</NavLink>
        <NavLink to='/help'>Help</NavLink>
        <NavLink to='/about'>About</NavLink>
        <NavLink to='/login'>Login</NavLink>
        <NavLink to='/register'>Register</NavLink>
      </NavigationBar>
      <Container>
        <View />
      </Container>
    </div>
  );
}

export const globals = css`
  :global() {
    body {
      margin: 0;
    }
  }
`;
```

- [ ] **Step 2: Verify dev server renders correctly**

Run: `pnstart`
Expected: Navigation bar shows with haze-ui styling, links work, content is centered in container

- [ ] **Step 3: Commit**

```bash
git add src/views/Layout/index.tsx
git commit -m "feat: rewrite Layout with haze-ui NavigationBar and Container"
```

---

### Task 6: RouterError Rewrite

**Files:**
- Rewrite: `src/components/RouterError.tsx`

- [ ] **Step 1: Rewrite RouterError with haze-ui components**

```tsx
import {refresh} from '@native-router/core';
import {Link, useRouter} from '@native-router/react';
import {Card, Title, Text, Button} from 'haze-ui';

type Props = {
  error: Error;
};

export default function RouterError({error}: Props) {
  const router = useRouter();
  return (
    <Card>
      <Title>Error</Title>
      <Text>{error.message}</Text>
      <pre>{error.stack}</pre>
      <Button onClick={() => refresh(router)}>Refresh</Button>
      <Link to='/'>Home</Link>
    </Card>
  );
}
```

- [ ] **Step 2: Verify by triggering a route error (e.g. navigate to a bad route)**

Run: `pnpm start`
Expected: Error page shows with Card styling

- [ ] **Step 3: Commit**

```bash
git add src/components/RouterError.tsx
git commit -m "feat: rewrite RouterError with haze-ui Card and Button"
```

---

### Task 7: Home Page Rewrite

**Files:**
- Rewrite: `src/views/Home/index.tsx`

- [ ] **Step 1: Rewrite Home with haze-ui components**

```tsx
import {css} from '@linaria/core';
import {useData} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex, Button} from 'haze-ui';
import {ArticlePage} from '@/types';
import PreviewLink from '@/components/PreviewLink';
import Tags from './Tags';

export default function Home() {
  const {articles} = useData() as ArticlePage;

  return (
    <div
      className={css`
        text-align: center;
      `}
    >
      <Title>Welcome to Painless.</Title>
      <Flex>
        <div>
          {articles.map((a) => (
            <Card key={a.slug}>
              <Flex align='center' gap='sm'>
                <Avatar src={a.author.image} alt={a.author.username} />
                <Text>{a.author.username}</Text>
              </Flex>
              <Title level={2}>
                <PreviewLink to={`/article/${a.slug}`}>{a.title}</PreviewLink>
              </Title>
              <Text>{a.description}</Text>
              <Flex gap='xs' wrap='wrap'>
                {a.tagList.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </Flex>
            </Card>
          ))}
        </div>
        <Tags />
      </Flex>
    </div>
  );
}
```

- [ ] **Step 2: Verify Home page renders with haze-ui components**

Run: `pnpm start`
Expected: Article cards show with Card, Avatar, Badge, Title styling

- [ ] **Step 3: Commit**

```bash
git add src/views/Home/index.tsx
git commit -m "feat: rewrite Home page with haze-ui Card, Badge, Avatar"
```

---

### Task 8: Tags Rewrite

**Files:**
- Rewrite: `src/views/Home/Tags.tsx`

- [ ] **Step 1: Rewrite Tags with haze-ui components**

```tsx
import {css} from '@linaria/core';
import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';
import {TagGroup, TagGroupItem, Spinner, Alert, Skeleton} from 'haze-ui';
import {useMock} from '@/components/DevTool';
import * as articleService from '@/services/article';
import {tagListSchema} from '@/types/index.schema';

const cache = createMemoryCacheProvider<any, any[]>({
  cacheTime: 10000,
  hash: (k: any[]) => JSON.stringify(k)
});

export default function Tags() {
  const fetchTags = useInjectable(articleService.fetchTags);
  useMock(fetchTags, tagListSchema, 'tagList', cache);
  const isStale = useCache(fetchTags, cache, 2000);
  const tags = useResult(fetchTags, []);
  const loading = useLoading(fetchTags);
  const error = useError(fetchTags);

  useRun(fetchTags, []);

  if (loading) {
    return (
      <aside>
        <Skeleton count={5} />
      </aside>
    );
  }

  if (error) {
    return (
      <aside>
        <Alert type='error'>Failed to load tags</Alert>
      </aside>
    );
  }

  return (
    <aside
      x-class={
        isStale &&
        css`
          opacity: 0.5;
        `
      }
    >
      <Title level={3}>Popular Tags</Title>
      <TagGroup>
        {tags.map((t) => (
          <TagGroupItem key={t}>{t}</TagGroupItem>
        ))}
      </TagGroup>
    </aside>
  );
}
```

Note: Need to add `Title` to the import from `haze-ui`.

- [ ] **Step 2: Verify Tags sidebar renders correctly**

Run: `pnpm start`
Expected: Tags show as TagGroup items, loading shows Skeleton, error shows Alert

- [ ] **Step 3: Commit**

```bash
git add src/views/Home/Tags.tsx
git commit -m "feat: rewrite Tags with haze-ui TagGroup, Spinner, Alert"
```

---

### Task 9: CommentList Rewrite

**Files:**
- Rewrite: `src/views/Article/CommentList.tsx`

- [ ] **Step 1: Rewrite CommentList with haze-ui components**

```tsx
import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';
import {List, ListItem, Avatar, Text, Spinner, Alert} from 'haze-ui';
import * as articleService from '@/services/article';

type Props = {title: string};

const cache = createMemoryCacheProvider<any, any[]>({
  cacheTime: 10000,
  hash: (k: any[]) => JSON.stringify(k)
});

export default function CommentList({title}: Props) {
  const fetchCommentsByTitle = useInjectable(
    articleService.fetchCommentsByTitle
  );
  useCache(fetchCommentsByTitle, cache, 2000);
  const comments = useResult(fetchCommentsByTitle, []);
  const loading = useLoading(fetchCommentsByTitle);
  const error = useError(fetchCommentsByTitle);

  useRun(fetchCommentsByTitle, [title]);

  if (loading) return <Spinner />;
  if (error) return <Alert type='error'>Failed to load comments</Alert>;

  return (
    <List>
      {comments.map((c) => (
        <ListItem key={c.id}>
          <Avatar src={c.author.image} alt={c.author.username} />
          <Text>{c.body}</Text>
        </ListItem>
      ))}
    </List>
  );
}
```

- [ ] **Step 2: Verify CommentList renders correctly**

Run: `pnpm start`, navigate to an article
Expected: Comments show as List items with Avatar

- [ ] **Step 3: Commit**

```bash
git add src/views/Article/CommentList.tsx
git commit -m "feat: rewrite CommentList with haze-ui List, Avatar, Spinner"
```

---

### Task 10: Article Page Rewrite + Comment Form

**Files:**
- Rewrite: `src/views/Article/index.tsx`

- [ ] **Step 1: Rewrite Article with haze-ui components and comment form**

```tsx
import {useData} from '@native-router/react';
import {Form, useForm, Field, reset} from 'react-f0rm';
import {Card, Title, Text, Avatar, Divider, Textarea, Button} from 'haze-ui';
import type {Article} from '@/types';
import * as http from '@/util/http';
import CommentList from './CommentList';

export default function ArticleView() {
  const article = useData() as Article;
  const commentForm = useForm();

  const handleCommentSubmit = async (values: any) => {
    await http.post(`articles/${article.slug}/comments`, {
      comment: {body: values.body}
    });
    reset(commentForm);
  };

  return (
    <Card>
      <Title>{article.title}</Title>
      <Avatar src={article.author.image} alt={article.author.username} />
      <Text>{article.author.username}</Text>
      <Divider />
      <div>
        {article.body.split('\\n').map((p, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={i}>{p}</Text>
        ))}
      </div>
      <Divider />
      <Title level={3}>Comments</Title>
      <Form form={commentForm} onValidSubmit={handleCommentSubmit}>
        <Field
          name='body'
          as={Textarea}
          placeholder='Write a comment...'
          validate={(v: any) => (!v ? 'Comment is required' : undefined)}
        />
        <Button type='submit'>Post Comment</Button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
```

- [ ] **Step 2: Verify Article page renders with comment form**

Run: `pnpm start`, navigate to an article
Expected: Article shows with Card, Title, Text, Divider; comment form appears with Textarea and Button

- [ ] **Step 3: Commit**

```bash
git add src/views/Article/index.tsx
git commit -m "feat: rewrite Article page with haze-ui and add comment form"
```

---

### Task 11: Help + About Rewrite

**Files:**
- Rewrite: `src/views/Help/index.tsx`
- Rewrite: `src/views/About/index.tsx`

- [ ] **Step 1: Rewrite Help page**

```tsx
import {Card, Title, Text} from 'haze-ui';

export default function Help() {
  return (
    <Card>
      <Title>Help</Title>
      <Text>Welcome to Painless — a lightweight React framework for modern client-side apps.</Text>
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite About page**

```tsx
import {Card, Title, Text} from 'haze-ui';

export default function About() {
  return (
    <Card>
      <Title>About Native Router</Title>
      <Text>Native Router is another router lib which works like the native browser.</Text>
    </Card>
  );
}
```

- [ ] **Step 3: Verify both pages render correctly**

Run: `pnpm start`
Expected: Help and About pages show with Card and Title styling

- [ ] **Step 4: Commit**

```bash
git add src/views/Help/index.tsx src/views/About/index.tsx
git commit -m "feat: rewrite Help and About pages with haze-ui Card and Title"
```

---

### Task 12: Login Form

**Files:**
- Rewrite: `src/views/Login/index.tsx`

- [ ] **Step 1: Rewrite Login page with react-f0rm + haze-ui**

```tsx
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Button, Text} from 'haze-ui';
import {useRouter} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as auth from '@/services/auth';

export default function Login() {
  const form = useForm();
  const router = useRouter();

  const handleSubmit = async (values: any) => {
    try {
      await auth.login(values.email, values.password);
      navigate(router, '/');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card>
      <Title>Login</Title>
      <Form form={form} onValidSubmit={handleSubmit}>
        <Field
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={(v: any) => {
            if (!v) return 'Email is required';
            if (!/\S+@\S+\.\S+/.test(v)) return 'Invalid email';
            return undefined;
          }}
        />
        <Field
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={(v: any) => (!v ? 'Password is required' : undefined)}
        />
        <Button type='submit'>Login</Button>
      </Form>
      <Text>
        Don't have an account? <a href='/register'>Register</a>
      </Text>
    </Card>
  );
}
```

- [ ] **Step 2: Verify Login form renders and validates**

Run: `pnpm start`, navigate to `/login`
Expected: Form shows with Input fields and Button; empty submit shows validation errors

- [ ] **Step 3: Commit**

```bash
git add src/views/Login/index.tsx
git commit -m "feat: implement Login page with react-f0rm and haze-ui"
```

---

### Task 13: Register Form

**Files:**
- Rewrite: `src/views/Register/index.tsx`

- [ ] **Step 1: Rewrite Register page with react-f0rm + haze-ui**

```tsx
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Button, Text} from 'haze-ui';
import {useRouter} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as auth from '@/services/auth';

export default function Register() {
  const form = useForm();
  const router = useRouter();

  const handleSubmit = async (values: any) => {
    try {
      await auth.register(values.username, values.email, values.password);
      navigate(router, '/');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card>
      <Title>Register</Title>
      <Form form={form} onValidSubmit={handleSubmit}>
        <Field
          name='username'
          as={Input}
          placeholder='Username'
          validate={(v: any) => (!v ? 'Username is required' : undefined)}
        />
        <Field
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={(v: any) => {
            if (!v) return 'Email is required';
            if (!/\S+@\S+\.\S+/.test(v)) return 'Invalid email';
            return undefined;
          }}
        />
        <Field
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={(v: any) => {
            if (!v) return 'Password is required';
            if (v.length < 8) return 'Password must be at least 8 characters';
            return undefined;
          }}
        />
        <Button type='submit'>Register</Button>
      </Form>
      <Text>
        Already have an account? <a href='/login'>Login</a>
      </Text>
    </Card>
  );
}
```

- [ ] **Step 2: Verify Register form renders and validates**

Run: `pnpm start`, navigate to `/register`
Expected: Form shows with Input fields and Button; empty submit shows validation errors

- [ ] **Step 3: Commit**

```bash
git add src/views/Register/index.tsx
git commit -m "feat: implement Register page with react-f0rm and haze-ui"
```

---

### Task 14: Article Editor Form

**Files:**
- Rewrite: `src/views/Editor/index.tsx`

- [ ] **Step 1: Rewrite Editor page with react-f0rm + haze-ui**

```tsx
import {useMemo} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Button} from 'haze-ui';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as http from '@/util/http';
import type {Article} from '@/types';

export default function Editor() {
  const form = useForm();
  const router = useRouter();
  const article = useData() as Article | undefined;

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        article: {
          title: values.title,
          description: values.description,
          body: values.body,
          tagList: values.tagList || []
        }
      };

      if (article) {
        await http.put(`articles/${article.slug}`, payload);
      } else {
        await http.post('articles', payload);
      }
      navigate(router, '/');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card>
      <Title>{article ? 'Edit Article' : 'New Article'}</Title>
      <Form form={form} onValidSubmit={handleSubmit}>
        <Field
          name='title'
          as={Input}
          placeholder='Article Title'
          initialValue={article?.title}
          validate={(v: any) => (!v ? 'Title is required' : undefined)}
        />
        <Field
          name='description'
          as={Input}
          placeholder="What's this article about?"
          initialValue={article?.description}
          validate={(v: any) => (!v ? 'Description is required' : undefined)}
        />
        <Field
          name='body'
          as={Textarea}
          placeholder='Write your article...'
          initialValue={article?.body}
          validate={(v: any) => (!v ? 'Body is required' : undefined)}
        />
        <Field
          name='tagList'
          as={TagInput}
          placeholder='Add tags'
          initialValue={article?.tagList}
        />
        <Button type='submit'>
          {article ? 'Update Article' : 'Publish Article'}
        </Button>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 2: Verify Editor form renders and validates**

Run: `pnpm start`, navigate to `/editor`
Expected: Form shows with Input, Textarea, TagInput fields and Button; empty submit shows validation errors

- [ ] **Step 3: Commit**

```bash
git add src/views/Editor/index.tsx
git commit -m "feat: implement Article Editor with react-f0rm and haze-ui"
```

---

### Task 15: DevTool Refactor

**Files:**
- Rewrite: `src/components/DevTool.tsx`

- [ ] **Step 1: Rewrite DevTool with haze-ui components**

Replace the manual radio buttons and plain buttons with haze-ui `Button`, `Card`, `Radio`, `RadioGroup`. Keep react-f0rm `Field` integration minimal since DevTool has its own event system.

```tsx
/* eslint-disable no-underscore-dangle */
import * as ee from '@for-fun/event-emitter';
import {css} from '@linaria/core';
import {ReactNode, useEffect, useState} from 'react';
import {refresh} from '@native-router/core';
import {useInject, createMemoryCacheProvider} from 'react-toolroom/async';
import {Button, Card, Radio, RadioGroup, Title} from 'haze-ui';
import {fakerWhenNothing, schemaFaker} from '@/util/faker';
import Popover from './Popover';

type CacheProvider = ReturnType<typeof createMemoryCacheProvider>;

const emitter = ee.create();

let mockConfig = {} as Record<string, any>;

export function getMockConfigs() {
  return mockConfig;
}

export function getMockConfig(key: string) {
  return mockConfig[key];
}

export function setMockConfig(key: string, config: any) {
  mockConfig = {...mockConfig, [key]: config};
  ee.emit(emitter, 'change');
}

export function onMockConfigChange(cb: () => void) {
  return ee.on(emitter, 'change', cb);
}

type Props = {
  children: ReactNode;
};

function DevToolInner() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(getMockConfigs);

  useEffect(
    () =>
      onMockConfigChange(() => {
        setConfig(getMockConfigs);
      }),
    []
  );

  if (open) {
    return (
      <Popover
        x-class={css`
          width: 300px;
          height: 300px;
          top: 0;
          overflow: auto;
        `}
      >
        <Card>
          <Button onClick={() => setOpen(false)}>Close</Button>
          {Object.entries(config).map(([key, val]) => (
            <MockView
              key={key}
              name={key}
              value={val}
              onChange={(when) => setMockConfig(key, {...val, when})}
            />
          ))}
        </Card>
      </Popover>
    );
  }
  return (
    <Popover
      x-class={css`
        width: 30px;
        height: 30px;
        top: 0;
      `}
    >
      <Button onClick={() => setOpen(true)}>DEV</Button>
    </Popover>
  );
}

function MockView({
  name,
  value,
  onChange
}: {
  name: string;
  value: any;
  onChange?: (when: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <RadioGroup
        name={name}
        value={value.when}
        onChange={(when: string) => onChange?.(when)}
      >
        {['always', 'empty', 'disabled'].map((when) => (
          <Radio key={when} value={when}>
            {when}
          </Radio>
        ))}
      </RadioGroup>
      <Button onClick={value.refresh}>Refresh</Button>
      <Button onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'} Schema
      </Button>
      <pre x-if={show}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function DevTool({children}: Props) {
  return (
    <>
      {children}
      <DevToolInner />
    </>
  );
}

export function mockViewData<F extends (ctx: any) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string
): F {
  if (import.meta.env.PROD) return fn;

  return ((ctx) => {
    const config = getMockConfig(key);
    const {router, location} = ctx;

    const localConfig = {
      when: 'empty',
      ...config,
      type: 'viewData',
      location,
      schema,
      refresh: () => {
        console.log('refresh');
        refresh(router);
      }
    };

    setMockConfig(key, localConfig);

    if (localConfig.when === 'empty') {
      return fakerWhenNothing(fn, schema)(ctx);
    }

    if (localConfig.when === 'always') {
      return schemaFaker(schema);
    }

    return fn(ctx);
  }) as F;
}

export function useMock<F extends (...params: any[]) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string,
  cache?: Pick<CacheProvider, 'clear'>
) {
  useInject(fn, ((f: F) => {
    const config = getMockConfig(key);
    return (...args: Parameters<F>) => {
      const localConfig = {
        when: 'empty',
        ...config,
        type: 'async',
        location: null,
        schema,
        refresh: () => {
          cache?.clear();
          fn(...args);
        }
      };

      setMockConfig(key, localConfig);

      if (localConfig.when === 'always') {
        return schemaFaker(schema);
      }
      if (localConfig.when === 'empty') {
        return fakerWhenNothing(f, schema)(...args);
      }
      return f(...args);
    };
  }) as unknown as F);
}
```

- [ ] **Step 2: Verify DevTool renders correctly**

Run: `pnpm start`, click the DEV button
Expected: DevTool panel opens with Card, Radio group, and Button styling

- [ ] **Step 3: Commit**

```bash
git add src/components/DevTool.tsx
git commit -m "feat: refactor DevTool with haze-ui Button, Card, Radio"
```

---

### Task 16: Cleanup and Final Verification

- [ ] **Step 1: Remove unused `center` export from styles**

Check if `src/util/styles.tsx` is imported anywhere. If not, delete it.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit cleanup**

```bash
git add -A
git commit -m "chore: cleanup unused styles and verify build"
```
