# haze-ui + react-f0rm Integration Design

Date: 2026-05-28

## Overview

Full rewrite of the painless RealWorld demo app to integrate two author-owned packages:
- **haze-ui** (v1.6.0): React component library with 83+ components, Linaria-based, theme token system
- **react-f0rm** (v0.2.1): Event-driven form library with hooks and components

Replace all plain HTML elements with haze-ui components, add auth/article/comment forms using react-f0rm, and add new routes for login, register, and editor.

## Approach

Layer-first: establish foundation (theme, layout, navigation), then rewrite pages top-down. Each page is a complete unit.

## Layer 1: Foundation

### Entry Point (`src/index.tsx`)
- Import `haze-ui/styles.css` for component styles
- Apply `lightTheme` token class to the root wrapper
- Keep DevTool wrapping in dev mode

### Router Config (`src/views/index.tsx`)
- Keep `HistoryRouter` from `@native-router/react`
- Add new lazy-loaded routes:
  - `/login` → Login view
  - `/register` → Register view
  - `/editor` → Editor view (new article)
  - `/editor/:slug` → Editor view (edit article)
- Existing routes unchanged

## Layer 2: Layout + Navigation

### Layout (`src/views/Layout/index.tsx`)
- Replace `<header>/<nav>/<ul>/<li>` with `NavigationBar` + `NavLink` from haze-ui
- Use `Container` for content width constraint
- Use `Text`/`Title` for the app title
- Use `Button` for any action elements
- `<View />` outlet stays as-is (from @native-router)

### RouterError (`src/components/RouterError.tsx`)
- Use `Card` for error container
- Use `Title` + `Text` for error message
- Use `Button` for refresh action

## Layer 3: Existing Pages Rewrite

### Home (`src/views/Home/index.tsx`)
- `Card` for article cards with `Title`, `Text`, `Badge` for tags
- `Avatar` for author images
- `Flex` for article layout
- `Button` for "Read more" actions
- Keep `PreviewLink` integration

### Tags (`src/views/Home/Tags.tsx`)
- `TagGroup` + `TagGroupItem` for tag display
- `Spinner` for loading state
- `Alert` for error state
- `Skeleton` for loading placeholder

### Article (`src/views/Article/index.tsx`)
- `Card`, `Title`, `Text`, `Avatar`, `Badge`
- `Divider` between sections
- Comment form integration (see Layer 4)

### CommentList (`src/views/Article/CommentList.tsx`)
- `List`/`ListItem` for comments
- `Avatar` for comment authors
- `Spinner`/`Skeleton` for loading
- `Alert` for errors

### Help + About (`src/views/Help/index.tsx`, `src/views/About/index.tsx`)
- `Card`, `Title`, `Text`/`Paragraph`

## Layer 4: Forms with react-f0rm

### Pattern
All forms follow this pattern:
- `Form` component from react-f0rm as wrapper
- `useForm` hook for form instance
- `Field` with `as={haze-ui-component}` for inputs
- `Card` as visual container
- `Button` from haze-ui for submit
- `onValidSubmit` handler calls API via `@/util/http`

### Login (`src/views/Login/index.tsx`) — route: `/login`
- `Field` + `as={Input}` for email (validation: required, email format)
- `Field` + `as={Input}` for password (validation: required)
- `Button` for submit
- `Card` container

### Register (`src/views/Register/index.tsx`) — route: `/register`
- `Field` + `as={Input}` for username (validation: required)
- `Field` + `as={Input}` for email (validation: required, email format)
- `Field` + `as={Input}` for password (validation: required, min length)
- `Button` for submit
- `Card` container

### Article Editor (`src/views/Editor/index.tsx`) — routes: `/editor`, `/editor/:slug`
- `Field` + `as={Input}` for title (validation: required)
- `Field` + `as={Input}` for description (validation: required)
- `Field` + `as={Textarea}` for body (validation: required)
- `Field` + `as={TagInput}` for tags
- `Button` for submit
- `Card` container

### Comment Form (embedded in `src/views/Article/index.tsx`)
- `Form` + `useForm` from react-f0rm
- `Field` + `as={Textarea}` for comment body (validation: required)
- `Button` for submit
- Inline below article, above comment list

### DevTool Refactor (`src/components/DevTool.tsx`)
- Replace manual radio buttons with `Field` + `RadioGroup`/`Radio` from haze-ui through react-f0rm
- Use `Button` from haze-ui for action buttons
- Use `Card` for the panel container

## Component Mapping (HTML → haze-ui)

| Current HTML | haze-ui Replacement |
|-------------|---------------------|
| `<div>` (card-like) | `Card` |
| `<h1>/<h2>/<h3>` | `Title` |
| `<p>` | `Text` or `Paragraph` |
| `<button>` | `Button` |
| `<input>` | `Input` (via `Field` from react-f0rm) |
| `<textarea>` | `Textarea` (via `Field` from react-f0rm) |
| `<ul>/<li>` (list) | `List`/`ListItem` |
| `<ul>/<li>` (tags) | `TagGroup`/`TagGroupItem` |
| `<nav>` | `NavigationBar` |
| `<aside>` | `Card` or semantic `<aside>` with haze-ui styling |
| `<img>` (avatar) | `Avatar` |
| `<section>` | `Container` or `Flex` |
| Loading text | `Spinner` or `Skeleton` |
| Error text | `Alert` |

## Shared Utilities

- `src/util/http.ts` — keep as-is, used by form submit handlers
- `src/util/styles.tsx` — replace `center` class with haze-ui `Flex` component
- `src/util/faker.ts` — keep as-is, used by DevTool
- `src/types/` — keep as-is, domain types unchanged
- `src/services/article.ts` — keep as-is, add auth/article service functions as needed

## Dependencies to Add

None — both haze-ui and react-f0rm are already in package.json.

## Files to Create

- `src/views/Login/index.tsx`
- `src/views/Register/index.tsx`
- `src/views/Editor/index.tsx`
- `src/services/auth.ts` (login/register API calls)
- `src/typings/react-f0rm.d.ts` (type declarations, since v0.2.1 lacks .d.ts files)

## Files to Modify

- `src/index.tsx` — add haze-ui CSS import + theme
- `src/views/index.tsx` — add new routes
- `src/views/Layout/index.tsx` — full rewrite with haze-ui
- `src/views/Home/index.tsx` — full rewrite with haze-ui
- `src/views/Home/Tags.tsx` — full rewrite with haze-ui
- `src/views/Article/index.tsx` — rewrite + add comment form
- `src/views/Article/CommentList.tsx` — rewrite with haze-ui
- `src/views/Help/index.tsx` — rewrite with haze-ui
- `src/views/About/index.tsx` — rewrite with haze-ui
- `src/components/DevTool.tsx` — refactor with react-f0rm + haze-ui
- `src/components/RouterError.tsx` — rewrite with haze-ui
