import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The schema as it stood when migrations were introduced: every table, enum,
 * index and foreign key the entities describe.
 *
 * Generated against an empty schema so a fresh database can be built from it.
 * The database that was already running when this was written has the same
 * shape, so this migration is recorded there as applied rather than executed —
 * see docs/OPERATIONS.md.
 */
export class InitialSchema1788893312507 implements MigrationInterface {
  name = 'InitialSchema1788893312507';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The uuid defaults below call uuid_generate_v4(), so the extension
    // that provides it has to exist before the first table is created.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "shops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "address" text, "phone" character varying, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8c28ec876676eeb1dcb65c01b7f" UNIQUE ("slug"), CONSTRAINT "PK_3c6aaa6607d287de99815e60b96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM('SUPER_ADMIN', 'OWNER', 'STAFF')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" "users_role_enum" NOT NULL DEFAULT 'STAFF', "shop_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_39e0ab619d2865a101db749751" ON "users"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "title" character varying NOT NULL, "amount" numeric(10,2) NOT NULL, "expense_date" date NOT NULL, "note" text, "category_id" uuid, "created_by_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e216a2053b81e431182baa7998" ON "expenses"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fe39a24be568bdb4292aa55c5b" ON "expenses"  ("expense_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "expense_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d0ef31e189d9523461215b62775" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_407d8772ac6a3a030cd2e20202" ON "expense_categories"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a6b3453ecdb95c5d431b249fe5" ON "expense_categories"  ("shop_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "menu_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "price" numeric(10,2) NOT NULL, "is_available" boolean NOT NULL DEFAULT true, "image_url" character varying, "category_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_57e6188f929e5dc6919168620c8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_848d4d5ad2c66ec417a3e887ce" ON "menu_items"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "menu_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_124ae987900336f983881cb04e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c23a27400059b6020a5c5a0e4c" ON "menu_categories"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "orders_payment_method_enum" AS ENUM('CASH', 'BKASH', 'NAGAD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "orders_status_enum" AS ENUM('COMPLETED', 'VOIDED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "order_number" character varying NOT NULL, "table_number" character varying(16), "subtotal" numeric(10,2) NOT NULL, "discount" numeric(10,2) NOT NULL DEFAULT '0', "tax" numeric(10,2) NOT NULL DEFAULT '0', "total" numeric(10,2) NOT NULL, "payment_method" "orders_payment_method_enum" NOT NULL, "status" "orders_status_enum" NOT NULL DEFAULT 'COMPLETED', "is_paid" boolean NOT NULL DEFAULT false, "paid_at" TIMESTAMP WITH TIME ZONE, "is_served" boolean NOT NULL DEFAULT false, "served_at" TIMESTAMP WITH TIME ZONE, "created_by_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_33f20db82908f7685a5c0c58ac" ON "orders"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c884e321f927d5b86aac7c8f9e" ON "orders"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09f56f64b827f76704069808c4" ON "orders"  ("shop_id", "table_number", "is_paid") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6180fdfa5666f21e6994de3973" ON "orders"  ("shop_id", "order_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "menu_item_id" uuid, "name_snapshot" character varying NOT NULL, "unit_price" numeric(10,2) NOT NULL, "quantity" integer NOT NULL, "line_total" numeric(10,2) NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "print_jobs_type_enum" AS ENUM('RECEIPT', 'KITCHEN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "print_jobs_status_enum" AS ENUM('PENDING', 'PRINTING', 'DONE', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "print_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "type" "print_jobs_type_enum" NOT NULL, "payload" jsonb NOT NULL, "status" "print_jobs_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "error" text, "claimed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a581cb9acbf52d919f86445434e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5258b50f79ebfb0da88d76ef04" ON "print_jobs"  ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_482d65fa1cd029db280eebbf91" ON "print_jobs"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_84957a1f82b4dc5fa9986ff04d" ON "print_jobs"  ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "print_stations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "name" character varying NOT NULL, "printer_connected" boolean NOT NULL DEFAULT false, "last_error" text, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c84b86bbdfaaeec091e7cc4fe10" UNIQUE ("shop_id"), CONSTRAINT "PK_ef26081f305ed9c59f946ff6bba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_39e0ab619d2865a101db749751a" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_e216a2053b81e431182baa79984" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_5d1f4be708e0dfe2afa1a3c376c" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_cb8a9ecdb628ea1befdbaf6e078" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_categories" ADD CONSTRAINT "FK_407d8772ac6a3a030cd2e20202c" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD CONSTRAINT "FK_848d4d5ad2c66ec417a3e887ce7" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" ADD CONSTRAINT "FK_20cff56c44dd4fe52d5aa2b96f8" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_categories" ADD CONSTRAINT "FK_c23a27400059b6020a5c5a0e4c8" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_33f20db82908f7685a5c0c58ac6" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_f93cc7892226abb9c88e7131381" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_e462517174f561ece2916701c0a" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "print_jobs" ADD CONSTRAINT "FK_5258b50f79ebfb0da88d76ef048" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "print_stations" ADD CONSTRAINT "FK_c84b86bbdfaaeec091e7cc4fe10" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "print_stations" DROP CONSTRAINT "FK_c84b86bbdfaaeec091e7cc4fe10"`,
    );
    await queryRunner.query(
      `ALTER TABLE "print_jobs" DROP CONSTRAINT "FK_5258b50f79ebfb0da88d76ef048"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_e462517174f561ece2916701c0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_f93cc7892226abb9c88e7131381"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_33f20db82908f7685a5c0c58ac6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_categories" DROP CONSTRAINT "FK_c23a27400059b6020a5c5a0e4c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" DROP CONSTRAINT "FK_20cff56c44dd4fe52d5aa2b96f8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "menu_items" DROP CONSTRAINT "FK_848d4d5ad2c66ec417a3e887ce7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_categories" DROP CONSTRAINT "FK_407d8772ac6a3a030cd2e20202c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_cb8a9ecdb628ea1befdbaf6e078"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_5d1f4be708e0dfe2afa1a3c376c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_e216a2053b81e431182baa79984"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_39e0ab619d2865a101db749751a"`,
    );
    await queryRunner.query(`DROP TABLE "print_stations"`);
    await queryRunner.query(`DROP INDEX "IDX_84957a1f82b4dc5fa9986ff04d"`);
    await queryRunner.query(`DROP INDEX "IDX_482d65fa1cd029db280eebbf91"`);
    await queryRunner.query(`DROP INDEX "IDX_5258b50f79ebfb0da88d76ef04"`);
    await queryRunner.query(`DROP TABLE "print_jobs"`);
    await queryRunner.query(`DROP TYPE "print_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "print_jobs_type_enum"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "IDX_6180fdfa5666f21e6994de3973"`);
    await queryRunner.query(`DROP INDEX "IDX_09f56f64b827f76704069808c4"`);
    await queryRunner.query(`DROP INDEX "IDX_c884e321f927d5b86aac7c8f9e"`);
    await queryRunner.query(`DROP INDEX "IDX_33f20db82908f7685a5c0c58ac"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "orders_payment_method_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_c23a27400059b6020a5c5a0e4c"`);
    await queryRunner.query(`DROP TABLE "menu_categories"`);
    await queryRunner.query(`DROP INDEX "IDX_848d4d5ad2c66ec417a3e887ce"`);
    await queryRunner.query(`DROP TABLE "menu_items"`);
    await queryRunner.query(`DROP INDEX "IDX_a6b3453ecdb95c5d431b249fe5"`);
    await queryRunner.query(`DROP INDEX "IDX_407d8772ac6a3a030cd2e20202"`);
    await queryRunner.query(`DROP TABLE "expense_categories"`);
    await queryRunner.query(`DROP INDEX "IDX_fe39a24be568bdb4292aa55c5b"`);
    await queryRunner.query(`DROP INDEX "IDX_e216a2053b81e431182baa7998"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP INDEX "IDX_39e0ab619d2865a101db749751"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
    await queryRunner.query(`DROP TABLE "shops"`);
  }
}
