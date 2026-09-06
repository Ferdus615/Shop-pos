import { Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesService } from './expenses.service';

/**
 * Regression cover for how an update persists the category.
 *
 * TypeORM's `save()` lets a loaded relation take precedence over the FK
 * column, and the two disagreeing loses data silently. Two bugs have come out
 * of that here: loading the stale `category` wrote the old id back over a new
 * one, and nulling the relation to force the column through wiped the category
 * of every expense saved with its category unchanged. The fix is to load no
 * relation at all in `update`, so `categoryId` is the only source of truth —
 * which is what these tests pin down.
 */
describe('ExpensesService.update — category assignment', () => {
  const SHOP = 'shop-1';

  function buildService(existing: Partial<Expense> = {}) {
    const stored = {
      id: 'e1',
      shopId: SHOP,
      title: 'Rent',
      amount: 100,
      expenseDate: '2026-09-01',
      note: null,
      categoryId: 'cat-old',
      ...existing,
    } as Expense;

    const findOneCalls: unknown[] = [];
    const saved: Expense[] = [];
    const expenses = {
      findOne: jest.fn((opts: unknown) => {
        findOneCalls.push(opts);
        return Promise.resolve(stored);
      }),
      save: jest.fn((e: Expense) => {
        saved.push({ ...e });
        return Promise.resolve(e);
      }),
    } as unknown as Repository<Expense>;

    const categories = {
      existsBy: jest.fn().mockResolvedValue(true),
    } as unknown as Repository<ExpenseCategory>;

    return {
      service: new ExpensesService(expenses, categories),
      saved,
      findOneCalls: findOneCalls as { relations?: unknown }[],
    };
  }

  it('never loads the category relation before saving', async () => {
    const { service, findOneCalls } = buildService();

    await service.update('e1', { amount: 250 }, SHOP);

    // The first read is the one that gets saved; it must carry no relation.
    expect(findOneCalls[0].relations).toBeUndefined();
  });

  it('keeps the category when an unrelated field changes', async () => {
    const { service, saved } = buildService();

    // The common edit: change the amount, leave the category alone.
    await service.update('e1', { amount: 250 }, SHOP);

    expect(saved[0].amount).toBe(250);
    expect(saved[0].categoryId).toBe('cat-old');
  });

  it('keeps the category when the same category is sent back', async () => {
    const { service, saved } = buildService();

    // What the edit form actually posts: every field, category unchanged.
    await service.update(
      'e1',
      { title: 'Rent', amount: 250, categoryId: 'cat-old' },
      SHOP,
    );

    expect(saved[0].categoryId).toBe('cat-old');
  });

  it('moves an expense to another category', async () => {
    const { service, saved } = buildService();

    await service.update('e1', { categoryId: 'cat-new' }, SHOP);

    expect(saved[0].categoryId).toBe('cat-new');
  });

  it('clears the category when sent null', async () => {
    const { service, saved } = buildService();

    await service.update('e1', { categoryId: null } as never, SHOP);

    expect(saved[0].categoryId).toBeNull();
  });

  it('leaves an unfiled expense unfiled when the field is absent', async () => {
    const { service, saved } = buildService({ categoryId: null });

    await service.update('e1', { title: 'Rent (September)' }, SHOP);

    expect(saved[0].title).toBe('Rent (September)');
    expect(saved[0].categoryId).toBeNull();
  });

  it('clears a note sent as null', async () => {
    const { service, saved } = buildService({ note: 'paid in cash' });

    await service.update('e1', { note: null } as never, SHOP);

    expect(saved[0].note).toBeNull();
  });

  it('rejects a category from another shop before saving anything', async () => {
    const { service, saved } = buildService();
    const categories = { existsBy: jest.fn().mockResolvedValue(false) };
    const scoped = new ExpensesService(
      (service as unknown as { expensesRepository: Repository<Expense> })
        .expensesRepository,
      categories as unknown as Repository<ExpenseCategory>,
    );

    await expect(
      scoped.update('e1', { categoryId: 'cat-of-other-shop' }, SHOP),
    ).rejects.toThrow(/does not exist/i);
    expect(saved).toHaveLength(0);
  });
});
