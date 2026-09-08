import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fills in whatever a database that predates migrations is missing.
 *
 * `InitialSchema` describes the schema as it stood when migrations were
 * introduced, and a database older than that is told to record it as applied
 * rather than execute it (docs/OPERATIONS.md §4). That is only true if the old
 * database really has that shape — and it does not always. Before this branch
 * the connection used `synchronize: !isProduction`, so a server running with
 * `NODE_ENV=production` never had the entities applied to it at all: the
 * printing tables and the dine-in columns on `orders` were only ever created
 * on environments where synchronize happened to be on.
 *
 * So rather than depend on knowing which of those a given database is, every
 * statement here is safe to run twice. On a fresh database that just ran
 * `InitialSchema` this migration finds everything already present and does
 * nothing; on a database that predates migrations it creates what was missed.
 *
 * It also carries the paid/served backfill that used to be a manual SQL step,
 * but only where it added those columns itself — see the note on that block.
 */
export class BaselineGaps1788900000000 implements MigrationInterface {
  name = 'BaselineGaps1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * Whether `orders` already tracked payment separately from service, read
     * *before* anything is added. This decides whether the backfill at the end
     * runs: it must touch orders that were rung up under the old flow, and
     * must not touch a database where `is_paid = false` is already meaningful
     * because it means "this table's bill is still open".
     */
    const dineInColumnsExisted = await this.hasColumn(
      queryRunner,
      'orders',
      'is_paid',
    );

    // The uuid defaults below need the extension that provides them.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // --- orders: dine-in columns ------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "table_number" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_paid" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_served" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "served_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Finding a table's open bill is on the hot path of every dine-in ring-up.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_09f56f64b827f76704069808c4" ON "orders" ("shop_id", "table_number", "is_paid")`,
    );

    // --- print_jobs -------------------------------------------------------
    await this.createEnum(
      queryRunner,
      'print_jobs_type_enum',
      `'RECEIPT', 'KITCHEN'`,
    );
    await this.createEnum(
      queryRunner,
      'print_jobs_status_enum',
      `'PENDING', 'PRINTING', 'DONE', 'FAILED'`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "print_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "type" "print_jobs_type_enum" NOT NULL, "payload" jsonb NOT NULL, "status" "print_jobs_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "error" text, "claimed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a581cb9acbf52d919f86445434e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_5258b50f79ebfb0da88d76ef04" ON "print_jobs" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_482d65fa1cd029db280eebbf91" ON "print_jobs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_84957a1f82b4dc5fa9986ff04d" ON "print_jobs" ("shop_id", "status")`,
    );
    await this.addForeignKey(
      queryRunner,
      'print_jobs',
      'FK_5258b50f79ebfb0da88d76ef048',
      `FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // --- print_stations ---------------------------------------------------
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "print_stations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying NOT NULL, "printer_connected" boolean NOT NULL DEFAULT false, "last_error" text, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c84b86bbdfaaeec091e7cc4fe10" UNIQUE ("shop_id"), CONSTRAINT "PK_ef26081f305ed9c59f946ff6bba" PRIMARY KEY ("id"))`,
    );
    await this.addForeignKey(
      queryRunner,
      'print_stations',
      'FK_c84b86bbdfaaeec091e7cc4fe10',
      `FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    /**
     * Backfill: orders that predate the paid/served split.
     *
     * Under the old flow, saving a sale meant the money had been taken and the
     * food served — there was no way to record anything else. The new columns
     * default to false, so without this every historical order reads as unpaid
     * and drops out of every sales figure.
     *
     * Guarded on the columns not having existed a moment ago. Where they did,
     * `is_paid = false` already carries meaning: it marks a table whose bill
     * is still open, and marking those paid would be silent corruption rather
     * than a backfill. Voided and refunded orders are left alone — they are
     * excluded from takings by status either way.
     */
    if (dineInColumnsExisted) {
      console.log(
        '[BaselineGaps] orders already tracked paid/served; backfill skipped',
      );
      return;
    }

    // node-postgres reports an UPDATE as [rows, rowCount].
    const result = (await queryRunner.query(
      `UPDATE "orders"
          SET "is_paid" = true, "paid_at" = "created_at",
              "is_served" = true, "served_at" = "created_at"
        WHERE "is_paid" = false
          AND "status" = 'COMPLETED'`,
    )) as [unknown[], number] | undefined;
    const affected = Array.isArray(result) ? result[1] : undefined;
    console.log(
      `[BaselineGaps] backfilled paid/served on ${String(
        affected ?? 'an unreported number of',
      )} pre-existing orders`,
    );
  }

  /**
   * Reverses what `up` creates.
   *
   * Destructive by nature: reverting drops the printing tables and the
   * paid/served columns, and the rows and values in them go with it. It exists
   * so the migration is not a one-way door, not because rolling it back on a
   * live database is a routine thing to do.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "print_stations" DROP CONSTRAINT IF EXISTS "FK_c84b86bbdfaaeec091e7cc4fe10"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "print_stations"`);
    await queryRunner.query(
      `ALTER TABLE "print_jobs" DROP CONSTRAINT IF EXISTS "FK_5258b50f79ebfb0da88d76ef048"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_84957a1f82b4dc5fa9986ff04d"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_482d65fa1cd029db280eebbf91"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_5258b50f79ebfb0da88d76ef04"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "print_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "print_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "print_jobs_type_enum"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_09f56f64b827f76704069808c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "served_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "is_served"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "paid_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "is_paid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "table_number"`,
    );
  }

  // --- helpers ------------------------------------------------------------

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1 AND column_name = $2`,
      [table, column],
    )) as unknown[];
    return rows.length > 0;
  }

  /** `CREATE TYPE` has no `IF NOT EXISTS`, so the check has to be spelled out. */
  private async createEnum(
    queryRunner: QueryRunner,
    name: string,
    values: string,
  ): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
           CREATE TYPE "${name}" AS ENUM(${values});
         END IF;
       END $$;`,
    );
  }

  /** Same for `ADD CONSTRAINT`. */
  private async addForeignKey(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    definition: string,
  ): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
           ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition};
         END IF;
       END $$;`,
    );
  }
}
