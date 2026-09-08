-- Read-only. Reports what a database actually has, so a deploy can be checked
-- rather than assumed.
--
--   psql "$DATABASE_URL" -f scripts/check-schema.sql
--
-- Run it before deploying to see where a database stands, and after deploying
-- to confirm the migrations did what they were supposed to. It writes nothing.

\echo '--- migrations recorded ---'
select timestamp, name from migrations order by timestamp;

\echo '--- tables that should exist ---'
select t.name as expected_table,
       case when to_regclass(t.name) is null then 'MISSING' else 'ok' end as status
  from (values ('shops'), ('users'), ('expenses'), ('expense_categories'),
               ('menu_items'), ('menu_categories'), ('orders'), ('order_items'),
               ('print_jobs'), ('print_stations')) as t(name)
 order by status desc, expected_table;

\echo '--- dine-in columns on orders ---'
select c.name as expected_column,
       case when exists (
              select 1 from information_schema.columns
               where table_schema = current_schema()
                 and table_name = 'orders' and column_name = c.name
            ) then 'ok' else 'MISSING' end as status
  from (values ('table_number'), ('is_paid'), ('paid_at'),
               ('is_served'), ('served_at')) as c(name)
 order by status desc, expected_column;

\echo '--- orders that would drop out of sales figures ---'
-- After BaselineGaps has run this should only ever be genuinely open bills
-- from the current service. A large number here on a freshly migrated database
-- means the backfill did not run.
select count(*) as completed_but_unpaid
  from orders
 where is_paid = false
   and status = 'COMPLETED';
