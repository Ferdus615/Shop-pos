# Shop POS — Technical Documentation

_Audience: developers working on the codebase. Last updated: 2026-09-09._

Companion documents: [API.md](API.md) (endpoint reference),
[OPERATIONS.md](OPERATIONS.md) (configuration and deployment),
[STATUS.md](STATUS.md) (what is built).

---

## 1. Overview

Shop POS is a multi-tenant point-of-sale platform. One deployment serves many
independent shops. It consists of three deployables:

- **Backend** (`backend/`) — a NestJS REST API holding all business rules: menu
  management, order pricing, sales and expense reporting, user management, tenant
  isolation, and the print-job queue.
- **Frontend** (`frontend/`) — a Next.js app used as the till, plus owner-only
  management screens and a platform-admin screen for shops.
- **Print bridge** (`bridge/`) — a small Node process on a shop's counter PC that owns
  the Bluetooth thermal printer and drains that shop's print queue.

The backend is the only component that talks to the database. The frontend and the
bridge are both ordinary API clients authenticated with the same JWT scheme.

---

## 2. Tech stack

| Concern | Choice | Notes |
| ------- | ------ | ----- |
| Language | TypeScript | `nodenext` module resolution |
| API framework | NestJS 11 | One module per feature |
| Database | PostgreSQL 16 | Neon in deployment; any Postgres locally |
| ORM | TypeORM | Entities + repositories; `synchronize` in dev, migrations in prod |
| Auth | `@nestjs/jwt` + `passport-jwt` | Bearer tokens, stateless |
| Password hashing | `bcryptjs` | Pure JS, no native build step |
| Validation | `class-validator` / `class-transformer` | Global `ValidationPipe`, whitelist + reject unknown |
| API docs | `@nestjs/swagger` | Served at `/docs` |
| Frontend | Next.js 16 (App Router), React 19 | Client-side auth, no server session |
| Frontend data | TanStack Query + axios | Query cache keyed in `src/lib/hooks.ts` |
| UI | Tailwind CSS 4, shadcn/ui, sonner, next-themes | Light and dark themes |
| Bridge | Node 18+, `serialport` | ESC/POS over a Bluetooth-backed serial port |

---

## 3. Project structure

```
shop-pos/
├── backend/
│   ├── Dockerfile                    # multi-stage build -> node dist/main
│   ├── docker-compose.yml            # local PostgreSQL
│   └── src/
│       ├── main.ts                   # bootstrap: TZ, seeding, CORS, ValidationPipe, Swagger
│       ├── app.module.ts             # config, TypeORM, three global guards, serializer
│       ├── data-source.ts            # standalone DataSource for the TypeORM CLI
│       ├── seed.ts                   # platform admin + demo shop + owner (idempotent)
│       ├── config/data-source-options.ts   # single source of DB connection settings
│       ├── common/
│       │   ├── enums/                # Role, PaymentMethod, OrderStatus, PrintJob{Status,Type}
│       │   ├── decorators/           # @Public, @Roles, @NoShopRequired, @CurrentUser, @CurrentShop
│       │   ├── guards/               # JwtAuthGuard, RolesGuard, ShopContextGuard
│       │   ├── transformers/         # numeric <-> number
│       │   └── utils/date.util.ts    # timezone-aware day/month ranges, round2
│       ├── shops/                    # tenants; platform-admin only
│       ├── users/                    # shop staff/owner accounts
│       ├── auth/                     # login, JWT strategy, /auth/me
│       ├── menu/                     # MenuCategory + MenuItem
│       ├── orders/                   # Order + OrderItem, void/refund, sales summary
│       ├── printing/                 # PrintJob + PrintStation queue
│       ├── expenses/                 # Expense + ExpenseItem + ExpenseCategory
│       └── dashboard/                # composed owner snapshot
├── frontend/src/
│   ├── app/
│   │   ├── login/page.tsx
│   │   └── (app)/                    # authenticated shell
│   │       ├── pos/                  # till
│   │       ├── tables/               # open-tables floor view (owner + staff)
│   │       ├── sales/                # daily sales (owner)
│   │       ├── menu/                 # menu CRUD (owner)
│   │       ├── dashboard/            # day/month/year overview + trend (owner)
│   │       ├── expenses/             # day view, item catalogue, basket (owner)
│   │       ├── staff/                # shop users (owner)
│   │       └── admin/shops/          # tenants (platform admin)
│   ├── components/                   # app-shell, providers, theme-toggle, ui/
│   └── lib/                          # api, auth-context, hooks, types, format,
│                                     # print-bridge, receipt-printer
└── bridge/src/                       # index (loop), api, printer, render, probe, config
```

