import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { buildDataSourceOptions } from './config/data-source-options';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(),
        autoLoadEntities: true,
      }),
    }),
    UsersModule,
    AuthModule,
    MenuModule,
    OrdersModule,
    ExpensesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    // Global JWT authentication (skipped on @Public routes)...
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ...then role-based authorization.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Strip @Exclude()'d fields (e.g. password hash) from all responses.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
