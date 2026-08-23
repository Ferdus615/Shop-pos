import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NO_SHOP_REQUIRED_KEY } from '../decorators/no-shop-required.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { JwtPayloadUser } from '../interfaces/jwt-payload-user.interface';
import { ShopContextGuard } from './shop-context.guard';

function buildContext(user?: Partial<JwtPayloadUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** Stands in for route metadata: what @Public()/@Roles() would have set. */
function buildReflector(metadata: {
  isPublic?: boolean;
  roles?: Role[];
  noShopRequired?: boolean;
}): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return metadata.isPublic;
      if (key === NO_SHOP_REQUIRED_KEY) return metadata.noShopRequired;
      return metadata.roles;
    },
  } as unknown as Reflector;
}

const shopUser = (over: Partial<JwtPayloadUser> = {}): JwtPayloadUser => ({
  id: 'u1',
  email: 'staff@shop.local',
  name: 'Staff',
  role: Role.STAFF,
  shopId: 'shop-1',
  ...over,
});

describe('ShopContextGuard', () => {
  it('allows a shop user on a shop route', () => {
    const guard = new ShopContextGuard(buildReflector({}));
    expect(guard.canActivate(buildContext(shopUser()))).toBe(true);
  });

  it('rejects a shop user whose account has no shop', () => {
    const guard = new ShopContextGuard(buildReflector({}));
    expect(() =>
      guard.canActivate(buildContext(shopUser({ shopId: null }))),
    ).toThrow(ForbiddenException);
  });

  it('rejects a platform admin reaching for shop data', () => {
    const guard = new ShopContextGuard(buildReflector({ roles: [Role.OWNER] }));
    const admin = shopUser({ role: Role.SUPER_ADMIN, shopId: null });
    expect(() => guard.canActivate(buildContext(admin))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a platform admin on a platform route', () => {
    const guard = new ShopContextGuard(
      buildReflector({ roles: [Role.SUPER_ADMIN] }),
    );
    const admin = shopUser({ role: Role.SUPER_ADMIN, shopId: null });
    expect(guard.canActivate(buildContext(admin))).toBe(true);
  });

  // Regression: without this, a platform admin got 403 from GET /auth/me and
  // the frontend could not restore their session — every refresh bounced them
  // back to the login page.
  it('lets a platform admin call an identity route that needs no shop', () => {
    const guard = new ShopContextGuard(
      buildReflector({ noShopRequired: true }),
    );
    const admin = shopUser({ role: Role.SUPER_ADMIN, shopId: null });
    expect(guard.canActivate(buildContext(admin))).toBe(true);
  });

  it('leaves public routes alone', () => {
    const guard = new ShopContextGuard(buildReflector({ isPublic: true }));
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });
});
