# Inventory Management — Web (Next.js)

Customer-facing app for businesses (owners, managers, cashiers, stock keepers).
**Next.js (App Router) + TypeScript + Tailwind**, talking to the NestJS API.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires the API (`../api`) on :3000 — `/api` is proxied to it via
`next.config.mjs` (override with `API_URL` in `.env`). Log in with the seeded
demo account `owner@demo.com` / `password123`, or register a new business.

## Theming — change the brand color in ONE place

All colors are CSS variables in [src/index.css](src/index.css) (imported by the
root layout). Change `--primary` (and its `.dark` value) to re-brand the whole
app. Light/dark is toggled by the sun/moon button in the top bar.

## Structure (App Router)

```
src/
  app/                 Next.js routes
    layout.tsx         root layout (html/body + Providers)
    providers.tsx      QueryClient + Theme + Toast + Auth (client)
    login/, register/  public auth pages
    (app)/             authenticated group
      layout.tsx       auth gate + AppLayout shell (sidebar/topbar)
      page.tsx         dashboard (/)
      analytics/, pos/, sales/, products/, categories/, inventory/,
      suppliers/, purchases/, customers/, users/, settings/
  screens/             page components (rendered by the routes above)
  components/ui/        reusable primitives
  components/layout/    sidebar / topbar shell
  auth/                 AuthContext (client)
  theme/                light/dark ThemeProvider
  hooks/, lib/, api/, types.ts
```

> Note: the page components live in `src/screens/` (not `src/pages/`) because
> Next.js reserves `pages/` for the legacy Pages Router. Routes under
> `src/app/**` render them.

Each route file is a thin server component that renders a `'use client'`
screen, e.g. `app/(app)/products/page.tsx` → `screens/ProductsPage`.

