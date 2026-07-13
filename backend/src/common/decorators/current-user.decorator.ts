import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadUser } from '../interfaces/jwt-payload-user.interface';

/**
 * Inject the authenticated user (populated by JwtStrategy) into a handler.
 * Pass a key to pull a single field, e.g. @CurrentUser('id').
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayloadUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayloadUser = request.user;
    return data ? user?.[data] : user;
  },
);
