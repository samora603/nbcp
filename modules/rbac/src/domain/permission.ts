export const PERMISSION_KEY_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export interface PermissionRecord {
  key: string;
  description: string;
  packId: string | null;
  deprecatedAt: string | null;
  createdAt: string;
}

export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_KEY_PATTERN.test(key);
}
