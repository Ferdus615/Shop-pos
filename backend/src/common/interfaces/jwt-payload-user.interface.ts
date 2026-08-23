import { Role } from '../enums/role.enum';

/** Shape of the user object attached to the request after JWT validation. */
export interface JwtPayloadUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Tenant the request acts within. NULL only for SUPER_ADMIN. */
  shopId: string | null;
}
