-- Prepares a database to accept migrations for the first time.
--
-- Run this once against any database that existed before migrations were
-- introduced, BEFORE the first `migration:run`. It is safe to run against a
-- fresh database, and safe to run twice.
--
-- Why it is needed: `InitialSchema` builds the schema from nothing, and its
-- CREATE TABLE statements are not conditional. Pointed at a database that
-- already has those tables it fails on the first one. The documented fix is to
-- record it as applied rather than execute it — but only on a database that
-- really does already have the tables. This script makes that decision by
-- looking, instead of asking whoever is deploying to remember which kind of
-- database they are pointed at.
--
--   psql "$DATABASE_URL" -f scripts/mark-baseline.sql
--
-- What follows the baseline row is `BaselineGaps`, which fills in anything the
-- old database was actually missing (the printing tables, the dine-in columns
-- on orders) and backfills paid/served on historical orders. Every statement
-- in it is conditional, so it does not matter whether this database got its
-- schema from synchronize, from a partial deploy, or from InitialSchema.

begin;

-- TypeORM's own ledger. It creates this itself when it first runs, but the
-- insert below needs it to exist now.
create table if not exists migrations (
  id serial primary key,
  timestamp bigint not null,
  name character varying not null
);

insert into migrations (timestamp, name)
select 1788893312507, 'InitialSchema1788893312507'
 where to_regclass('shops') is not null           -- a pre-existing database...
   and not exists (                                -- ...not already recorded
     select 1 from migrations
      where name = 'InitialSchema1788893312507'
   );

-- Say which of the two paths this database is on, so the deploy log shows it.
select case
         when exists (select 1 from migrations
                       where name = 'InitialSchema1788893312507')
           then 'pre-existing schema: InitialSchema recorded as applied, BaselineGaps will fill any gaps'
         else 'empty database: InitialSchema will run normally'
       end as baseline_status;

commit;
