import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseItemsService } from './expense-items.service';

/**
 * Cover for what happens to a name after its item is deleted.
 *
 * Deleting an item that has purchases behind it only retires the row — it has
 * to stay so those entries keep their label. That row still owns the name in
 * `(shop_id, category_id, name)`, so re-adding the same item used to fail with
 * a conflict against something the owner could not see. Creating over a
 * retired name revives it instead.
 */
describe('ExpenseItemsService', () => {
  const SHOP = 'shop-1';
  const CATEGORY = 'cat-groceries';

  function buildService(catalogue: ExpenseItem[], usedItemIds: string[] = []) {
    const saved: ExpenseItem[] = [];
    const removed: ExpenseItem[] = [];

    const items = {
      findOne: jest.fn(
        ({ where }: { where: Partial<ExpenseItem> }) =>
          Promise.resolve(
            catalogue.find((i) =>
              Object.entries(where).every(
                ([key, value]) => i[key as keyof ExpenseItem] === value,
              ),
            ) ?? null,
          ) as Promise<ExpenseItem | null>,
      ),
      create: jest.fn((row: Partial<ExpenseItem>) => row as ExpenseItem),
      save: jest.fn((item: ExpenseItem) => {
        saved.push({ ...item });
        return Promise.resolve(item);
      }),
      remove: jest.fn((item: ExpenseItem) => {
        removed.push(item);
        return Promise.resolve(item);
      }),
    } as unknown as Repository<ExpenseItem>;

    const categories = {
      existsBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(id === CATEGORY),
      ),
    } as unknown as Repository<ExpenseCategory>;

    const expenses = {
      existsBy: jest.fn(({ itemId }: { itemId: string }) =>
        Promise.resolve(usedItemIds.includes(itemId)),
      ),
    } as unknown as Repository<Expense>;

    return {
      service: new ExpenseItemsService(items, categories, expenses),
      saved,
      removed,
    };
  }

  function item(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
    return {
      id: 'item-oil',
      shopId: SHOP,
      categoryId: CATEGORY,
      name: 'তেল',
      unit: 'ltr',
      defaultUnitPrice: 180,
      isActive: true,
      ...overrides,
    } as ExpenseItem;
  }

  describe('create', () => {
    it('revives a retired item of the same name instead of conflicting', async () => {
      const retired = item({ isActive: false });
      const { service, saved } = buildService([retired]);

      const result = await service.create(
        { name: 'তেল', categoryId: CATEGORY, unit: 'ltr' },
        SHOP,
      );

      expect(result.id).toBe(retired.id);
      expect(saved).toHaveLength(1);
      expect(saved[0].isActive).toBe(true);
    });

    it('applies the unit and price just typed when reviving', async () => {
      const { service, saved } = buildService([item({ isActive: false })]);

      await service.create(
        {
          name: 'তেল',
          categoryId: CATEGORY,
          unit: 'bottle',
          defaultUnitPrice: 210,
        },
        SHOP,
      );

      expect(saved[0].unit).toBe('bottle');
      expect(saved[0].defaultUnitPrice).toBe(210);
    });

    it('keeps the retired unit and price when none is given', async () => {
      const { service, saved } = buildService([item({ isActive: false })]);

      await service.create({ name: 'তেল', categoryId: CATEGORY }, SHOP);

      expect(saved[0].unit).toBe('ltr');
      expect(saved[0].defaultUnitPrice).toBe(180);
    });

    it('still refuses a name a live item already holds', async () => {
      const { service } = buildService([item()]);

      await expect(
        service.create({ name: 'তেল', categoryId: CATEGORY }, SHOP),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('retires an item that has been bought, keeping the row', async () => {
      const bought = item();
      const { service, saved, removed } = buildService([bought], [bought.id]);

      const result = await service.remove(bought.id, SHOP);

      expect(result.deleted).toBe(false);
      expect(removed).toHaveLength(0);
      expect(saved[0].isActive).toBe(false);
    });

    it('deletes an item that was never bought', async () => {
      const unused = item();
      const { service, removed } = buildService([unused]);

      const result = await service.remove(unused.id, SHOP);

      expect(result.deleted).toBe(true);
      expect(removed).toHaveLength(1);
    });
  });
});