Each backend feature is self-contained: entities, DTOs, service, controller, module.

---

## 4. Multi-tenancy

A **Shop** is the tenant. Every row of trading data — menu categories and items, orders
and order items, expenses and expense categories, users, print jobs and print stations
— carries a `shop_id` and is never readable from another shop.

Tenant identity comes from the **token, never from the request body or a query
parameter**. A client cannot ask for another shop's data because it has no way to name
one.

Three layers enforce this:

1. **The JWT payload carries `shopId`.** It is set at login from the authenticated
   user's own `shop_id` and re-validated on every request by `JwtStrategy`, which
   reloads the user and rejects inactive accounts.
2. **Services filter by `shopId` in every query.** Reads, writes and lookups all take
   the shop as an explicit argument (`ordersService.create(dto, userId, shopId)`), and
   controllers supply it from `@CurrentShop()`. An id belonging to another shop simply
   is not found — which surfaces as a 404, never as cross-tenant data.
3. **`ShopContextGuard` is a backstop.** It runs last of the three global guards and
   refuses any request that would reach a handler without a tenant to scope it to. It
   cannot see queries; what it guarantees is that a missing `shopId` becomes a `403`
   rather than a query that silently spans every shop.

### Roles

| Role | Belongs to a shop | Purpose |
| ---- | :---------------: | ------- |
| `SUPER_ADMIN` | No | Platform operator: creates, edits and suspends shops and their owner accounts. Has **no** access to any shop's trading data. |
| `OWNER` | Yes | Full access within one shop, including reports, expenses and staff. |
| `STAFF` | Yes | Ring up sales and read the menu. No reports, no price edits, no expenses. |

`ShopContextGuard` enforces the separation in both directions: a `SUPER_ADMIN` reaching
a shop route is rejected ("Platform administrators cannot access shop data"), and a
shop user reaching a platform route is rejected by `RolesGuard`.

User **email is unique platform-wide, not per shop**. That is deliberate: login takes
an email and a password and nothing else, so the address must identify one account
unambiguously — which is what lets the shop be resolved from the credentials alone,
with no shop picker on the login screen.

---

## 5. Data model

```
Shop 1───* User            (SUPER_ADMIN has shop_id = NULL)
Shop 1───* MenuCategory 1───* MenuItem
Shop 1───* Order 1───* OrderItem *───0..1 MenuItem
Shop 1───* ExpenseCategory 1───* ExpenseItem 1───* Expense
Shop 1───* PrintJob
Shop 1───1 PrintStation
Order   *───0..1 User (createdBy)
Expense *───0..1 User (createdBy)
```

Notable columns:

- **Shop** — `id`, `name`, `slug` (unique, URL-safe handle), `address`, `phone`,
  `isActive` (deactivating a shop blocks login for its users), timestamps.
- **User** — `id`, `name`, `email` (unique platform-wide), `passwordHash`
  (`select: false` + `@Exclude`), `role`, `shopId` (nullable — `NULL` only for
  `SUPER_ADMIN`), `isActive`, timestamps.
- **MenuCategory** — `id`, `shopId`, `name`, `description`.
- **MenuItem** — `id`, `shopId`, `name`, `description`, `price` (numeric),
  `isAvailable`, `imageUrl`, `categoryId` (FK, `ON DELETE SET NULL`).
- **Order** — `id`, `shopId`, `orderNumber` (unique **per shop**), `tableNumber`
  (nullable — `NULL` is a counter/takeaway sale), `subtotal`, `discount`, `tax`,
  `total` (numeric), `paymentMethod`, `status`, `isPaid` + `paidAt`, `isServed` +
  `servedAt`, `createdById`, `items[]` (eager, cascading), timestamps. Indexed on
  `(shopId, tableNumber, isPaid)` for the open-bill lookup.
