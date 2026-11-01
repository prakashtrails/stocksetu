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

## Fresh hosted Supabase project

The active hosted project is **StockSetu** in `prakashtrails's Org`, Mumbai (`ap-south-1`): [Supabase dashboard](https://supabase.com/dashboard/project/cruvlzqzhyvldoocwrrt). Its project ref is `cruvlzqzhyvldoocwrrt`.

All four files in `supabase/migrations/` have been applied to this new project. The hosted database starts without demo users or demo stock. To connect a local checkout, set these values in the ignored `.env.local` file:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://cruvlzqzhyvldoocwrrt.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from Project Settings → API Keys>
```

Each developer needs their own `.env.local`. Never put a secret or service-role key in a `NEXT_PUBLIC_` variable. For email confirmation locally, add `http://localhost:3000/auth/callback` to the project's Auth redirect URLs.

For future database changes, add a timestamped migration under `supabase/migrations/`, then run `npx supabase link --project-ref cruvlzqzhyvldoocwrrt`, `npx supabase db push --dry-run`, and `npx supabase db push`.

Do **not** run `db push --include-seed` on this hosted project. `supabase/seed.sql`, `supabase/seed_haldiram.sql`, and the generated `deploy-*.sql` files contain demo accounts with known passwords and belong only in isolated demo/test databases.
