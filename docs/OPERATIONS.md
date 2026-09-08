# Shop POS — Operations Guide

_Audience: whoever configures, deploys and keeps this running. Last updated:
2026-08-31._

Companion documents: [TECHNICAL.md](TECHNICAL.md) (architecture),
[API.md](API.md) (endpoints), [bridge/README.md](../bridge/README.md) (printer setup
and troubleshooting).

---

## 1. What has to be running

| Component | Where it runs | Required for |
| --------- | ------------- | ------------ |
| PostgreSQL | Managed (Neon) or Docker locally | Everything |
| Backend | Any Node 20 host or container | Everything |
| Frontend | Any Node 20 host, or a static/Next host | The tills |
| Print bridge | The counter PC the printer is paired to, per shop | Thermal receipt printing only |

The bridge is optional per shop: without it the POS falls back to the browser print
dialog. Everything else is required.

---

## 2. Configuration

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `development` enables SQL logging. It no longer affects the schema — see `DB_SYNCHRONIZE` |
| `DB_SYNCHRONIZE` | unset (off) | `true` lets TypeORM reshape the schema from the entities on boot. **Only for a throwaway database** — it will drop a column an entity has stopped declaring |
| `PORT` | `5000` | HTTP port |
| `APP_TIMEZONE` | `Asia/Dhaka` | Business timezone for all day/month report boundaries |
| `DATABASE_URL` | — | Postgres connection string (preferred). SSL is enabled automatically for Neon or when the URL carries `sslmode=require` |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | `localhost` / `5432` / `postgres` / `postgres` / `shop_pos` | Fallback connection settings, used only when `DATABASE_URL` is unset |
| `DB_SSL` | — | `true` forces SSL when using the individual variables |
| `CORS_ORIGINS` | unset (localhost) | **Set this in production.** Comma-separated origins allowed to call the API. Unset falls back to `localhost:5001` / `localhost:3001`, so a deployed frontend is CORS-blocked |
| `JWT_SECRET` | — | **Set this.** Token signing key; a long random string |
| `JWT_EXPIRES_IN` | `1d` | Token lifetime |
| `SUPER_ADMIN_NAME` / `_EMAIL` / `_PASSWORD` | `Platform Admin` / `admin@shop-pos.local` / `admin123` | Platform administrator seeded on startup |
| `SEED_SHOP_NAME` / `_SLUG` / `_ADDRESS` / `_PHONE` | `Demo Shop` / `demo-shop` / — / — | Demo shop seeded on first run |
| `OWNER_NAME` / `OWNER_EMAIL` / `OWNER_PASSWORD` | `Shop Owner` / `owner@shop.local` / `owner123` | Owner account for the seeded shop |

### Frontend (`frontend/.env.local`)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Backend base URL |
| `NEXT_PUBLIC_LOCAL_BRIDGE_URL` | `http://127.0.0.1:9110` | Local print bridge fast path; must stay a loopback address |

Both are compiled into the client bundle at build time — rebuild after changing them,
and never put a secret in a `NEXT_PUBLIC_` variable.

### Print bridge (`bridge/.env`)

Full table with printer-specific guidance in [bridge/README.md](../bridge/README.md).
The essentials: `API_URL`, `BRIDGE_EMAIL` / `BRIDGE_PASSWORD` (a dedicated shop user),
`PRINTER_PORT` (`COM3`, `/dev/rfcomm0`, …), `PRINTER_BAUD`, `PRINTER_COLUMNS` (32 for
58 mm paper), `POLL_INTERVAL_MS`, `STATION_NAME`, `LOCAL_PORT`.

---

## 3. Local development

```bash
# Database (skip if using a hosted Postgres)
cd backend
docker compose up -d           # postgres:16-alpine, volume shop_pos_data, TZ Asia/Dhaka

# Backend
npm install
cp .env.example .env           # set DATABASE_URL and JWT_SECRET
npm run start:dev              # http://localhost:5000, Swagger at /docs

# Frontend
cd ../frontend
npm install
npm run dev                    # http://localhost:5001
```

`docker-compose.yml` publishes the container's 5432 on `${DB_PORT:-5432}`. If another
Postgres already owns 5432 on the machine, set `DB_PORT=5433` in `backend/.env` before
`docker compose up`.

### Seeding

Seeding runs **automatically on every backend startup** (`main.ts` calls `runSeeder`)
and is idempotent: each step is skipped if the record already exists, and a seeding
failure logs but does not stop the process. It creates the platform administrator, the
demo shop, and that shop's owner. `npm run seed` runs the same logic standalone.

