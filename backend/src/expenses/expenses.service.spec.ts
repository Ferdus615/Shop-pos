import { Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesService } from './expenses.service';

/**
 * Regression cover for tenant-visible category edits.
 *
 * `findOne` loads the `category` relation, and TypeORM's `save` lets a loaded
 * relation win over the FK column. Assigning only `categoryId` therefore wrote
 * the old category straight back, so recategorizing an expense — and clearing
 * it to Uncategorized — silently did nothing.
 */
describe('ExpensesService.update — category assignment', () => {
  const SHOP = 'shop-1';

  function buildService(existing: Partial<Expense>) {
    const stored = {
      id: 'e1',
      shopId: SHOP,
      title: 'Rent',
      amount: 100,
      expenseDate: '2026-09-01',
      note: null,
      categoryId: 'cat-old',
      // What findOne's `relations: { category: true }` leaves on the entity.
      category: { id: 'cat-old', name: 'Old' } as ExpenseCategory,
      ...existing,
    } as Expense;

    const saved: Expense[] = [];
    const expenses = {
      findOne: jest.fn().mockResolvedValue(stored),
      save: jest.fn((e: Expense) => {
        saved.push(e);
        return Promise.resolve(e);
      }),
    } as unknown as Repository<Expense>;

    const categories = {
      existsBy: jest.fn().mockResolvedValue(true),
    } as unknown as Repository<ExpenseCategory>;

    return {
      service: new ExpensesService(expenses, categories),
      saved,
    };
  }

  it('moves an expense to another category', async () => {
    const { service, saved } = buildService({});

    await service.update('e1', { categoryId: 'cat-new' }, SHOP);

    expect(saved[0].categoryId).toBe('cat-new');
    // The stale relation must be dropped or it overrides the column.
    expect(saved[0].category).toBeNull();
  });

  it('clears the category when sent null', async () => {
    const { service, saved } = buildService({});

    await service.update('e1', { categoryId: null } as never, SHOP);

    expect(saved[0].categoryId).toBeNull();
    expect(saved[0].category).toBeNull();
  });

  it('leaves the category alone when the field is absent', async () => {
    const { service, saved } = buildService({});

    await service.update('e1', { title: 'Rent (September)' }, SHOP);

    expect(saved[0].title).toBe('Rent (September)');
    expect(saved[0].categoryId).toBe('cat-old');
    expect(saved[0].category).toEqual({ id: 'cat-old', name: 'Old' });
  });

  it('clears a note sent as null', async () => {
    const { service, saved } = buildService({ note: 'paid in cash' });

    await service.update('e1', { note: null } as never, SHOP);

    expect(saved[0].note).toBeNull();
  });
});
