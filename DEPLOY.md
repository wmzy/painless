# Deployment Guide

Painless can be deployed to various platforms with zero configuration.

## Quick Deploy

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod
```

Or connect your GitHub repository to Netlify for automatic deployments.

### Static Hosting

Painless outputs static files to `dist/` directory.

```bash
pnpm build
# Output in dist/
```

Upload the `dist` folder to any static hosting:

- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront
- Google Cloud Storage

## SPA Routing

Painless uses Native Router for client-side routing. Ensure your server redirects all routes to `index.html`.

### Vercel (vercel.json)

```json
{
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist"
}
```

### Netlify (netlify.toml)

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### GitHub Pages

Add to `package.json`:

```json
{
  "scripts": {
    "deploy": "pnpm build && gh-pages -d dist"
  }
}
```

## Environment Variables

Create `.env` files:

```bash
# .env.development
VITE_API_URL=http://localhost:3000

# .env.production  
VITE_API_URL=https://api.example.com
```

Access in code:

```ts
const apiUrl = import.meta.env.VITE_API_URL;
```

## Build Optimization

### Performance

```bash
# Analyze bundle
pnpm build --report
```

### Lazy Loading

Native Router automatically code-splits routes:

```tsx
const routes = [
  {
    path: '/heavy',
    component: () => import('./HeavyPage') // Lazy loaded
  }
];
```

## Troubleshooting

### Blank Page on Refresh

Ensure your static server is configured to serve `index.html` for all routes.

### 404 on Subpages

Configure your hosting platform to redirect all routes to `index.html`.
