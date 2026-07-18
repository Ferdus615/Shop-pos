import 'reflect-metadata';
import 'dotenv/config';
import { Role } from './common/enums/role.enum';
import { UsersService } from './users/users.service';

import { INestApplicationContext } from '@nestjs/common';

/**
 * Creates the first OWNER account from the OWNER_* env vars.
 * Safe to re-run — it skips if the owner already exists.
 */
export async function runSeeder(app: INestApplicationContext) {
  const usersService = app.get(UsersService);
  const email = process.env.OWNER_EMAIL ?? 'owner@shop.local';

  const existing = await usersService.findByEmailWithPassword(email);
  if (existing) {
    console.log(`Owner "${email}" already exists — nothing to do.`);
    return;
  }

  await usersService.create({
    name: process.env.OWNER_NAME ?? 'Shop Owner',
    email,
    password: process.env.OWNER_PASSWORD ?? 'owner123',
    role: Role.OWNER,
  });

  console.log(`Created owner account: ${email}`);
}
