# Shop POS

A multi-tenant point-of-sale system for small shops and restaurants: ring up sales on
any device, print receipts on a Bluetooth thermal printer, and track daily takings and
monthly expenses.

The platform hosts many independent shops. Each shop's menu, orders, staff and expenses
are visible only to that shop; a platform administrator creates and suspends shops but
can never read their trading data.

---

## Components

| Component | Stack | Location | Role |
| --------- | ----- | -------- | ---- |
| **Backend** | NestJS 11, TypeORM, PostgreSQL | [`backend/`](backend) | REST API, auth, tenant scoping, all business rules |
| **Frontend** | Next.js 16, React 19, Tailwind 4, shadcn/ui | [`frontend/`](frontend) | The till UI: POS, menu, sales, staff, shop admin |
| **Print bridge** | Node 18+, `serialport` | [`bridge/`](bridge) | Owns the shop's Bluetooth printer and drains the print queue |

```
   Tills (browser: Windows / Android / iPad)
                   │
                   │  HTTPS  (JWT bearer)
                   ▼
        ┌──────────────────────┐        ┌───────────────┐
        │   Backend (NestJS)   │◄──────►│  PostgreSQL   │
        │  REST API + guards   │        │    (Neon)     │
        └──────────┬───────────┘        └───────────────┘
                   │  print job queue (claim / ack)
                   ▼
        ┌──────────────────────┐   COM / rfcomm   ┌──────────────┐
        │  Bridge (counter PC) │─────────────────►│ BT583 58mm   │
        └──────────────────────┘                  │ ESC/POS      │
                                                  └──────────────┘
```

The bridge exists because no browser can reach these printers: Web Bluetooth speaks
only BLE GATT while the printers are Bluetooth *Classic* (SPP), and iOS blocks serial
outright. See [`bridge/README.md`](bridge/README.md).

---

## Quick start

Prerequisites: Node.js 20+, a PostgreSQL database (a free [Neon](https://neon.tech)
project works), and — for printing — a paired Bluetooth thermal printer.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm run start:dev             # API on http://localhost:5000, Swagger at /docs
```

On first start the app seeds a platform administrator, a demo shop, and that shop's
owner account from the `SUPER_ADMIN_*`, `SEED_SHOP_*` and `OWNER_*` variables.

For something to actually look at, fill the demo shop with five months of trading:

```bash
npm run seed:demo        # ~20s; safe to re-run, only ever touches the demo shop
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # app on http://localhost:5001
```

Set `NEXT_PUBLIC_API_URL` if the backend is not on `http://localhost:5000`.

### 3. Print bridge (only on the PC the printer is paired to)

```bash
cd bridge
npm install
npm run probe                 # list serial ports; find the outgoing COM port
cp .env.example .env          # set PRINTER_PORT and a shop login for the bridge
npm start
```

Default seeded logins — development only; change them before any real use:

| Role | Email | Password |
| ---- | ----- | -------- |
| Platform admin | `admin@shop-pos.local` | `admin123` |
| Shop owner | `owner@shop.local` | `owner123` |
| Staff (created by `seed:demo`) | `staff@shop.local` | `staff123` |

---

## Documentation

| Document | Audience | Contents |
| -------- | -------- | -------- |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Developers | Architecture, data model, tenancy, auth, request flows |
| [docs/API.md](docs/API.md) | API consumers | Every endpoint, payload, role requirement and error |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Whoever runs it | Configuration, deployment, migrations, backups, runbook |
| [docs/STATUS.md](docs/STATUS.md) | Everyone | What is built, what is verified, what is left |
| [docs/PLANNING.md](docs/PLANNING.md) | Everyone | The plan and the rationale behind each decision |
| [docs/NON-TECHNICAL.md](docs/NON-TECHNICAL.md) | Shop owners | Plain-language guide to what the app does |
| [bridge/README.md](bridge/README.md) | Installers | Printer pairing, bridge setup, troubleshooting |

The running backend serves an interactive OpenAPI/Swagger reference at `/docs`.

---

## Repository layout

```
shop-pos/
├── backend/      NestJS API (see backend/README.md)
├── frontend/     Next.js till UI (tracked as a subproject)
├── bridge/       Node print bridge for the counter PC
├── docs/         Project documentation
└── README.md
```

`frontend/` is tracked as a separate subproject; clone with `--recurse-submodules`, or
run `git submodule update --init` after cloning.

## Licence

Proprietary. All rights reserved by the project owner.