- **OrderItem** — `id`, `orderId`, `menuItemId` (nullable), `nameSnapshot`,
  `unitPrice`, `quantity`, `lineTotal`.
- **ExpenseCategory** — `id`, `shopId`, `name` (unique per shop).
- **ExpenseItem** — `id`, `shopId`, `categoryId` (FK, **not null**, `ON DELETE
  CASCADE`), `name` (unique per `(shopId, categoryId)`), `unit` (default `'pcs'`),
  `defaultUnitPrice` (numeric, nullable), `isActive`, timestamps. The shop's own
  catalogue of what it buys; `categoryId` is required because the category is how
  the list is browsed.
- **Expense** — `id`, `shopId`, `title`, `amount` (numeric), `quantity`
  (numeric(12,3), nullable), `unit` (nullable), `unitPrice` (numeric, nullable),
  `expenseDate` (date), `note`, `itemId` (FK, nullable, `ON DELETE SET NULL`),
  `categoryId`, `createdById`, timestamps. `title`, `categoryId`, `unit` and
  `unitPrice` are **copied from the item** when the entry is recorded, not read
  back through the relation.
- **PrintJob** — `id`, `shopId`, `type`, `payload` (jsonb), `status`, `attempts`,
  `error`, `claimedAt`, timestamps. Indexed on `(shopId, status)` and `createdAt`.
- **PrintStation** — `id`, `shopId` (unique — one station per shop), `name`,
  `printerConnected`, `lastError`, `lastSeenAt`, timestamps.

Enums: `Role`; `PaymentMethod` (`CASH`, `BKASH`, `NAGAD`); `OrderStatus`
(`COMPLETED`, `VOIDED`, `REFUNDED`); `PrintJobStatus` (`PENDING`, `PRINTING`, `DONE`,
`FAILED`); `PrintJobType` (`RECEIPT`, `KITCHEN`).

### Design decisions

- **Money is `numeric(10,2)`** mapped to a JS `number` by `ColumnNumericTransformer`
  (Postgres otherwise returns decimals as strings). Arithmetic passes through `round2`
  so totals add up to the cent.
- **Order lines are snapshots.** Each `OrderItem` copies the item's name and unit price
  at the moment of sale. Editing or deleting a menu item later never rewrites history.
- **Deletes preserve records.** Removing a category, menu item or user nulls the
  foreign key (`SET NULL`); deleting an order cascades only to its own lines; deleting
  a shop cascades to everything belonging to it.
- **Totals are computed server-side** from live menu prices. Client-supplied prices are
  never trusted — a checkout request names item ids and quantities only.

---

## 6. Authentication & authorization

- `POST /auth/login` verifies the password with `bcrypt.compare` and returns a signed
  JWT plus the user record (including their shop).
- The JWT payload is `{ sub: userId, email, role, shopId }`.
- `JwtStrategy.validate` reloads the user on every request, so deactivation and role
  changes take effect immediately rather than at token expiry.
- Global guards run in this order, all registered in `app.module.ts`:

  1. **`JwtAuthGuard`** — every route requires a valid token unless marked `@Public()`
     (login, `/health`, and the root route).
  2. **`RolesGuard`** — enforces `@Roles(...)` metadata from the handler or its
     controller.
  3. **`ShopContextGuard`** — refuses any request without a tenant. `@NoShopRequired()`
     opts identity routes such as `GET /auth/me` out, since a `SUPER_ADMIN` has no shop.

- Passwords never leave the server: the hash column is `select: false` (kept out of DB
  reads) **and** `@Exclude()`ed, so the global `ClassSerializerInterceptor` strips it
  even in the moment right after a create, when it is set in memory.

### Capability matrix

