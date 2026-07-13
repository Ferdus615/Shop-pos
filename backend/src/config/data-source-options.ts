import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the database connection.
 * Used both by the Nest app (TypeOrmModule) and by the standalone
 * DataSource that the TypeORM CLI needs for migrations.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'shop_pos',
    // Glob picks up every *.entity.ts (dev) / *.entity.js (built) file.
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    // Auto-sync the schema in dev for a fast feedback loop.
    // In production rely on migrations instead.
    synchronize: !isProduction,
    logging: process.env.NODE_ENV === 'development',
  };
}