Change the seeded passwords before exposing the deployment to anyone. In development
the schema is created by TypeORM `synchronize`; in production, run migrations first
(§4) so there is a schema to seed into.

---

## 3a. Demo data for trying the app out

`npm run seed:demo` fills the **demo shop** with a plausible five months of trading so
every screen has something real in it: a 16-item menu, ~2,300 settled orders, expenses
across five months, and today left mid-service — a table two rounds in, one waiting too
long, one paid but still cooking, one served and unpaid, a counter order, plus a voided
and a refunded order on the record.

```bash
cd backend
npm run seed:demo
```

It takes about 20 seconds. Logins it reports:

| Role | Email | Password |
| ---- | ----- | -------- |
| Shop owner | `owner@shop.local` | `owner123` |
| Staff (waiter) | `staff@shop.local` | `staff123` |

Two things to know:

- **It clears the demo shop's trading data first**, so re-running gives the same result
  rather than piling up. Menu, orders, expenses and their categories are replaced; user
  accounts are left alone.
- **It refuses to run against a real shop.** It only writes to the shop named by
  `SEED_SHOP_SLUG` (default `demo-shop`), and the slugs of the live shops are hard-coded
  as protected, so pointing the variable at one aborts instead.

> The browser verification scripts also work in the demo shop and clear it when they
> start, so re-run `npm run seed:demo` afterwards to get the demo data back.

## 3b. The paid/served backfill

The dine-in change added `is_paid` / `is_served` to `orders`, defaulting to **false**.
Orders recorded before it were rung up under the old flow, where saving a sale meant
the money had been taken and the food served — so on any environment that has existing
orders they have to be backfilled, or they read as unpaid and drop out of every sales
figure.

**This is no longer a manual step.** It is carried by the `BaselineGaps` migration,
which runs it only where that migration added the columns itself. Where the columns
already existed, `is_paid = false` means "this table's bill is still open" and marking
those paid would be corruption rather than a backfill, so it is skipped. The migration
logs which of the two it did.

Voided and refunded orders are deliberately left alone: they are excluded from takings
by status either way.

For reference, the equivalent by hand:

```sql
update orders
   set is_paid = true, paid_at = created_at,
       is_served = true, served_at = created_at
 where is_paid = false
   and status = 'COMPLETED';
```

## 4. Schema management

**Migrations are the only way the schema changes.** `synchronize` is off unless
`DB_SYNCHRONIZE=true` is set explicitly — it used to be on whenever `NODE_ENV` was not
exactly `production`, which meant one unset variable on a server was enough to let a
deploy reshape the live database and drop any column an entity had stopped declaring.

```bash
cd backend
npm run migration:run                                        # apply pending
npm run migration:show                                       # what is applied
npm run migration:generate -- src/migrations/WhatChanged      # after editing entities
npm run migration:revert                                     # roll back the last one
```

Run `migration:run` **before** starting the app against a new database — nothing
creates the schema for you any more. Migrations live in `src/migrations/` and are
picked up by `src/data-source.ts`, which shares one connection config with the app.

### The baseline migration

`InitialSchema` is the schema as it stood when migrations were introduced: 10 tables,
5 enums, 12 indexes, 14 foreign keys, and the `uuid-ossp` extension that its
primary-key defaults need. It was generated against an empty schema and verified by
building a database from nothing and reverting it again. Its CREATE TABLE statements
are **not** conditional, so pointed at a database that already has those tables it
fails on the first one.

A database that predates migrations therefore needs `InitialSchema` **recorded as
applied rather than executed**, and `scripts/mark-baseline.sql` does that by looking at
the database instead of asking you to remember which kind you are pointed at:

```bash
cd backend
psql "$DATABASE_URL" -f scripts/mark-baseline.sql   # once, before the first migration:run
```

It inserts the baseline row only where the tables already exist, does nothing to an
empty database, is safe to run twice, and prints which of the two paths it took.

### Filling the gaps: `BaselineGaps`

Recording the baseline assumes the old database really has the baseline's shape, and
that is not always true. Until this release the connection used
`synchronize: !isProduction`, so a server running with `NODE_ENV=production` never had
the entities applied to it at all — the printing tables and the dine-in columns on
`orders` only ever appeared on environments where synchronize happened to be on.

