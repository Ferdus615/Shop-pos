import 'reflect-metadata';
import 'dotenv/config';
import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from './common/enums/role.enum';
import { Shop } from './shops/entities/shop.entity';
import { UsersService } from './users/users.service';

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
    await usersService.createRaw({
      name: process.env.SUPER_ADMIN_NAME ?? 'Platform Admin',
      email: adminEmail,
      password: process.env.SUPER_ADMIN_PASSWORD ?? 'admin123',
      role: Role.SUPER_ADMIN,
      shopId: null,
    });
    console.log(`Created platform admin: ${adminEmail}`);
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

  await usersService.createRaw({
    name: process.env.OWNER_NAME ?? 'Shop Owner',
    email: ownerEmail,
    password: process.env.OWNER_PASSWORD ?? 'owner123',
    role: Role.OWNER,
    shopId: shop.id,
  });
  console.log(`Created owner account: ${ownerEmail} for shop "${shop.name}"`);
}
