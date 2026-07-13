import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './config/data-source-options';

/**
 * Standalone DataSource used by the TypeORM CLI (migration:generate/run/revert).
 * The Nest app itself configures TypeORM in app.module.ts.
 */
const dataSource = new DataSource(buildDataSourceOptions());

export default dataSource;
