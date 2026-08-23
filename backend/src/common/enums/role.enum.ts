export enum Role {
  /**
   * Platform operator. Belongs to no shop — creates and manages shops and
   * their owners, and has no access to any shop's trading data.
   */
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}
