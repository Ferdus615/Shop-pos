/**
 * Exports one shop's entire data to a timestamped JSON file.
 *
 *   cd backend
 *   node scripts/export-shop.js naval-bay
 *   node scripts/export-shop.js naval-bay --out ../backups
 *
 * Every table that belongs to a shop is walked in dependency order, so the
 * file holds the shop's full graph: its users, menu, expenses, orders and the
 * order lines under them, and its printing state. Row counts and the source
 * host go into a manifest at the top, so a file can be checked against the
 * database it came from later.
 *
 * This is a logical export of ONE shop. It is the right tool for "keep a copy
 * of this shop's trading before I change something", and the wrong tool for
 * disaster recovery: it does not capture the schema, the other shops, the
 * platform admin, or anything a restore would need to rebuild the database. On
 * Neon, a branch is the real backup — it snapshots everything, at an instant,
 * in seconds. Take one of those as well.
 *
 * Read-only: it issues nothing but SELECTs.
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const slug = process.argv[2];
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag !== -1 ? process.argv[outFlag + 1] : 'backups';

if (!slug || slug.startsWith('--')) {
  console.error('usage: node scripts/export-shop.js <shop-slug> [--out <dir>]');
  process.exit(1);
}

/**
 * Ordered so a reader (or a future importer) meets parents before children.
 * Each entry says how to find the rows belonging to one shop: most hang off
 * shop_id directly, order_items only through their order.
 */
const TABLES = [
  ['users', 'select * from users where shop_id = $1 order by created_at'],
  ['menu_categories', 'select * from menu_categories where shop_id = $1 order by created_at'],
  ['menu_items', 'select * from menu_items where shop_id = $1 order by created_at'],
  ['expense_categories', 'select * from expense_categories where shop_id = $1 order by created_at'],
  ['expenses', 'select * from expenses where shop_id = $1 order by expense_date, created_at'],
  ['orders', 'select * from orders where shop_id = $1 order by created_at'],
  ['order_items', `select oi.* from order_items oi
                     join orders o on o.id = oi.order_id
                    where o.shop_id = $1
                    order by oi.order_id, oi.id`],
  ['print_stations', 'select * from print_stations where shop_id = $1 order by created_at'],
  ['print_jobs', 'select * from print_jobs where shop_id = $1 order by created_at'],
];

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const shopResult = await client.query('select * from shops where slug = $1', [slug]);
  if (shopResult.rowCount === 0) {
    console.error(`No shop with slug "${slug}". Shops in this database:`);
    const all = await client.query('select slug, name from shops order by slug');
    for (const s of all.rows) console.error(`  ${s.slug}  (${s.name})`);
    await client.end();
    process.exit(1);
  }
  const shop = shopResult.rows[0];

  const data = {};
  const counts = {};
  for (const [table, sql] of TABLES) {
    const { rows } = await client.query(sql, [shop.id]);
    data[table] = rows;
    counts[table] = rows.length;
  }

  // Passwords are already one-way hashes, but a backup file is a copy of them
  // and there is no reason for it to be one. Nothing here needs them to be a
  // faithful record of the shop's trading.
  for (const user of data.users) {
    if ('password_hash' in user) user.password_hash = '[redacted by export]';
  }

  // Host only — never the credentials that are in the same connection string.
  let host = 'unknown';
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    /* leave as unknown */
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = {
    manifest: {
      shop: { slug: shop.slug, name: shop.name, id: shop.id },
      exportedAt: new Date().toISOString(),
      sourceHost: host,
      counts,
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0) + 1,
      note:
        'Logical export of one shop. Not a schema backup and not a full ' +
        'database backup — see the header of scripts/export-shop.js.',
    },
    shop,
    ...data,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${slug}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));

  const size = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`Exported "${shop.name}" (${shop.slug}) from ${host}`);
  console.table(counts);
  console.log(`${payload.manifest.totalRows} rows -> ${file} (${size} KB)`);

  await client.end();
})().catch((error) => {
  console.error('Export failed:', error.message);
  process.exit(1);
});
