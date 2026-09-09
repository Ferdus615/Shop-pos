import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './config/data-source-options';
import { APP_TIME_ZONE, formatDay } from './common/utils/date.util';

/**
 * Fills the demo shop with a plausible trading history so every screen has
 * something real to show: a menu, bills in each of the four states a dine-in
 * order can be in, expenses across several months, and enough past sales for
 * the dashboard's month and year views to have a shape.
 *
 * Run with `npm run seed:demo`.
 *
 * It only ever touches the shop named by `SEED_SHOP_SLUG` (default
 * `demo-shop`), and it clears that shop's trading data first so re-running it
 * gives the same result rather than piling up. A real shop is never touched:
 * point `SEED_SHOP_SLUG` at a real slug and it refuses to run.
 */

/** Slugs this script will not write to, whatever the environment says. */
const PROTECTED_SLUGS = ['naval-bay', 'shahi-mojlish'];

interface MenuSeed {
  category: string;
  items: { name: string; price: number }[];
}

const MENU: MenuSeed[] = [
  {
    category: 'Drinks',
    items: [
      { name: 'Cha', price: 20 },
      { name: 'Malai Cha', price: 40 },
      { name: 'Coffee', price: 70 },
      { name: 'Lemon Soda', price: 50 },
      { name: 'Mineral Water', price: 20 },
    ],
  },
  {
    category: 'Snacks',
    items: [
      { name: 'Shingara', price: 15 },
      { name: 'Somucha', price: 20 },
      { name: 'Chicken Roll', price: 60 },
      { name: 'Chicken Patties', price: 70 },
    ],
  },
  {
    category: 'Rice & Curry',
    items: [
      { name: 'Chicken Biryani', price: 220 },
      { name: 'Beef Tehari', price: 260 },
      { name: 'Khichuri with Egg', price: 180 },
      { name: 'Plain Rice', price: 40 },
      { name: 'Chicken Curry', price: 190 },
    ],
  },
  {
    category: 'Desserts',
    items: [
      { name: 'Firni', price: 80 },
      { name: 'Roshmalai', price: 90 },
    ],
  },
];

const EXPENSE_CATEGORIES = [
  'Rent',
  'Bazar Cost',
  'Staff Cost',
  'Utilities',
  'Miscellaneous',
];

/**
 * The item catalogue: spending is recorded by picking one of these, so the
 * demo has to have them before it has any expenses. `unit` and `price` are
 * what an entry pre-fills from.
 */
const EXPENSE_ITEMS: {
  category: string;
  name: string;
  unit: string;
  price: number | null;
}[] = [
  { category: 'Rent', name: 'Shop rent', unit: 'month', price: 18000 },
  { category: 'Staff Cost', name: 'Staff salary', unit: 'month', price: 24000 },
  {
    category: 'Utilities',
    name: 'Electricity bill',
    unit: 'month',
    price: null,
  },
  { category: 'Utilities', name: 'Gas bill', unit: 'month', price: 1100 },
  { category: 'Bazar Cost', name: 'Chicken', unit: 'kg', price: 320 },
  { category: 'Bazar Cost', name: 'Rice', unit: 'kg', price: 78 },
  { category: 'Bazar Cost', name: 'Soybean oil', unit: 'ltr', price: 175 },
  { category: 'Bazar Cost', name: 'Vegetables', unit: 'kg', price: 60 },
  { category: 'Bazar Cost', name: 'Bread', unit: 'pcs', price: 55 },
  { category: 'Bazar Cost', name: '7up', unit: 'pcs', price: 35 },
  { category: 'Bazar Cost', name: 'Biscuit', unit: 'pack', price: 40 },
  {
    category: 'Miscellaneous',
    name: 'Equipment repair',
    unit: 'job',
    price: null,
  },
];

/** A shop keeps roughly the same fixed costs every month. */
const MONTHLY_EXPENSES: { item: string; quantity: number; amount?: number }[] =
  [
    { item: 'Shop rent', quantity: 1 },
    { item: 'Staff salary', quantity: 1 },
    { item: 'Electricity bill', quantity: 1, amount: 4200 },
    { item: 'Gas bill', quantity: 1 },
  ];

/**
 * A day's bazar is a handful of items bought together — which is the shape the
 * expense screen is built around, so the demo shows it rather than one lump
 * labelled "Bazar".
 */
