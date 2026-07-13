import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Role } from './common/enums/role.enum';
import { UsersService } from './users/users.service';

/**
 * Creates the first OWNER account from the OWNER_* env vars.
 * Booting AppModule also syncs the schema (in dev), so this doubles as a
 * one-shot bootstrap for a fresh database. Safe to re-run — it skips if the
 * owner already exists.
 */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const usersService = app.get(UsersService);
    const email = process.env.OWNER_EMAIL ?? 'owner@shop.local';

    const existing = await usersService.findByEmailWithPassword(email);
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Owner "${email}" already exists — nothing to do.`);
      return;
    }

    await usersService.create({
      name: process.env.OWNER_NAME ?? 'Shop Owner',
      email,
      password: process.env.OWNER_PASSWORD ?? 'owner123',
      role: Role.OWNER,
    });
    // eslint-disable-next-line no-console
    console.log(`Created owner account: ${email}`);
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
