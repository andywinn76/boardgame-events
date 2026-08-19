# CLAUDE.md

Project instructions for Claude Code. Keep this file short — everything here is loaded into
context on every session, so detail belongs in `docs/architecture.md`, not here.

## What this is

A board game event scheduling app. Users hold one account and can play, host, or both.
Hosts create events (date, time, venue, optional matching hints like complexity and game
weight); players RSVP against a seat limit or an unlimited event. Events support co-hosts.

## Stack

- Next.js (App Router), **JavaScript — not TypeScript**. Do not add `.ts`/`.tsx` files or
  suggest converting.
- Tailwind for styling. No component library unless asked.
- Supabase: Postgres + Auth + Storage + Edge Functions.
- `@supabase/ssr` for server-side auth. Not the deprecated auth-helpers packages.

## Commands

```bash
npm run dev              # local dev server
npm run lint
npx supabase db push     # apply migrations to the linked hosted project
npx supabase migration new <name>
```

There is **no local Supabase stack** — Docker isn't available on this machine. Never suggest
`supabase start`, `supabase db reset`, or anything requiring the local containers. All schema
changes go through migration files applied to the hosted project.

## Schema

Full schema, RLS policies, and RPCs live in `docs/architecture.md`. Read it before touching
anything database-related. Migrations are in `supabase/migrations/` and are the source of
truth — never edit tables through the dashboard.

## Architecture rules

These are decided. Don't relitigate them in code review or suggestions.

1. **RLS on every table**, no exceptions. New table means a new policy in the same migration.
2. **Roles live in `user_roles`**, never as a column on `profiles`. Check them through the
   `has_role(uuid, app_role)` security-definer helper.
3. **Writes that need invariants go through RPCs, not client inserts.** RSVP in particular
   uses `rsvp_to_event()` with a `SELECT ... FOR UPDATE` row lock — a direct insert into
   `rsvps` from the client can oversell the last seat.
4. **Exact street addresses never appear on the `events` row.** Events carry a coarse public
   layer (`location_label`, `neighborhood`, `cross_streets`, `city`, jittered `approx_lat/lng`).
   Exact address lives on the RLS-locked `venues` row, readable only by hosts and RSVP'd users.
5. **`seat_limit IS NULL` means unlimited.** Don't introduce a sentinel value or a second flag.
6. **User considerations are individual rows with per-item `visibility`**, not a JSON blob.
   Never render them as a per-person list in the UI — the host console shows an aggregated,
   de-duplicated digest.
7. **Timestamps are `timestamptz`; render in the event's `timezone`, not the viewer's.**
   A 7pm game night is 7pm local no matter who's looking at it.

## Code conventions

- Server Components for reads; Server Actions or RPCs for writes. Client Components only where
  interactivity requires it (`'use client'` as late in the tree as possible).
- Supabase clients: `lib/supabase/server.js` and `lib/supabase/client.js`. Don't instantiate
  clients inline.
- Uses Supabase's newer API key names: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (client-safe) and
  `SUPABASE_SECRET_KEY` (server-only, equivalent to the legacy service role key). Never
  reference `SUPABASE_SECRET_KEY` in a Client Component and never prefix it with `NEXT_PUBLIC_`.
- Prefer `date-fns` over adding a heavier date library.
- Keep files small; colocate route-specific components under the route folder.

## When you're unsure

Ask before: adding a dependency, changing a table that already has a migration, or introducing
a new pattern for data fetching. Schema changes always land as a new migration file, never as
an edit to an applied one.
