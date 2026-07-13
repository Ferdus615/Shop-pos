import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, ExpenseCategory])],
  // Categories controller first so /expenses/categories registers before /expenses/:id.
  controllers: [ExpenseCategoriesController, ExpensesController],
  providers: [ExpenseCategoriesService, ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
