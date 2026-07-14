export interface RoleAssignment {
  assignmentId: string;
  principalId: string;
  organizationId: string;
  roleId: string;
  locationId: string | null;
  assignedAt: string;
  assignedByPrincipalId: string | null;
}