`BaselineGaps` closes that. Every statement in it is conditional
(`IF NOT EXISTS`, guarded `DO` blocks), so it fills in what a given database is
actually missing and does nothing where the objects are already there. It does not
matter whether the target got its schema from synchronize, from a half-finished deploy,
or from `InitialSchema` a moment earlier. It also carries the paid/served backfill
(§3b).

To confirm where a database stands, before or after:

```bash
psql "$DATABASE_URL" -f scripts/check-schema.sql    # read-only
```

The definitive check that a database matches the entities is
`npm run migration:generate -- src/migrations/Drift` pointed at it: if it produces an
empty migration, there is no drift. Delete the generated file either way.

### Changing the schema from here

1. Edit the entity.
2. `npm run migration:generate -- src/migrations/WhatChanged`. It diffs the entities
   against whatever the connection points at, so point it at an up-to-date database.
3. **Read the generated SQL.** A generator that has decided to drop a column will say
   so plainly, and that is the moment to catch it.
4. `npm run migration:run`, then commit the file.

---

## 5. Deployment

### Backend

A multi-stage `Dockerfile` is provided. Its entrypoint is `npm run release`, which
applies migrations and only then starts the app, so a failing migration fails the
release instead of leaving new code running against an old schema:

```bash
cd backend
docker build -t shop-pos-backend .
docker run -p 5000:5000 --env-file .env shop-pos-backend
```

The migration step runs from the compiled `dist/data-source.js`
(`npm run migration:run:prod`). The `migration:run` used in development cannot run in
the image: it goes through `typeorm-ts-node-commonjs` against `src/data-source.ts`, and
the image has neither `ts-node` (a dev dependency) nor `src/`. The `:prod` variants of
`migration:run`, `migration:show` and `migration:revert` exist for that reason — use
them anywhere the app is running from `dist`.

Without Docker: `npm ci && npm run build && npm run release`.

### First deploy against an existing database

The container migrates itself, but a database that predates migrations needs the
baseline recorded **once, first**, or `InitialSchema` will try to create tables that
are already there (§4):

```bash
cd backend
psql "$DATABASE_URL" -f scripts/check-schema.sql    # see where it stands
psql "$DATABASE_URL" -f scripts/mark-baseline.sql   # once per such database
# then deploy as normal; BaselineGaps fills any gaps and backfills paid/served
psql "$DATABASE_URL" -f scripts/check-schema.sql    # confirm
```

Take a backup before the first migrating deploy (§8). Nothing here drops data, but
`mark-baseline.sql` is the one step whose effect depends on the state it finds, and a
restore point costs nothing.

Checklist before going live:

- [ ] Backup taken of the target database
- [ ] `NODE_ENV=production` (quietens SQL logging)
- [ ] `DB_SYNCHRONIZE` unset or `false` — the one setting that can destroy data
- [ ] `scripts/mark-baseline.sql` run, if the database predates migrations
- [ ] Migrations applied: `npm run migration:show:prod` lists both as `[X]`
- [ ] `scripts/check-schema.sql` shows no MISSING rows and a plausible
      `completed_but_unpaid` count
- [ ] `JWT_SECRET` set to a long random value, unique per environment
- [ ] `DATABASE_URL` pointing at the managed database, with SSL
- [ ] `CORS_ORIGINS` set to the frontend's origin — unset falls back to localhost, so
      the deployed frontend will be CORS-blocked
- [ ] `SUPER_ADMIN_PASSWORD` and `OWNER_PASSWORD` set to your own values, at least 10
      characters and not a published default — the seeder now skips those accounts
      rather than creating them with a known password
- [ ] `APP_TIMEZONE` matches the shops' business timezone
- [ ] TLS terminated in front of the API — tokens travel in the `Authorization` header

### Frontend

```bash
cd frontend
npm ci && npm run build && npm start
```

Set `NEXT_PUBLIC_API_URL` at build time. Any Next.js-capable host works.

Serving the frontend over HTTPS while the local bridge listens on plain HTTP
(`127.0.0.1:9110`) means browsers treat only the loopback fast path as insecure; if a
till blocks it, that till simply uses the queued route instead, which is correct
behaviour rather than a fault to fix.

### Print bridge

Per shop, on the PC the printer is paired to. It must keep running for queued slips to
print. On Windows, a scheduled task at logon is the simplest durable option:

```
schtasks /create /tn "Shop POS Print Bridge" /tr "node C:\path\to\bridge\src\index.js" /sc onlogon
```

