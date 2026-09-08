import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the database connection.
 * Used both by the Nest app (TypeOrmModule) and by the standalone
 * DataSource that the TypeORM CLI needs for migrations.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const databaseUrl = process.env.DATABASE_URL;

  /**
   * Schema changes come from migrations, never from the entities.
   *
   * `synchronize` used to be on whenever `NODE_ENV` was not exactly
   * `production` — which meant one unset variable on a server was enough to
   * let a deploy reshape the live database, dropping any column an entity had
   * stopped declaring. Migrations are now the only path, and this is an
   * explicit opt-in for a throwaway database rather than something inferred
   * from the environment name.
   */
  const synchronize = process.env.DB_SYNCHRONIZE === 'true';

  // Neon (and most cloud Postgres) requires SSL
  const useSsl =
    databaseUrl?.includes('neon.tech') ||
    databaseUrl?.includes('sslmode=require') ||
    process.env.DB_SSL === 'true';

  return {
    type: 'postgres',
    // Prefer a single connection string; fall back to individual vars
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          username: process.env.DB_USERNAME ?? 'postgres',
          password: process.env.DB_PASSWORD ?? 'postgres',
          database: process.env.DB_DATABASE ?? 'shop_pos',
        }),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    // Glob picks up every *.entity.ts (dev) / *.entity.js (built) file.
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    synchronize,
    logging: process.env.NODE_ENV === 'development',
  };
}