const BAZAR_BASKETS: { item: string; quantity: number }[][] = [
  [
    { item: 'Chicken', quantity: 2 },
    { item: 'Rice', quantity: 10 },
    { item: 'Vegetables', quantity: 4 },
  ],
  [
    { item: 'Chicken', quantity: 1.5 },
    { item: 'Soybean oil', quantity: 5 },
    { item: 'Vegetables', quantity: 3 },
  ],
  [
    { item: 'Bread', quantity: 4 },
    { item: '7up', quantity: 6 },
    { item: 'Biscuit', quantity: 3 },
  ],
];

/** Today's calendar date in the business timezone, as YYYY-MM-DD. */
function today(): string {
  return formatDay(new Date());
}

/** An instant this many minutes ago, for "how long has this been waiting". */
function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

/** Noon (business time) on a day this many days back — safely mid-day. */
function daysAgoAtNoon(days: number): Date {
  const [y, m, d] = today().split('-').map(Number);
  // Built in UTC then shifted: noon Dhaka is 06:00Z, comfortably inside the
  // same calendar day in any timezone this shop might run in.
  return new Date(Date.UTC(y, m - 1, d - days, 6, 0, 0));
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main() {
  const slug = process.env.SEED_SHOP_SLUG ?? 'demo-shop';
  if (PROTECTED_SLUGS.includes(slug)) {
    throw new Error(
      `Refusing to seed demo data into "${slug}": that is a real shop. ` +
        'Point SEED_SHOP_SLUG at a demo shop instead.',
    );
  }

  // Query logging is on in development, and this script runs hundreds of
  // inserts — it reports what it did itself instead.
  const dataSource = new DataSource({
    ...buildDataSourceOptions(),
    logging: false,
  });
  await dataSource.initialize();

  try {
    const shops: { id: string; name: string }[] = await dataSource.query(
      'select id, name from shops where slug = $1',
      [slug],
    );
    if (!shops.length) {
      throw new Error(
        `No shop with slug "${slug}". Start the backend once so it seeds, ` +
          'or set SEED_SHOP_SLUG to an existing demo shop.',
      );
    }
    const shopId = shops[0].id;
    console.log(`Seeding demo data into "${shops[0].name}" (${slug})`);
    console.log(`Business timezone: ${APP_TIME_ZONE}`);

    // --- start from a known state ---------------------------------------
    /**
     * Items go first, in their own statement. `expenses.item_id` is ON DELETE
     * SET NULL, and deleting a parent and its children inside one
     * data-modifying CTE makes the FK trigger update rows that the same
     * command is deleting — so this one stays outside the batch below.
     */
    await dataSource.query('delete from expense_items where shop_id = $1', [
      shopId,
    ]);

    const wiped: { orders: string; expenses: string; menu_items: string }[] =
      await dataSource.query(
        `with removed_items as (
         delete from order_items
          where order_id in (select id from orders where shop_id = $1)
         returning 1
       ),
       removed_orders as (
         delete from orders where shop_id = $1 returning 1
       ),
       removed_expenses as (
         delete from expenses where shop_id = $1 returning 1
       ),
       removed_expense_categories as (
         delete from expense_categories where shop_id = $1 returning 1
       ),
       removed_items_menu as (
         delete from menu_items where shop_id = $1 returning 1
       ),
       removed_menu_categories as (
         delete from menu_categories where shop_id = $1 returning 1
       )
       select (select count(*) from removed_orders) orders,
              (select count(*) from removed_expenses) expenses,
              (select count(*) from removed_items_menu) menu_items`,
        [shopId],
      );
    console.log(
      `Cleared: ${wiped[0].orders} orders, ${wiped[0].expenses} expenses, ` +
        `${wiped[0].menu_items} menu items`,
    );

    // --- menu -------------------------------------------------------------
    const itemIdByName = new Map<string, string>();
    const priceByName = new Map<string, number>();
    for (const group of MENU) {
      const categoryId = randomUUID();
      await dataSource.query(
        `insert into menu_categories (id, shop_id, name, created_at, updated_at)
         values ($1, $2, $3, now(), now())`,
        [categoryId, shopId, group.category],
      );
      for (const item of group.items) {
        const id = randomUUID();
        await dataSource.query(
          `insert into menu_items
             (id, shop_id, category_id, name, price, is_available, created_at, updated_at)
           values ($1, $2, $3, $4, $5, true, now(), now())`,
          [id, shopId, categoryId, item.name, item.price],
        );
        itemIdByName.set(item.name, id);
        priceByName.set(item.name, item.price);
      }
    }
    console.log(`Menu: ${MENU.length} categories, ${itemIdByName.size} items`);

    // --- a staff account, so the role split can be tried out -------------
    const staffEmail = process.env.DEMO_STAFF_EMAIL ?? 'staff@shop.local';
    const staffPassword = process.env.DEMO_STAFF_PASSWORD ?? 'staff123';
    const existingStaff: { id: string }[] = await dataSource.query(
      'select id from users where email = $1',
      [staffEmail],
    );
    if (existingStaff.length) {
      console.log(`Staff login already exists: ${staffEmail}`);
    } else {
      await dataSource.query(
        `insert into users
           (id, shop_id, name, email, password_hash, role, is_active, created_at, updated_at)
         values ($1, $2, 'Demo Waiter', $3, $4, 'STAFF', true, now(), now())`,
        [
          randomUUID(),
          shopId,
          staffEmail,
          await bcrypt.hash(staffPassword, 10),
        ],
      );
      console.log(`Staff login created: ${staffEmail} / ${staffPassword}`);
    }

    // --- expense categories ----------------------------------------------
    const expenseCategoryId = new Map<string, string>();
    for (const name of EXPENSE_CATEGORIES) {
      const id = randomUUID();
      await dataSource.query(
        `insert into expense_categories (id, shop_id, name, created_at)
         values ($1, $2, $3, now())`,
        [id, shopId, name],
      );
      expenseCategoryId.set(name, id);
    }

    // --- expense items ----------------------------------------------------
    // Keyed by name: names are unique per category, and the demo does not
    // reuse one name across two categories.
    const expenseItem = new Map<
      string,
      { id: string; categoryId: string; unit: string; price: number | null }
    >();
    for (const item of EXPENSE_ITEMS) {
      const id = randomUUID();
      const categoryId = expenseCategoryId.get(item.category);
      if (!categoryId) continue;
      await dataSource.query(
        `insert into expense_items
           (id, shop_id, category_id, name, unit, default_unit_price,
            is_active, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6, true, now(), now())`,
        [id, shopId, categoryId, item.name, item.unit, item.price],
      );
      expenseItem.set(item.name, {
        id,
        categoryId,
        unit: item.unit,
        price: item.price,
      });
    }

    // --- orders -----------------------------------------------------------
    /** Order numbers restart each day, so count them per day. */
    const perDay = new Map<string, number>();
    const nextOrderNumber = (createdAt: Date) => {
      const day = formatDay(createdAt);
      const seq = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, seq);
      return `ORD-${day.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
    };

    /**
     * Orders are collected and inserted in batches. A shop's history runs to
     * thousands of rows, and one round trip per row against a hosted database
     * turns a seed into a coffee break.
     */
    const orderRows: unknown[][] = [];
    const itemRows: unknown[][] = [];

    const addOrder = (opts: {
      createdAt: Date;
      lines: [string, number][];
      table?: string | null;
      paid?: boolean;
      served?: boolean;
      status?: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
      method?: 'CASH' | 'BKASH' | 'NAGAD';
      discount?: number;
    }) => {
      const {
        createdAt,
        lines,
        table = null,
        paid = true,
        served = true,
        status = 'COMPLETED',
        method = 'CASH',
        discount = 0,
      } = opts;

      const subtotal = money(
        lines.reduce(
          (sum, [name, qty]) => sum + (priceByName.get(name) ?? 0) * qty,
          0,
        ),
      );
      const total = money(subtotal - discount);
      const id = randomUUID();
      const stamp = createdAt.toISOString();

      orderRows.push([
        id,
        shopId,
        nextOrderNumber(createdAt),
        table,
        subtotal,
        discount,
        0, // tax — this shop charges none
        total,
        method,
        status,
        paid,
        paid ? stamp : null,
        served,
        served ? stamp : null,
        stamp,
      ]);

      for (const [name, qty] of lines) {
        const price = priceByName.get(name) ?? 0;
        itemRows.push([
          randomUUID(),
          id,
          itemIdByName.get(name) ?? null,
          name,
          price,
          qty,
          money(price * qty),
        ]);
      }
    };

    /** One multi-row INSERT per chunk, well inside Postgres' parameter cap. */
    const flush = async (
      table: string,
      columns: string,
      rows: unknown[][],
      perRow: number,
    ) => {
      const maxRows = Math.floor(60000 / perRow);
      for (let i = 0; i < rows.length; i += maxRows) {
        const chunk = rows.slice(i, i + maxRows);
        const values = chunk
          .map(
            (_, r) =>
              `(${Array.from(
                { length: perRow },
                (__, c) => `$${r * perRow + c + 1}`,
              ).join(',')})`,
          )
          .join(',');
        await dataSource.query(
          `insert into ${table} (${columns}) values ${values}`,
          chunk.flat(),
        );
      }
    };

    // Today: one of every state the floor can be in.
    // A table mid-meal: first round served, second round just sent, unpaid —
    // both rounds are on one bill, which is what the till settles.
    addOrder({
      createdAt: minutesAgo(38),
      table: '7',
      lines: [
        ['Chicken Biryani', 2],
        ['Cha', 4],
      ],
      paid: false,
      served: false,
    });
    addOrder({
      createdAt: minutesAgo(6),
      table: '3',
      lines: [
        ['Beef Tehari', 1],
        ['Lemon Soda', 2],
      ],
      paid: false,
      served: true,
    });
    // Waiting a long time — the floor view flags this one.
    addOrder({
      createdAt: minutesAgo(27),
      table: '12',
      lines: [
        ['Khichuri with Egg', 2],
        ['Firni', 2],
      ],
      paid: false,
      served: false,
    });
    // Paid up front, still in the kitchen.
    addOrder({
      createdAt: minutesAgo(9),
      table: '5',
      lines: [
        ['Chicken Curry', 2],
        ['Plain Rice', 3],
      ],
      paid: true,
      served: false,
      method: 'BKASH',
    });
    // Counter trade: one settled, one still waiting to be handed over.
    addOrder({
      createdAt: minutesAgo(52),
      lines: [
        ['Shingara', 6],
        ['Cha', 2],
      ],
      method: 'CASH',
    });
    addOrder({
      createdAt: minutesAgo(3),
      lines: [['Chicken Roll', 2]],
      paid: false,
      served: false,
    });
    // A mis-punch and a return, so those states are visible on the record.
    addOrder({
      createdAt: minutesAgo(75),
      table: '9',
      lines: [['Beef Tehari', 3]],
      status: 'VOIDED',
      paid: false,
      served: false,
    });
    addOrder({
      createdAt: minutesAgo(120),
      table: '4',
      lines: [['Chicken Biryani', 1]],
      status: 'REFUNDED',
      paid: true,
      served: true,
      method: 'NAGAD',
    });

    // History: settled, served trade over the past months, busier at weekends
    // and heavier at dinner, so the trend and best-sellers look like a shop.
    const BASKETS: [string, number][][] = [
      [
        ['Chicken Biryani', 2],
        ['Cha', 2],
      ],
      [
        ['Beef Tehari', 1],
        ['Mineral Water', 1],
      ],
      [
        ['Shingara', 4],
        ['Cha', 3],
      ],
      [
        ['Khichuri with Egg', 1],
        ['Firni', 1],
      ],
      [
        ['Chicken Roll', 2],
        ['Coffee', 1],
      ],
      [
        ['Chicken Curry', 1],
        ['Plain Rice', 2],
        ['Roshmalai', 1],
      ],
      [
        ['Malai Cha', 2],
        ['Somucha', 3],
      ],
      [
        ['Chicken Biryani', 1],
        ['Lemon Soda', 1],
      ],
    ];
    const METHODS: ('CASH' | 'BKASH' | 'NAGAD')[] = [
      'CASH',
      'CASH',
      'CASH',
      'BKASH',
      'BKASH',
      'NAGAD',
    ];

    // Five months back, at a volume that actually covers the fixed costs: a
    // shop taking three orders a day would show a catastrophic loss against
    // rent and salaries, which is not a useful thing to look at.
    for (let daysBack = 1; daysBack <= 130; daysBack += 1) {
      const date = daysAgoAtNoon(daysBack);
      const weekday = date.getUTCDay();
      const busy = weekday === 4 || weekday === 5; // Thu/Fri evenings
      // Thinner the further back you go, so the year trend rises toward now.
      const growth = daysBack > 100 ? 0.7 : daysBack > 50 ? 0.85 : 1;
      const count = Math.round((busy ? 26 : 18) * growth);

      for (let n = 0; n < count; n += 1) {
        const basket = BASKETS[(daysBack * 3 + n) % BASKETS.length];
        // Spread across trading hours, busiest around lunch and dinner.
        const hour = 8 + ((n * 5) % 13);
        const createdAt = new Date(
          date.getTime() + (hour - 12) * 3_600_000 + ((n * 13) % 60) * 60_000,
        );
        addOrder({
          createdAt,
          lines: basket,
          table:
            (daysBack + n) % 3 === 0 ? String(((daysBack + n) % 12) + 1) : null,
          method: METHODS[(daysBack * 7 + n) % METHODS.length],
          discount: (daysBack + n) % 23 === 0 ? 20 : 0,
        });
      }
    }

    await flush(
      'orders',
      `id, shop_id, order_number, table_number, subtotal, discount, tax, total,
       payment_method, status, is_paid, paid_at, is_served, served_at, created_at`,
      orderRows,
      15,
    );
    await flush(
      'order_items',
      'id, order_id, menu_item_id, name_snapshot, unit_price, quantity, line_total',
      itemRows,
      7,
    );
    const orderCount = orderRows.length;
    // The batch sets created_at; updated_at simply matches it for seed data.
    await dataSource.query(
      'update orders set updated_at = created_at where shop_id = $1',
      [shopId],
    );

    // --- expenses ----------------------------------------------------------
    let expenseCount = 0;
    /**
     * Records a purchase the way the app does: the title, category and unit
     * are copied off the item, and the amount is quantity x unit price unless
     * one is passed for an item with no fixed price.
     */
    const addExpense = async (
      itemName: string,
      quantity: number,
      date: string,
      amount?: number,
      note?: string,
    ) => {
      const item = expenseItem.get(itemName);
      if (!item) throw new Error(`Unknown demo expense item: ${itemName}`);
      const unitPrice = item.price;
      const total = amount ?? (unitPrice === null ? 0 : quantity * unitPrice);

      await dataSource.query(
        `insert into expenses
           (id, shop_id, title, item_id, category_id, quantity, unit,
            unit_price, amount, expense_date, note, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), now())`,
        [
          randomUUID(),
          shopId,
          itemName,
          item.id,
          item.categoryId,
          quantity,
          item.unit,
          unitPrice,
          total,
          date,
          note ?? null,
        ],
      );
      expenseCount += 1;
    };

    // The same five months the sales cover, so every month in the trend has
    // both bars rather than one.
    for (let monthsBack = 4; monthsBack >= 0; monthsBack -= 1) {
      const [y, m] = today().split('-').map(Number);
      const monthDate = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
      const yyyy = monthDate.getUTCFullYear();
      const mm = String(monthDate.getUTCMonth() + 1).padStart(2, '0');

      for (const fixed of MONTHLY_EXPENSES) {
        await addExpense(
          fixed.item,
          fixed.quantity,
          `${yyyy}-${mm}-02`,
          fixed.amount,
        );
      }
      // Bazar every four days, a different basket each time.
      let basket = 0;
      for (let day = 3; day <= 27; day += 4) {
        for (const line of BAZAR_BASKETS[basket % BAZAR_BASKETS.length]) {
          await addExpense(
            line.item,
            line.quantity,
            `${yyyy}-${mm}-${String(day).padStart(2, '0')}`,
          );
        }
        basket += 1;
      }
      if (monthsBack % 3 === 0) {
        await addExpense(
          'Equipment repair',
          1,
          `${yyyy}-${mm}-18`,
          1500 + monthsBack * 120,
          'Fridge servicing',
        );
      }
    }

    // --- what the shop looks like now -------------------------------------
    const summary: {
      orders: string;
      unpaid: string;
      waiting: string;
      collected: string;
      expenses: string;
    }[] = await dataSource.query(
      `select
         (select count(*) from orders where shop_id = $1) orders,
         (select count(*) from orders where shop_id = $1 and status = 'COMPLETED' and is_paid = false) unpaid,
         (select count(*) from orders where shop_id = $1 and status = 'COMPLETED' and is_served = false) waiting,
         (select coalesce(sum(total), 0) from orders where shop_id = $1 and status = 'COMPLETED' and is_paid) collected,
         (select coalesce(sum(amount), 0) from expenses where shop_id = $1) expenses`,
      [shopId],
    );
    const s = summary[0];

    console.log(
      `Orders: ${orderCount} (${s.unpaid} unpaid, ${s.waiting} waiting to serve)`,
    );
    console.log(`Expenses: ${expenseCount} entries`);
    console.log(`Collected all-time: ${s.collected}, spent: ${s.expenses}`);
    console.log('');
    console.log('');
    console.log('Logins for this shop:');
    console.log(
      `  owner  ${process.env.OWNER_EMAIL ?? 'owner@shop.local'} / ` +
        `${process.env.OWNER_PASSWORD ?? 'owner123'}`,
    );
    console.log(`  staff  ${staffEmail} / ${staffPassword}`);
    console.log('');
    console.log('Sign in as the demo shop owner and look at:');
    console.log(
      '  Tables  — table 7 mid-meal, 12 waiting too long, 5 paid but cooking',
    );
    console.log(
      '  POS     — Open bills: settle table 3, or add a round to table 7',
    );
    console.log(
      '  Sales   — today, with a voided and a refunded order on the record',
    );
    console.log(
      '  Dashboard — day / month / year, and the month-by-month trend',
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
