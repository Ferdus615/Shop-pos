import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { JwtPayloadUser } from '../interfaces/jwt-payload-user.interface';

/**
 * Backstop for tenant scoping. Runs after RolesGuard and refuses any request
 * that would reach shop data without a shop to scope it to.
 *
 * Services still filter by shopId themselves — this guard cannot see queries.
 * What it does guarantee is that no handler ever runs with an absent tenant,
 * so a missing `shopId` surfaces as a 403 rather than as a query that
 * silently spans every shop.
 */
@Injectable()
export class ShopContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayloadUser }>();
    if (!user) {
      return true; // Unauthenticated requests are JwtAuthGuard's business.
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const isPlatformRoute = requiredRoles.includes(Role.SUPER_ADMIN);

    if (user.role === Role.SUPER_ADMIN) {
      // Platform operators have no shop, so they must stay on platform routes.
      if (!isPlatformRoute) {
        throw new ForbiddenException(
          'Platform administrators cannot access shop data. Sign in as a shop user instead.',
        );
      }
      return true;
    }

    // A non-admin on a platform route was already rejected by RolesGuard.
    if (!user.shopId) {
      throw new ForbiddenException('Your account is not attached to a shop');
    }
    return true;
  }
}
