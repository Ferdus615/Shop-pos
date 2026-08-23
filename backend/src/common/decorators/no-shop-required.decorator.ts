import { SetMetadata } from '@nestjs/common';

export const NO_SHOP_REQUIRED_KEY = 'noShopRequired';

/**
 * Mark a route that any authenticated user may call, with or without a shop.
 *
 * For identity endpoints like `GET /auth/me`: a platform administrator has no
 * shop, but still has to be able to ask who they are — otherwise the frontend
 * cannot restore their session on reload. Handlers marked with this must not
 * return shop-scoped data.
 */
export const NoShopRequired = () => SetMetadata(NO_SHOP_REQUIRED_KEY, true);