| Capability | SUPER_ADMIN | OWNER | STAFF |
| ---------- | :---------: | :---: | :---: |
| Manage shops and their owners | yes | no | no |
| Read menu | no | yes | yes |
| Create orders | no | yes | yes |
| List / read orders | no | yes | yes |
| Queue, claim and acknowledge print jobs | no | yes | yes |
| Manage menu | no | yes | no |
| Void / refund orders | no | yes | no |
| Sales summary, dashboard | no | yes | no |
| Expenses (all) | no | yes | no |
| Manage shop users | no | yes | no |

---

## 7. Key request flows

### Create an order — `POST /orders`

1. Duplicate lines for the same menu item are merged into one.
2. Inside a **database transaction**: load the referenced menu items **scoped to the
   caller's shop**. A missing or unavailable item rejects the whole order.
3. Compute `lineTotal = unitPrice × quantity`, `subtotal = Σ lineTotal`, then
   `total = subtotal − discount + tax`. A discount larger than the subtotal is a `400`.
4. Snapshot name and unit price onto each line, generate an order number
   (`ORD-YYYYMMDD-NNNN`, counted **per shop**), and persist order and lines atomically.

The `(shop_id, order_number)` unique index guards the numbering against concurrent
checkouts.

### Dine-in: tables, paying and serving

Ringing up does not take money. An order is created **unpaid and unserved**, and the
two are tracked separately (`isPaid`/`isServed`) because they happen at different
moments and in either order: food can go out before the bill is settled, and a bill
can be settled before the last dish arrives.

- **Takings mean money received.** Every sales aggregate — daily, monthly, yearly, the
  dashboard trend — counts `status = COMPLETED AND is_paid = true`. What has been rung
  up and not settled is reported separately as `unpaidOrderCount` / `unpaidTotal`, so
  the day's total does not move as tables settle up.
- **A table keeps one bill.** `POST /orders` with a `tableNumber` looks for that
  table's unpaid, un-voided order and **appends** the new lines to it, recomputing the
  totals and reopening serving; the response carries `appendedToOpenBill`. Once the
  table has paid, the next round starts a fresh order — so "two rounds, two bills" is
  true only when the first is already closed. Lines are appended rather than merged so
  the kitchen sees each round on its own.
- **The append uses `update`, never `save`.** `items` is an eager, cascading relation,
  so the bill arrives with its lines as they were *before* the round; saving the entity
  would cascade that stale array and detach the rows just inserted, leaving a bill that
  charges the new total against the old lines. Same class of trap as the expense
  category relation — see §7 there.
- **Payment method is confirmed at payment**, not at ring-up: `POST /orders/:id/pay`
  takes the method actually used, which for a table that settles later is the first
  moment anyone knows it. `POST /orders/:id/unpay` corrects a mis-click and is
  owner-only — it is not a refund, since no money moved.
- **Serving toggles**: `POST /orders/:id/serve` and `/unserve`.
- **Paying now is the default.** The till asks *when* the bill is paid, not
  whether: "Pay now" (selected by default) creates the order already settled and
  prints **both** slips, while "Pay later" leaves it unpaid and prints **only the
  kitchen ticket** — the customer's receipt then comes from Open bills when they
  settle. `POST /orders` carries `markPaid` (default `true`); paying now for a table
  that already has an open bill settles that whole bill, since a table has only one.
- **Serving and settling are separate queues, and each screen shows one of them.**
  **Tables** is the serving queue: the orders whose food has not gone out. Marking one
  Done takes it off that screen — a table needing nothing carried to it does not belong
  in a floor view — and an unpaid bill there also offers **Paid**, because the customer
  is sitting in front of you; a paid one offers only Done. **Sales** is the day's record
  and the place a bill is settled once it has been served and left the floor: unpaid
  rows carry a **Paid** button, and the owner can void, refund or reprint. The **POS**
  bills too, through its Open bills panel, which lists what is unpaid whether or not it
  has been served.
- **One endpoint, two readings.** `GET /orders/open` returns everything unpaid **or**
  unserved; Tables filters it to unserved and the POS panel to unpaid. The union is
  deliberate — a single query answers both questions, and neither screen has to guess
  what the other means.
- **Undoing a Done** lives on the confirmation toast rather than a button, since the
  card it would belong to has by then left the screen.