[NSSM](https://nssm.cc/) wraps the same command as a proper service. Full pairing and
port-discovery steps are in [bridge/README.md](../bridge/README.md).

---

## 6. Onboarding a new shop

1. Sign in as the platform administrator.
2. **Shops → Add shop**: name, slug, address, phone, plus the owner's name, email and
   password. Equivalent to `POST /shops`. The address is what prints on receipts.
3. Hand the owner their credentials; they sign in and are taken to the POS.
4. The owner builds the menu (**Menu**) and adds staff accounts (**Staff**).
5. If the shop has a thermal printer: create a dedicated station user (for example
   `printer@theirshop.local`) under **Staff**, then install and configure the bridge on
   their counter PC with those credentials.

To stop a shop trading without destroying its data, `PATCH /shops/:id` with
`isActive: false` — every user of that shop is then refused at login. Deleting a shop
is irreversible and cascades to all of its data.

---

## 7. Monitoring

| Signal | How |
| ------ | --- |
| Backend liveness | `GET /health` (public, unauthenticated) |
| Printer reachability | `GET /print-jobs/printer-status` per shop — `online`, `lastSeenAt`, `lastError`, `pendingJobs` |
| Print failures | `GET /print-jobs?status=FAILED` — each carries the last `error` |
| Backend logs | stdout; failed print attempts are logged with the attempt count |

A rising `pendingJobs` with a stale `lastSeenAt` means the bridge is down. Slips still
pending after 10 minutes are failed automatically rather than printed late.

---

## 8. Backups

All state lives in PostgreSQL; the backend and bridge hold nothing durable.

- **Managed (Neon):** enable point-in-time restore on the project and confirm the
  retention window is acceptable for a business's sales records.
- **Self-hosted / Docker:** `pg_dump` on a schedule, stored off the machine.
  ```bash
  docker exec shop-pos-db pg_dump -U postgres shop_pos > shop-pos-$(date +%F).sql
  ```
  The Docker volume `shop_pos_data` survives container recreation, but it is not a
  backup — it lives on the same disk.

Restores should be rehearsed at least once before they are needed. Sales history is the
one thing here that cannot be reconstructed.

---

## 9. Runbook

**API returns 500 after a reboot (local development).** The Postgres container is
stopped. `cd backend && docker compose up -d`. Data is preserved in the volume.

**Everyone is logged out / every request returns 401.** `JWT_SECRET` changed, so
previously issued tokens no longer verify. Expected after a rotation — users sign in
again. Otherwise check the token has not simply expired (`JWT_EXPIRES_IN`, default one
day).

**A user gets 403 "Your account is not attached to a shop".** The account has no
`shop_id`. Only a platform administrator should be in that state; if it is a shop user,
the record was created outside the normal flow — attach it to the right shop.

**A platform admin gets 403 on a shop page.** Working as designed: administrators have
no shop and cannot read shop data. Sign in as that shop's owner.

**An owner cannot log in.** Check `isActive` on both the user *and* their shop — a
suspended shop refuses all of its users.

**Nothing prints, no error shown.** The bridge is not running, or is signed in as a
user from a different shop. Check the bridge console and `printer-status`.

**Slips print twice.** Two bridges are claiming for the same shop. Claims are exclusive
per job, so this means a second station was configured; stop one. The `print_stations`
row is per shop, so the newest check-in silently takes over the status display.

**Receipts show `?` instead of Bengali/Arabic text.** A text-mode ESC/POS limitation,
not a misconfiguration — see [bridge/README.md](../bridge/README.md) for what changing
it would require.

**Reports look off by a day.** `APP_TIMEZONE` does not match the shop's business
timezone; boundaries are computed in that zone, not the server's.

---

## 10. Security posture

- Passwords are bcrypt-hashed and never returned by any endpoint: the column is
  `select: false` and additionally `@Exclude()`ed from serialization.
- Every route requires a valid token unless explicitly `@Public()` (login, `/health`,
  the root banner).
- Tenant isolation is enforced in three independent layers — token, per-query scoping,
  and a global backstop guard. See [TECHNICAL.md §4](TECHNICAL.md#4-multi-tenancy).
- Request bodies are whitelisted: unknown properties are rejected, not ignored.
- Users are reloaded from the database on every request, so deactivating an account or
  suspending a shop takes effect immediately rather than at token expiry.

Outstanding items worth addressing before wide deployment: restrict CORS to known
origins, add rate limiting on `POST /auth/login`, rotate the seeded default passwords,
and add refresh tokens so `JWT_EXPIRES_IN` can be shortened without signing people out
mid-shift.
