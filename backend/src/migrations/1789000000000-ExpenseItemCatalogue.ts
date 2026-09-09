import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns expenses from typed one-off titles into purchases of catalogued items.
 *
 * `expense_items` is the shop's own list of things it buys — "Chicken" under
 * "Groceries" — and an entry now points at one, carrying the quantity and unit
 * that were bought.
 *
 * Nothing already recorded is rewritten. `expenses.title` stays NOT NULL and
 * keeps holding the name, so old entries read exactly as they did; the new
 * columns are all nullable, which is what an entry predating the catalogue
 * looks like. New entries fill them in and copy the item's name into `title`,
 * so renaming or retiring an item later leaves the books alone.
 */
export class ExpenseItemCatalogue1789000000000 implements MigrationInterface {
  name = 'ExpenseItemCatalogue1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "expense_items" (
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "shop_id" uuid NOT NULL,
         "category_id" uuid NOT NULL,
         "name" character varying NOT NULL,
         "unit" character varying NOT NULL DEFAULT 'pcs',
         "default_unit_price" numeric(10,2),
         "is_active" boolean NOT NULL DEFAULT true,
         "created_at" TIMESTAMP NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
         CONSTRAINT "PK_expense_items_id" PRIMARY KEY ("id")
       )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expense_items_shop_id" ON "expense_items" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expense_items_category_id" ON "expense_items" ("category_id")`,
    );
    // A name only has to be unique inside one category of one shop.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_expense_items_shop_category_name" ON "expense_items" ("shop_id", "category_id", "name")`,
    );

    await this.addForeignKey(
      queryRunner,
      'expense_items',
      'FK_expense_items_shop',
      `FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE`,
    );
    await this.addForeignKey(
      queryRunner,
      'expense_items',
      'FK_expense_items_category',
      `FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "expenses"
         ADD COLUMN IF NOT EXISTS "item_id" uuid,
         ADD COLUMN IF NOT EXISTS "quantity" numeric(12,3),
         ADD COLUMN IF NOT EXISTS "unit" character varying,
         ADD COLUMN IF NOT EXISTS "unit_price" numeric(10,2)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expenses_item_id" ON "expenses" ("item_id")`,
    );
    /**
     * SET NULL rather than CASCADE: an item is normally retired instead of
     * deleted, but if one ever is deleted the purchase must survive — it is
     * money that left the till, and `title` still says what it went on.
     */
    await this.addForeignKey(
      queryRunner,
      'expenses',
      'FK_expenses_item',
      `FOREIGN KEY ("item_id") REFERENCES "expense_items"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_item"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expenses_item_id"`);
    await queryRunner.query(
      `ALTER TABLE "expenses"
         DROP COLUMN IF EXISTS "unit_price",
         DROP COLUMN IF EXISTS "unit",
         DROP COLUMN IF EXISTS "quantity",
         DROP COLUMN IF EXISTS "item_id"`,
    );
    // The table goes last: the FK above references it.
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_items"`);
  }

  /** `ADD CONSTRAINT` has no `IF NOT EXISTS`, so it is guarded by hand. */
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