- **The floor view reads `GET /orders/open`** — every `COMPLETED` order that is unpaid
  or unserved, oldest first. Deliberately **not** filtered by date: a bill opened
  before midnight is the same bill afterwards, and a view that dropped it at the day
  boundary would hide a table still sitting there. The frontend groups it by table
  (counter sales under "Counter") and polls every 15s, since the screen is read across
  a room while other people mark things done on their own devices.
- Paying and serving are **staff work**, so those endpoints and the sales page are open
  to `STAFF`; void, refund and unpay stay `OWNER`.

### Void and refund — `POST /orders/:id/void`, `POST /orders/:id/refund`

Owner-only status transitions on an existing order; neither deletes anything. Only
`COMPLETED` orders count towards sales reporting, so either action removes the order
from the day's takings while leaving the record intact.

The two carry different meanings — void is a mis-punch that should never have counted,
refund is money handed back — and the status is the only record of which it was, so
neither may overwrite the other: an order cannot be voided twice, refunded twice,
refunded after being voided, or **voided after being refunded**. The UI offers both
actions only on a `COMPLETED` order, each behind a confirmation, since neither is
reversible. `orders.service.spec.ts` pins every transition.

### Daily sales summary — `GET /orders/summary?date=`

Aggregates `COMPLETED` orders within the business-timezone calendar day (defaults to
today): order count, total sales, breakdown by payment method, and the top five items
by quantity sold.

### Recording an expense — category, then item, then the day

Spending is entered against a **catalogued item**, never a typed title: category →
item → dated entries. "Chicken" is added under "Groceries" once; what it cost is
recorded each time it is bought. That is the only way per-item history exists at
all — a free-text title cannot be totalled or trended.

Three consequences shape the code:

**Entries snapshot the item.** `title`, `categoryId`, `unit` and `unitPrice` are
copied onto the row from the item at the moment of recording (`buildEntryFields`).
Renaming, re-filing or retiring an item therefore cannot rewrite what the books say
was bought. Every list, breakdown and export reads the stored `title`.

**Items are retired, not deleted.** `DELETE /expenses/items/:id` removes an item
only if it was never bought; otherwise it sets `isActive: false` and returns
`{ deleted: false }`. Deleting a category holding items is refused outright (`409`)
— the FK cascades, and taking the whole catalogue out from under the history is not
something to do by accident.

**A day is saved as a unit.** `POST /expenses/bulk` commits the basket in a
transaction, with every item resolved before anything is written, so a day cannot
land half-recorded. The UI builds the basket in local state and writes nothing until
Save.

`title` stays `NOT NULL` and `itemId` is nullable because entries recorded before
the catalogue existed are still valid — they have a typed title and no item, stay
reachable as "Uncategorized" in the breakdowns, and are left item-less when edited
unless an item is chosen. The rule governs new entries, not history.

`ExpensesService.update` deliberately loads the expense **without** its `category`
or `item` relation. TypeORM's `save()` lets a loaded relation take precedence over
the FK column, and the two disagreeing is silent data loss — first writing the old
category back over a new one, then (when the relation was nulled to force the column
through) wiping the category of any expense saved with its category unchanged. With
no relation loaded, the FK columns are the single source of truth, and the handler
re-reads the row so the client still gets the names. `expenses.service.spec.ts` pins
all of it, plus the amount rules: `quantity × unitPrice` when no amount is sent, an
explicit amount always winning, and a recompute when the quantity moves.

### The day-by-day view — `GET /expenses/days?month=`

The expense screen is read a day at a time, so `/expenses?date=` returns one day's
entries and `/expenses/days` returns the days of a month that have spending, newest
first. Empty days are omitted deliberately: a run of them is noise, and the point of
the list is to get back to a day that has something on it.

### Monthly expense summary — `GET /expenses/summary?month=`

Aggregates expenses within the business-timezone month (defaults to the current one):
total plus a per-category **and per-item** breakdown (`byItem` groups on the stored
`title`, so retired items and pre-catalogue entries still appear), with uncategorized rows grouped as
"Uncategorized".

### Dashboard — `GET /dashboard?date=`

