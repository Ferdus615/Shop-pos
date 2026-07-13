import { Role } from '../enums/role.enum';

/** Shape of the user object attached to the request after JWT validation. */
export interface JwtPayloadUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
