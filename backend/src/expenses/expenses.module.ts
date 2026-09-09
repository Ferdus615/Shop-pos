import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseItemsController } from './expense-items.controller';
import { ExpenseItemsService } from './expense-items.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, ExpenseCategory, ExpenseItem])],
  // Categories and items first, so /expenses/categories and /expenses/items
  // register before the /expenses/:id param route can swallow them.
  controllers: [
    ExpenseCategoriesController,
    ExpenseItemsController,
    ExpensesController,
  ],
  providers: [ExpenseCategoriesService, ExpenseItemsService, ExpensesService],
  exports: [ExpensesService, ExpenseItemsService],
})
export class ExpensesModule {}
