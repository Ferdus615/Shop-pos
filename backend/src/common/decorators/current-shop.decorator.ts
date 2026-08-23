import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayloadUser } from '../interfaces/jwt-payload-user.interface';

/**
 * Inject the id of the shop the request acts within.
 *
 * Throws rather than returning null, so a shop-scoped handler can take a
 * plain `string` and never has to defend against an absent tenant. In
 * practice ShopContextGuard has already rejected those requests.
 */
export const CurrentShop = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayloadUser }>();
    const shopId = request.user?.shopId;
    if (!shopId) {
      throw new ForbiddenException('Your account is not attached to a shop');
    }
    return shopId;
  },
);