Three horizons from one reference day. `OrdersService` and `ExpensesService` each
expose one private range aggregate (`aggregateSales`, `aggregateExpenses`) that the
day, month and year views all call, so the three periods cannot drift apart in
definition; `DashboardService` pairs each period's sales with its expenses, derives
`netProfit` and the average basket, and joins the two per-month series into a single
twelve-entry trend. Eight queries run concurrently behind one request.

Months with no activity are still emitted (zero-filled from `monthsOfYear`) so a chart
drawn from the trend has no gaps, and every figure is computed server-side — the client
does no money arithmetic.

### Reporting boundaries and timezone

Report boundaries are computed in the **business timezone** (`APP_TIMEZONE`, default
`Asia/Dhaka`) by `common/utils/date.util.ts`, not in the server's zone. A summary for
`2026-07-19` therefore spans the shop's business day even when the process runs in UTC.
`main.ts` additionally pins `process.env.TZ`, but the helpers derive their ranges from
`Intl` offsets and do not depend on it. This logic is unit-tested in
`date.util.spec.ts`.

---

## 8. Receipt printing

### Why a bridge exists

The shops use 58 mm Bluetooth thermal printers (BT583 class, ESC/POS). No browser can
drive them: the only browser Bluetooth API is Web Bluetooth, which speaks BLE GATT,
while these printers are Bluetooth **Classic** (SPP) — and iOS blocks non-MFi serial
entirely. So the printer is owned by a Node process on the counter PC, and the tills
queue slips for it. On Windows a paired printer appears as an ordinary outgoing COM
port, so the bridge contains no Bluetooth code at all — only a serial write.

### Three routes, tried in order

`frontend/src/lib/print-bridge.ts` picks a path per slip, so a receipt is always
obtainable:

| Route | When it is used | Latency |
| ----- | --------------- | ------- |
| `local` | The till *is* the counter PC — POST straight to `127.0.0.1:9110` | instant |
| `queued` | Any other till — `POST /print-jobs`, the bridge claims it | ~1s |
| `browser` | No station online — fall back to the system print dialog | manual |

`GET /print-jobs/printer-status` tells the POS which to use; the answer is cached for
ten seconds, and the local probe is capped at 700 ms so it never delays checkout.

### Queue semantics (`printing.service.ts`)

- **Claims are exclusive.** `POST /print-jobs/claim` selects pending work with
  `FOR UPDATE SKIP LOCKED`, so two bridges on one shop never print the same slip.
- **Check-in doubles as claim.** The claim call carries the station name, whether the
  printer port is open, and any printer-side error, upserting the shop's `PrintStation`
  row. A station counts as online if it checked in within 30 s.
- **Crashes recover.** A job claimed but never acknowledged is requeued after 60 s.
- **Failures stop.** After 3 attempts a job becomes `FAILED` with the last error, and
  can be requeued explicitly via `POST /print-jobs/:id/retry`.
- **Stale slips are dropped.** Anything still pending after 10 minutes is failed rather
  than printed — nobody wants a backlog of old receipts when the bridge comes back up.
- **The payload is opaque to the backend.** It is stored as `jsonb` exactly as the
  frontend builds it, so the browser path and the ESC/POS renderer consume one shape.
- Jobs are tenant-scoped like everything else: a bridge signs in as a user of one shop
  and can only ever see that shop's slips.

### Known limitation: non-Latin text

Text-mode ESC/POS renders single-byte code pages; the bridge uses CP437, so anything
outside it (Bengali, Arabic, Chinese) prints as `?`. Fixing this means rendering the
slip to a bitmap and sending it as a raster image (`GS v 0`) — a change in
`bridge/src/render.js`, not a configuration option.

---

## 9. Frontend architecture

- **App Router with one authenticated group.** `src/app/(app)/layout.tsx` wraps every
  authenticated page in the app shell; `src/app/login` sits outside it. The root route
  redirects to `/pos`.
- **Client-side auth.** The JWT is held in `localStorage` under `shop_pos_token` and
  attached by an axios request interceptor. A response interceptor drops the token and
  bounces to `/login` on any `401`. `src/lib/auth-context.tsx` exposes the current user.
