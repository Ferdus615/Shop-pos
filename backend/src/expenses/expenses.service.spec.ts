import { DataSource, Repository } from 'typeorm';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesService } from './expenses.service';

/**
 * Cover for the two rules that decide what a stored entry ends up holding.
 *
 * The first is how an update persists its foreign keys. TypeORM's `save()`
 * lets a loaded relation take precedence over the FK column, and the two
 * disagreeing loses data silently — two bugs came out of that here: loading
 * the stale `category` wrote the old id back over a new one, and nulling the
 * relation to force the column through wiped the category of every expense
 * saved with its category unchanged. The fix is to load no relation at all in
 * `update`, so the FK columns are the only source of truth.
 *
 * The second is that entries snapshot what they were bought as. The name,
 * category, unit and price are copied onto the row from the item, so renaming,
 * re-filing or retiring an item later cannot rewrite the books.
 */
describe('ExpensesService', () => {
  const SHOP = 'shop-1';

  const CHICKEN = {
    id: 'item-chicken',
    shopId: SHOP,
    categoryId: 'cat-groceries',
    name: 'Chicken',
    unit: 'kg',
    defaultUnitPrice: 320,
    isActive: true,
  } as ExpenseItem;

  const BREAD = {
    id: 'item-bread',
    shopId: SHOP,
    categoryId: 'cat-bakery',
    name: 'Bread',
    unit: 'pcs',
    defaultUnitPrice: null,
    isActive: true,
  } as ExpenseItem;

  function buildService(
    existing: Partial<Expense> = {},
    catalogue: ExpenseItem[] = [CHICKEN, BREAD],
  ) {
    const stored = {
      id: 'e1',
      shopId: SHOP,
      title: 'Chicken',
      amount: 320,
      quantity: 1,
      unit: 'kg',
      unitPrice: 320,
      expenseDate: '2026-09-09',
      note: null,
      categoryId: 'cat-groceries',
      itemId: CHICKEN.id,
      ...existing,
    } as Expense;

    const findOneCalls: { relations?: unknown }[] = [];
    const saved: Expense[] = [];
    const created: Partial<Expense>[] = [];

    const expenses = {
      // `update` re-reads through `findOne` to return the fresh row, so both
      // reads can answer with the same object for these assertions.
      findOne: jest.fn((opts: { relations?: unknown }) => {
        findOneCalls.push(opts);
        return Promise.resolve(stored);
      }),
      create: jest.fn((row: Partial<Expense>) => {
        created.push(row);
        return row as Expense;
      }),
      save: jest.fn((e: Expense) => {
        saved.push({ ...e });
        return Promise.resolve(e);
      }),
    } as unknown as Repository<Expense>;

    const items = {
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(catalogue.find((i) => i.id === where.id) ?? null),
      ),
      find: jest.fn(({ where }: { where: { id: string }[] }) =>
        Promise.resolve(
          where
            .map((w) => catalogue.find((i) => i.id === w.id))
            .filter((i): i is ExpenseItem => Boolean(i)),
        ),
      ),
    } as unknown as Repository<ExpenseItem>;

    return {
      service: new ExpensesService(expenses, items, {} as DataSource),
      saved,
      created,
      findOneCalls,
    };
  }

  describe('create', () => {
    it('takes the title, category and unit from the item', async () => {
      const { service, created } = buildService();

      await service.create(
        { itemId: CHICKEN.id, quantity: 1, expenseDate: '2026-09-09' },
        'user-1',
        SHOP,
      );

      expect(created[0]).toMatchObject({
        title: 'Chicken',
        categoryId: 'cat-groceries',
        itemId: CHICKEN.id,
        unit: 'kg',
        expenseDate: '2026-09-09',
      });
    });

    it('multiplies quantity by the item price when no amount is given', async () => {
      const { service, created } = buildService();

      await service.create({ itemId: CHICKEN.id, quantity: 1.5 }, null, SHOP);

      expect(created[0].unitPrice).toBe(320);
      expect(created[0].amount).toBe(480);
    });

    it('lets an amount paid on the day override the item price', async () => {
      const { service, created } = buildService();

      await service.create(
        { itemId: CHICKEN.id, quantity: 1, amount: 300 },
        null,
        SHOP,
      );

      expect(created[0].amount).toBe(300);
    });

    it('demands an amount when the item has no price to multiply by', async () => {
      const { service, created } = buildService();

      await expect(
        service.create({ itemId: BREAD.id, quantity: 2 }, null, SHOP),
      ).rejects.toThrow(/amount/i);
      expect(created).toHaveLength(0);
    });

    it('rejects an item from another shop before saving anything', async () => {
      const { service, created } = buildService({}, []);

      await expect(
        service.create({ itemId: 'item-of-other-shop' }, null, SHOP),
      ).rejects.toThrow(/does not exist/i);
      expect(created).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('never loads the category or item relation before saving', async () => {
      const { service, findOneCalls } = buildService();

      await service.update('e1', { amount: 250 }, SHOP);

      // The first read is the one that gets saved; it must carry no relation.
      expect(findOneCalls[0].relations).toBeUndefined();
    });

    it('keeps the item and category when only the amount changes', async () => {
      const { service, saved } = buildService();

      await service.update('e1', { amount: 250 }, SHOP);

      expect(saved[0].amount).toBe(250);
      expect(saved[0].itemId).toBe(CHICKEN.id);
      expect(saved[0].categoryId).toBe('cat-groceries');
    });

    it('recomputes the amount when the quantity changes', async () => {
      const { service, saved } = buildService();

      await service.update('e1', { quantity: 2 }, SHOP);

      expect(saved[0].quantity).toBe(2);
      expect(saved[0].amount).toBe(640);
    });

    it('re-derives the title, category and unit when the item changes', async () => {
      const { service, saved } = buildService();

      await service.update('e1', { itemId: BREAD.id, amount: 60 }, SHOP);

      expect(saved[0]).toMatchObject({
        itemId: BREAD.id,
        title: 'Bread',
        categoryId: 'cat-bakery',
        unit: 'pcs',
        amount: 60,
      });
    });

    it('leaves a pre-catalogue entry without an item when none is chosen', async () => {
      const { service, saved } = buildService({
        title: 'September shop rent',
        itemId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        categoryId: null,
      });

      await service.update('e1', { amount: 12000 }, SHOP);

      expect(saved[0].title).toBe('September shop rent');
      expect(saved[0].itemId).toBeNull();
      expect(saved[0].amount).toBe(12000);
    });

    it('clears a note sent as null', async () => {
      const { service, saved } = buildService({ note: 'paid in cash' });

      await service.update('e1', { note: null } as never, SHOP);

      expect(saved[0].note).toBeNull();
    });

    it('rejects an item from another shop before saving anything', async () => {
      const { service, saved } = buildService({}, [CHICKEN]);

      await expect(
        service.update('e1', { itemId: 'item-of-other-shop' }, SHOP),
      ).rejects.toThrow(/does not exist/i);
      expect(saved).toHaveLength(0);
    });
  });
});
