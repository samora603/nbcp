export type RoleKind = "system_template" | "organization";

export interface Role {
  roleId: string;
  organizationId: string | null;
  key: string | null;
  name: string;
  kind: RoleKind;
  permissionKeys: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const ORGANIZATION_ADMINISTRATOR_ROLE_KEY = "organization.administrator";
