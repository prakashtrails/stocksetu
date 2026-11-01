# StockSetu

Inventory and supply-chain platform for Indian F&B businesses (restaurants, cafés, bakeries, cloud kitchens) and their suppliers — one shared catalog, barcode-driven, web-first.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, TypeScript |
| Styling / motion | Tailwind CSS v4, `motion` (Framer Motion), `lucide-react` icons |
| Database / auth / files | Supabase — Postgres (Mumbai region), Auth, Storage; `@supabase/ssr` for cookie sessions |
| Planned | Kysely (typed SQL with transactions), Supabase CLI migrations, pgmq + pg_cron jobs, IndexedDB (Dexie) offline scan queue, Vitest + Playwright, Sentry, Vercel `bom1` |

Runtime: **Node 22+** (`@supabase/supabase-js` requires it; see `.nvmrc`).

## Structure

```
src/
  app/
    page.tsx                 landing page
    (auth)/login, signup     email + password auth
    auth/callback            email-confirmation (PKCE) handler
    auth/actions.ts          sign out
    dashboard/               protected app shell; one route per module
  components/
    landing/                 landing sections
    dashboard/               sidebar, mobile nav, user menu
    auth/, ui/               forms and primitives
  lib/
    supabase/                browser + server clients, env
    auth.ts                  getCurrentUser() — the one place that reads the session
    modules.ts               dashboard sections (each becomes a feature slice)
  proxy.ts                   session refresh + optimistic /dashboard redirect
```

Each dashboard module will be built as its own slice under `src/modules/<name>/` (pure domain logic + tests, DB queries, server actions), with the schema in `supabase/migrations/`.

## Run locally

```bash
cp .env.example .env.local   # add your Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:3000
```

Without Supabase keys the landing page works and `/dashboard` redirects to the login page with a setup notice.

In Supabase → Authentication → URL Configuration, set the Site URL and add `<your-origin>/auth/callback` to the redirect URLs.

## Scripts

`npm run dev` · `npm run build` · `npm run start` · `npm run lint` · `npx tsc --noEmit`
