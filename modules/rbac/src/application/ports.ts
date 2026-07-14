import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { PermissionRecord } from "../domain/permission.js";
import type { Role } from "../domain/role.js";
import type { RoleAssignment } from "../domain/assignment.js";

/**
 * Narrow Identity facade — no Identity internals.
 */
export interface IdentityPrincipalLookup {
  getUserById(principalId: string): Promise<{
    principalId: string;
    email: string;
    status: string;
  } | null>;
}

/**
 * Narrow Tenancy facade — membership + location checks only.
 */
export interface TenancyAuthzLookup {
  getMembership(
    organizationId: string,
    principalId: string,
  ): Promise<{
    organizationId: string;
    principalId: string;
    state: string;
    locationId: string | null;
  } | null>;
  listLocations(organizationId: string): Promise<
    Array<{
      locationId: string;
      status: string;
    }>
  >;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  id(): string;
}

export interface PermissionRepository {
  save(uow: UnitOfWork, permission: PermissionRecord): Promise<void>;
  findByKey(key: string): Promise<PermissionRecord | null>;
  listAll(): Promise<PermissionRecord[]>;
}

export interface RoleRepository {
  save(uow: UnitOfWork, role: Role): Promise<void>;
  findById(roleId: string): Promise<Role | null>;
  findByKey(key: string, organizationId: string | null): Promise<Role | null>;
  listForOrganization(organizationId: string): Promise<Role[]>;
  listSystemTemplates(): Promise<Role[]>;
}

export interface AssignmentRepository {
  save(uow: UnitOfWork, assignment: RoleAssignment): Promise<void>;
  delete(uow: UnitOfWork, assignmentId: string): Promise<void>;
  findById(assignmentId: string): Promise<RoleAssignment | null>;
  findUnique(input: {
    principalId: string;
    organizationId: string;
    roleId: string;
    locationId: string | null;
  }): Promise<RoleAssignment | null>;
  listForPrincipal(
    principalId: string,
    organizationId: string,
  ): Promise<RoleAssignment[]>;
  listForRole(roleId: string): Promise<RoleAssignment[]>;
}

export interface RbacRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  identity: IdentityPrincipalLookup;
  tenancy: TenancyAuthzLookup;
  permissions: PermissionRepository;
  roles: RoleRepository;
  assignments: AssignmentRepository;
  ids: IdGenerator;
  clock: Clock;
}
