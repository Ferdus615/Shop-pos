import 'reflect-metadata';
import 'dotenv/config';
import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from './common/enums/role.enum';
import { Shop } from './shops/entities/shop.entity';
import { UsersService } from './users/users.service';

/** Passwords this project has published, and so can never protect anything. */
const KNOWN_DEFAULTS = ['admin123', 'owner123', 'staff123', 'password'];

/**
 * A password good enough to put on the public internet.
 *
 * The old fallbacks (`admin123`, `owner123`) were in the repository, the
 * README and the docs, which made every deployment that skipped the
 * environment variables openly accessible — as a platform administrator, in
 * the admin's case. Refusing to create the account is noisy and inconvenient;
 * creating it with a published password is worse.
 */
function usablePassword(value: string | undefined): string | null {
  if (!value) return null;
  if (KNOWN_DEFAULTS.includes(value)) return null;
  if (value.length < 10) return null;
  return value;
}

/**
 * Bootstraps the two accounts nobody else can create:
 *
 *  1. the platform administrator, who creates shops; and
 *  2. a first demo shop with its owner, so a fresh install is usable.
 *
 * Safe to re-run — each step is skipped if it already exists.
 */
export async function runSeeder(app: INestApplicationContext) {
  const usersService = app.get(UsersService);
  const dataSource = app.get(DataSource);
  const shopsRepository = dataSource.getRepository(Shop);

  // --- Platform administrator -------------------------------------------
  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@shop-pos.local';
  if (await usersService.findByEmailWithPassword(adminEmail)) {
    console.log(`Platform admin "${adminEmail}" already exists.`);
  } else {
    const adminPassword = usablePassword(process.env.SUPER_ADMIN_PASSWORD);
    if (!adminPassword) {
      console.warn(
        `Skipped creating the platform admin "${adminEmail}": set ` +
          'SUPER_ADMIN_PASSWORD to something of your own, at least 10 ' +
          'characters and not one of this project's published defaults.',
      );
    } else {
      await usersService.createRaw({
        name: process.env.SUPER_ADMIN_NAME ?? 'Platform Admin',
        email: adminEmail,
        password: adminPassword,
        role: Role.SUPER_ADMIN,
        shopId: null,
      });
      console.log(`Created platform admin: ${adminEmail}`);
    }
  }

  // --- Demo shop + its owner --------------------------------------------
  const shopSlug = process.env.SEED_SHOP_SLUG ?? 'demo-shop';
  const ownerEmail = process.env.OWNER_EMAIL ?? 'owner@shop.local';

  let shop = await shopsRepository.findOne({ where: { slug: shopSlug } });
  if (!shop) {
    shop = await shopsRepository.save(
      shopsRepository.create({
        name: process.env.SEED_SHOP_NAME ?? 'Demo Shop',
        slug: shopSlug,
        address: process.env.SEED_SHOP_ADDRESS ?? null,
        phone: process.env.SEED_SHOP_PHONE ?? null,
      }),
    );
    console.log(`Created shop: ${shop.name} (${shop.slug})`);
  }

  if (await usersService.findByEmailWithPassword(ownerEmail)) {
    console.log(`Owner "${ownerEmail}" already exists — nothing to do.`);
    return;
  }

  const ownerPassword = usablePassword(process.env.OWNER_PASSWORD);
  if (!ownerPassword) {
    console.warn(
      `Skipped creating the owner "${ownerEmail}": set OWNER_PASSWORD to ` +
        "something of your own, at least 10 characters and not one of this " +
        'project's published defaults.',
    );
    return;
  }

  await usersService.createRaw({
    name: process.env.OWNER_NAME ?? 'Shop Owner',
    email: ownerEmail,
    password: ownerPassword,
    role: Role.OWNER,
    shopId: shop.id,
  });
  console.log(`Created owner account: ${ownerEmail} for shop "${shop.name}"`);
}