- **One route-permission table.** `src/lib/routes.ts` declares which roles may open
  which route, and both the sidebar filter and the `(app)/layout.tsx` guard read it, so
  a link cannot appear for a role that would be redirected away from the page. A `STAFF`
  login sees only the POS; typing `/expenses`, `/staff`, `/menu` or `/sales` redirects
  to `/pos`, and the layout withholds the children until the redirect lands so the
  forbidden page never mounts or fires its requests. A `SUPER_ADMIN` is kept to
  `/admin/*`. Unlisted paths are allowed through so a genuine 404 still renders.
  This is a convenience — the API enforces the same rules independently.
- **Role split.** Staff work the till, the sales page (settling and serving) and read
  the menu; the dashboard, expenses and staff pages are the owner's. The menu page
  hides its editing controls from staff because the API refuses their writes, and the
  sales page hides void/refund from them for the same reason.
- **One landing rule.** `homeFor(role)` in the same module decides where each role
  starts — `/dashboard` for an owner, `/pos` for staff, `/admin/*` for a platform
  admin — and login, the root route and the guard's redirect all call it, so the
  destination is defined once. The root route is a client component precisely because
  the session lives in the browser: the server cannot know which role is arriving.
- **Server state via TanStack Query.** All API access goes through typed hooks in
  `src/lib/hooks.ts`, with query keys centralised in `queryKeys` and mutations
  invalidating the keys they affect. Components hold no fetching logic.
- **Money formatting** is centralised in `src/lib/format.ts` (fixed two decimals, no
  currency symbol — currency configuration is still outstanding).
- **Best sellers filter by one category at a time.** "All" is the top five across
  everything; picking a category lists **all** of its items instead of cutting at
  five, because a quiet item in a small category is invisible in a global top five.
  The choice is per-visit state, not persisted — a remembered filter on a figure card
  reads as missing data.
- **The one chart is hand-rolled SVG** (`dashboard/monthly-trend-chart.tsx`) rather
  than a charting dependency: grouped columns on a single axis, since both series are
  money. Its two series colours live in `globals.css` as `--viz-*` tokens, stepped
  separately for light and dark, and were validated for colour-blind separation
  (worst-case ΔE 14.9 against a ≥8 target) and ≥3:1 contrast against the card surface.
  Identity never rests on colour alone: there is a legend, a hover/keyboard readout,
  and a table view of the same figures.

---

## 10. Configuration

See [OPERATIONS.md](OPERATIONS.md) for the environment variables of all three
components, deployment, migrations, backups and the operational runbook.

---

## 11. Testing

- **Unit tests** (`npm test` in `backend/`) cover the timezone/date helpers
  (`date.util.spec.ts`), the tenant backstop (`shop-context.guard.spec.ts`), and the
  app controller.
- **End-to-end smoke runs** against a live backend have covered the full auth, menu,
  order-pricing, summary and RBAC flow (39 checks), and the print-queue lifecycle —
  claim exclusivity, retry/give-up, tenant isolation (22 checks).
- **Frontend** flows (login, POS checkout, menu CRUD, sales, expenses) have been
  verified with headless-browser smoke tests; the expenses screen has a 13-check run
  covering create, recategorize, clear to Uncategorized, month switching and delete.

Gap worth closing: per-service unit tests and a committed Nest e2e suite, so the smoke
runs above become repeatable in CI rather than manual.

---

## 12. Known limitations

- **Order numbering** relies on an in-transaction per-shop daily count; the unique
  index is what actually prevents duplicates under heavy concurrency.
- **Tax and discount are flat per-order amounts.** No per-item tax rules or multiple
  rates.
- **Single currency, no symbol configuration**; amounts render as plain two-decimal
  numbers.
- **One business timezone per deployment** (`APP_TIMEZONE`), not per shop.
- **Refund is all-or-nothing** — no partial refunds or per-line voids.
- **One print station per shop**; a second bridge checking in takes over the row.
- **Non-Latin receipt text** is not printable in text mode (see §8).
- **No inventory or stock tracking.**
