import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ShopContextGuard } from './common/guards/shop-context.guard';
import { buildDataSourceOptions } from './config/data-source-options';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PrintingModule } from './printing/printing.module';
import { ShopsModule } from './shops/shops.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /**
     * A ceiling on requests per IP. It exists for `POST /auth/login` above
     * all: without it, the only thing standing between a guessed password and
     * a shop's takings is how fast an attacker can send requests.
     */
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'long', ttl: 60_000, limit: 120 },
    ]),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(),
        autoLoadEntities: true,
      }),
    }),
    ShopsModule,
    UsersModule,
    AuthModule,
    MenuModule,
    OrdersModule,
    PrintingModule,
    ExpensesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    // Rate limiting first: a throttled request should not reach the database
    // to have its password checked.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global JWT authentication (skipped on @Public routes)...
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ...then role-based authorization...
    { provide: APP_GUARD, useClass: RolesGuard },
    // ...and finally: no handler runs without a tenant to scope it to.
    { provide: APP_GUARD, useClass: ShopContextGuard },
    // Strip @Exclude()'d fields (e.g. password hash) from all responses.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
