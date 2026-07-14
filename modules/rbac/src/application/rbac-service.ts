import { randomUUID } from "node:crypto";
import type { UnitOfWork, DomainEventEnvelope } from "@nbcp/outbox";
import type { RbacRuntime } from "./ports.js";
import type { PermissionRecord } from "../domain/permission.js";
import {
  isValidPermissionKey,
} from "../domain/permission.js";
import type { Role } from "../domain/role.js";
import {
  ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
} from "../domain/role.js";
import type { RoleAssignment } from "../domain/assignment.js";
import { allow, deny, type AuthzDecision } from "../domain/authz.js";
import { RbacEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import {
  CORE_PERMISSION_SEEDS,
  ORGANIZATION_ADMINISTRATOR_PERMISSIONS,
} from "./catalog-seeds.js";
import { RbacPermissions } from "./permissions.js";

/**
 * RBAC application facade (WP-04).
 * Depends on Identity + Tenancy via narrow ports only.
 */
export class RbacService {
  constructor(private readonly runtime: RbacRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    organizationId: string | null,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "rbac",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requirePermissionKeys(keys: string[]): Promise<void> {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isValidPermissionKey(key)) {
        throw new ValidationError(`invalid permission key: ${key}`);
      }
      const perm = await this.runtime.permissions.findByKey(key);
      if (!perm) {
        throw new ValidationError(`unknown permission: ${key}`);
      }
      if (perm.deprecatedAt) {
        throw new ValidationError(`permission deprecated: ${key}`);
      }
    }
  }

  private async requireActiveMembership(
    organizationId: string,
    principalId: string,
  ): Promise<void> {
    const membership = await this.runtime.tenancy.getMembership(
      organizationId,
      principalId,
    );
    if (!membership) {
      throw new ValidationError("active membership required");
    }
    if (membership.state !== "active") {
      throw new ValidationError("membership inactive");
    }
  }

  private async requireLocationInOrg(
    organizationId: string,
    locationId: string,
  ): Promise<void> {
    const locations = await this.runtime.tenancy.listLocations(organizationId);
    const loc = locations.find((l) => l.locationId === locationId);
    if (!loc || loc.status !== "active") {
      throw new ValidationError("location not active in organization");
    }
  }

  private async actorMayManageAssignments(input: {
    actorPrincipalId: string | null;
    organizationId: string;
    bootstrap: boolean;
  }): Promise<void> {
    if (input.bootstrap) {
      return;
    }
    if (!input.actorPrincipalId) {
      throw new AuthorizationError("actor required for role assignment");
    }
    const decision = await this.authorize({
      principalId: input.actorPrincipalId,
      permissionKey: RbacPermissions.AssignmentManage,
      organizationId: input.organizationId,
    });
    if (!decision.allowed) {
      throw new AuthorizationError("rbac.assignment.manage required");
    }
  }

  /**
   * Seeds Core catalog permissions and `organization.administrator` system template.
   * Idempotent.
   */
  async seedCoreCatalog(): Promise<void> {
    const uow = this.runtime.uowFactory.start();
    const now = this.runtime.clock.now();

    for (const seed of CORE_PERMISSION_SEEDS) {
      const existing = await this.runtime.permissions.findByKey(seed.key);
      if (existing) continue;
      const permission: PermissionRecord = {
        key: seed.key,
        description: seed.description,
        packId: null,
        deprecatedAt: null,
        createdAt: now,
      };
      await this.runtime.permissions.save(uow, permission);
      this.publish(uow, RbacEventTypes.PermissionRegistered, null, {
        permissionKey: seed.key,
        description: seed.description,
        packId: null,
      });
    }

    const adminTemplate = await this.runtime.roles.findByKey(
      ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
      null,
    );
    if (!adminTemplate) {
      await this.requirePermissionKeys([
        ...ORGANIZATION_ADMINISTRATOR_PERMISSIONS,
      ]);
      const role: Role = {
        roleId: this.runtime.ids.id(),
        organizationId: null,
        key: ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
        name: "Organization Administrator",
        kind: "system_template",
        permissionKeys: [...ORGANIZATION_ADMINISTRATOR_PERMISSIONS],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await this.runtime.roles.save(uow, role);
      this.publish(uow, RbacEventTypes.RoleCreated, null, {
        roleId: role.roleId,
        organizationId: null,
        key: role.key,
        name: role.name,
        kind: role.kind,
        permissionKeys: role.permissionKeys,
      });
    }

    await uow.commit();
  }

  async registerPermission(input: {
    key: string;
    description: string;
    packId?: string | null;
  }): Promise<PermissionRecord> {
    if (!isValidPermissionKey(input.key)) {
      throw new ValidationError(`invalid permission key: ${input.key}`);
    }
    const existing = await this.runtime.permissions.findByKey(input.key);
    if (existing) {
      throw new ConflictError(`permission already registered: ${input.key}`);
    }
    const uow = this.runtime.uowFactory.start();
    const permission: PermissionRecord = {
      key: input.key,
      description: input.description,
      packId: input.packId ?? null,
      deprecatedAt: null,
      createdAt: this.runtime.clock.now(),
    };
    await this.runtime.permissions.save(uow, permission);
    this.publish(uow, RbacEventTypes.PermissionRegistered, null, {
      permissionKey: permission.key,
      description: permission.description,
      packId: permission.packId,
    });
    await uow.commit();
    return permission;
  }

  async deprecatePermission(input: { key: string }): Promise<PermissionRecord> {
    const permission = await this.runtime.permissions.findByKey(input.key);
    if (!permission) {
      throw new NotFoundError(`permission not found: ${input.key}`);
    }
    if (permission.deprecatedAt) {
      return permission;
    }
    const uow = this.runtime.uowFactory.start();
    const updated: PermissionRecord = {
      ...permission,
      deprecatedAt: this.runtime.clock.now(),
    };
    await this.runtime.permissions.save(uow, updated);
    this.publish(uow, RbacEventTypes.PermissionDeprecated, null, {
      permissionKey: updated.key,
      deprecatedAt: updated.deprecatedAt,
    });
    await uow.commit();
    return updated;
  }

  async listPermissions(): Promise<PermissionRecord[]> {
    return this.runtime.permissions.listAll();
  }

  async createRole(input: {
    organizationId: string;
    name: string;
    permissionKeys: string[];
    key?: string;
  }): Promise<Role> {
    if (!input.name?.trim()) {
      throw new ValidationError("name required");
    }
    await this.requirePermissionKeys(input.permissionKeys);
    if (input.key) {
      const clash = await this.runtime.roles.findByKey(
        input.key,
        input.organizationId,
      );
      if (clash) {
        throw new ConflictError(`role key already exists: ${input.key}`);
      }
    }
    const existing = await this.runtime.roles.listForOrganization(
      input.organizationId,
    );
    if (existing.some((r) => r.name === input.name.trim())) {
      throw new ConflictError("role name already exists in organization");
    }

    const uow = this.runtime.uowFactory.start();
    const now = this.runtime.clock.now();
    const role: Role = {
      roleId: this.runtime.ids.id(),
      organizationId: input.organizationId,
      key: input.key ?? null,
      name: input.name.trim(),
      kind: "organization",
      permissionKeys: [...new Set(input.permissionKeys)],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.runtime.roles.save(uow, role);
    this.publish(uow, RbacEventTypes.RoleCreated, input.organizationId, {
      roleId: role.roleId,
      organizationId: role.organizationId,
      key: role.key,
      name: role.name,
      kind: role.kind,
      permissionKeys: role.permissionKeys,
    });
    await uow.commit();
    return role;
  }

  async updateRolePermissions(input: {
    roleId: string;
    permissionKeys: string[];
  }): Promise<Role> {
    const role = await this.runtime.roles.findById(input.roleId);
    if (!role || role.deletedAt) {
      throw new NotFoundError(`role not found: ${input.roleId}`);
    }
    if (role.kind === "system_template") {
      throw new ValidationError("system template roles are immutable");
    }
    await this.requirePermissionKeys(input.permissionKeys);
    const uow = this.runtime.uowFactory.start();
    const updated: Role = {
      ...role,
      permissionKeys: [...new Set(input.permissionKeys)],
      updatedAt: this.runtime.clock.now(),
    };
    await this.runtime.roles.save(uow, updated);
    this.publish(uow, RbacEventTypes.RoleUpdated, role.organizationId, {
      roleId: updated.roleId,
      organizationId: updated.organizationId,
      permissionKeys: updated.permissionKeys,
    });
    await uow.commit();
    return updated;
  }

  async deleteRole(input: { roleId: string }): Promise<void> {
    const role = await this.runtime.roles.findById(input.roleId);
    if (!role || role.deletedAt) {
      throw new NotFoundError(`role not found: ${input.roleId}`);
    }
    if (role.kind === "system_template") {
      throw new ValidationError("system template roles cannot be deleted");
    }
    const uow = this.runtime.uowFactory.start();
    const now = this.runtime.clock.now();
    const updated: Role = { ...role, deletedAt: now, updatedAt: now };
    await this.runtime.roles.save(uow, updated);
    const assignments = await this.runtime.assignments.listForRole(role.roleId);
    for (const assignment of assignments) {
      await this.runtime.assignments.delete(uow, assignment.assignmentId);
      this.publish(
        uow,
        RbacEventTypes.RoleAssignmentRevoked,
        assignment.organizationId,
        {
          assignmentId: assignment.assignmentId,
          principalId: assignment.principalId,
          organizationId: assignment.organizationId,
          roleId: assignment.roleId,
          locationId: assignment.locationId,
        },
      );
    }
    this.publish(uow, RbacEventTypes.RoleDeleted, role.organizationId, {
      roleId: role.roleId,
      organizationId: role.organizationId,
    });
    await uow.commit();
  }

  async getRole(roleId: string): Promise<Role | null> {
    const role = await this.runtime.roles.findById(roleId);
    if (!role || role.deletedAt) return null;
    return role;
  }

  async listRoles(organizationId: string): Promise<Role[]> {
    const orgRoles = await this.runtime.roles.listForOrganization(organizationId);
    const templates = await this.runtime.roles.listSystemTemplates();
    return [...templates, ...orgRoles];
  }

  /**
   * Ensures system templates are available for the organization context.
   * Templates are global; this is a no-op seed check + returns admin template.
   */
  async ensureSystemRoles(organizationId: string): Promise<Role[]> {
    void organizationId;
    const templates = await this.runtime.roles.listSystemTemplates();
    if (!templates.some((t) => t.key === ORGANIZATION_ADMINISTRATOR_ROLE_KEY)) {
      await this.seedCoreCatalog();
      return this.runtime.roles.listSystemTemplates();
    }
    return templates;
  }

  async assignRole(input: {
    principalId: string;
    organizationId: string;
    roleId: string;
    locationId?: string | null;
    assignedByPrincipalId?: string | null;
    /** Bootstrap exception: skip `rbac.assignment.manage` check (org admin on create). */
    bootstrap?: boolean;
  }): Promise<RoleAssignment> {
    const locationId = input.locationId ?? null;
    await this.requireActiveMembership(input.organizationId, input.principalId);
    if (locationId) {
      await this.requireLocationInOrg(input.organizationId, locationId);
    }
    const role = await this.runtime.roles.findById(input.roleId);
    if (!role || role.deletedAt) {
      throw new NotFoundError(`role not found: ${input.roleId}`);
    }
    if (
      role.organizationId !== null &&
      role.organizationId !== input.organizationId
    ) {
      throw new ValidationError("role does not belong to organization");
    }

    await this.actorMayManageAssignments({
      actorPrincipalId: input.assignedByPrincipalId ?? null,
      organizationId: input.organizationId,
      bootstrap: input.bootstrap === true,
    });

    const existing = await this.runtime.assignments.findUnique({
      principalId: input.principalId,
      organizationId: input.organizationId,
      roleId: input.roleId,
      locationId,
    });
    if (existing) {
      throw new ConflictError("role assignment already exists");
    }

    const principal = await this.runtime.identity.getUserById(input.principalId);
    if (!principal) {
      throw new NotFoundError(`principal not found: ${input.principalId}`);
    }

    const uow = this.runtime.uowFactory.start();
    const assignment: RoleAssignment = {
      assignmentId: this.runtime.ids.id(),
      principalId: input.principalId,
      organizationId: input.organizationId,
      roleId: input.roleId,
      locationId,
      assignedAt: this.runtime.clock.now(),
      assignedByPrincipalId: input.assignedByPrincipalId ?? null,
    };
    await this.runtime.assignments.save(uow, assignment);
    this.publish(
      uow,
      RbacEventTypes.RoleAssignmentGranted,
      input.organizationId,
      {
        assignmentId: assignment.assignmentId,
        principalId: assignment.principalId,
        organizationId: assignment.organizationId,
        roleId: assignment.roleId,
        roleKey: role.key,
        locationId: assignment.locationId,
        assignedByPrincipalId: assignment.assignedByPrincipalId,
        bootstrap: input.bootstrap === true,
      },
    );
    await uow.commit();
    return assignment;
  }

  async revokeRole(input: {
    principalId: string;
    organizationId: string;
    roleId: string;
    locationId?: string | null;
    actorPrincipalId?: string | null;
  }): Promise<void> {
    const locationId = input.locationId ?? null;
    await this.actorMayManageAssignments({
      actorPrincipalId: input.actorPrincipalId ?? null,
      organizationId: input.organizationId,
      bootstrap: false,
    });
    const assignment = await this.runtime.assignments.findUnique({
      principalId: input.principalId,
      organizationId: input.organizationId,
      roleId: input.roleId,
      locationId,
    });
    if (!assignment) {
      throw new NotFoundError("role assignment not found");
    }
    const uow = this.runtime.uowFactory.start();
    await this.runtime.assignments.delete(uow, assignment.assignmentId);
    this.publish(
      uow,
      RbacEventTypes.RoleAssignmentRevoked,
      input.organizationId,
      {
        assignmentId: assignment.assignmentId,
        principalId: assignment.principalId,
        organizationId: assignment.organizationId,
        roleId: assignment.roleId,
        locationId: assignment.locationId,
      },
    );
    await uow.commit();
  }

  async changeAssignmentScope(input: {
    assignmentId: string;
    locationId: string | null;
    actorPrincipalId: string;
  }): Promise<RoleAssignment> {
    const assignment = await this.runtime.assignments.findById(
      input.assignmentId,
    );
    if (!assignment) {
      throw new NotFoundError("role assignment not found");
    }
    await this.actorMayManageAssignments({
      actorPrincipalId: input.actorPrincipalId,
      organizationId: assignment.organizationId,
      bootstrap: false,
    });
    if (input.locationId) {
      await this.requireLocationInOrg(
        assignment.organizationId,
        input.locationId,
      );
    }
    const clash = await this.runtime.assignments.findUnique({
      principalId: assignment.principalId,
      organizationId: assignment.organizationId,
      roleId: assignment.roleId,
      locationId: input.locationId,
    });
    if (clash && clash.assignmentId !== assignment.assignmentId) {
      throw new ConflictError("target assignment scope already exists");
    }
    const previousLocationId = assignment.locationId;
    const uow = this.runtime.uowFactory.start();
    const updated: RoleAssignment = {
      ...assignment,
      locationId: input.locationId,
    };
    await this.runtime.assignments.save(uow, updated);
    this.publish(
      uow,
      RbacEventTypes.RoleAssignmentScopeChanged,
      assignment.organizationId,
      {
        assignmentId: updated.assignmentId,
        previousLocationId,
        locationId: updated.locationId,
      },
    );
    await uow.commit();
    return updated;
  }

  async listAssignmentsForPrincipal(input: {
    principalId: string;
    organizationId: string;
  }): Promise<RoleAssignment[]> {
    return this.runtime.assignments.listForPrincipal(
      input.principalId,
      input.organizationId,
    );
  }

  async listAssignmentsForRole(roleId: string): Promise<RoleAssignment[]> {
    return this.runtime.assignments.listForRole(roleId);
  }

  /**
   * Deny-by-default authorization (no owner bypass without assignment).
   */
  async authorize(input: {
    principalId: string;
    permissionKey: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<AuthzDecision> {
    const permission = await this.runtime.permissions.findByKey(
      input.permissionKey,
    );
    if (!permission) {
      return deny("permission_unknown");
    }

    const membership = await this.runtime.tenancy.getMembership(
      input.organizationId,
      input.principalId,
    );
    if (!membership) {
      return deny("not_a_member");
    }
    if (membership.state !== "active") {
      return deny("membership_inactive");
    }

    const requestLocationId = input.locationId ?? null;
    if (requestLocationId) {
      const locations = await this.runtime.tenancy.listLocations(
        input.organizationId,
      );
      const loc = locations.find((l) => l.locationId === requestLocationId);
      if (!loc) {
        return deny("location_invalid");
      }
    }

    const assignments = await this.runtime.assignments.listForPrincipal(
      input.principalId,
      input.organizationId,
    );

    let sawPermissionAtOtherLocation = false;
    for (const assignment of assignments) {
      const role = await this.runtime.roles.findById(assignment.roleId);
      if (!role || role.deletedAt) continue;
      if (!role.permissionKeys.includes(input.permissionKey)) continue;

      // Org-wide assignment grants any location (and org-wide requests).
      if (assignment.locationId === null) {
        return allow();
      }
      // Location-scoped: only when request location matches exactly.
      if (
        requestLocationId !== null &&
        assignment.locationId === requestLocationId
      ) {
        return allow();
      }
      if (assignment.locationId !== null) {
        sawPermissionAtOtherLocation = true;
      }
    }

    if (requestLocationId !== null && sawPermissionAtOtherLocation) {
      return deny("location_out_of_scope");
    }

    return deny("permission_denied");
  }

  async requireAuthorized(input: {
    principalId: string;
    permissionKey: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<void> {
    const decision = await this.authorize(input);
    if (!decision.allowed) {
      throw new AuthorizationError(
        `denied: ${decision.reason ?? "permission_denied"}`,
      );
    }
  }

  async listEffectivePermissions(input: {
    principalId: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<string[]> {
    const membership = await this.runtime.tenancy.getMembership(
      input.organizationId,
      input.principalId,
    );
    if (!membership || membership.state !== "active") {
      return [];
    }
    const requestLocationId = input.locationId ?? null;
    const assignments = await this.runtime.assignments.listForPrincipal(
      input.principalId,
      input.organizationId,
    );
    const keys = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.locationId !== null) {
        if (requestLocationId === null) continue;
        if (assignment.locationId !== requestLocationId) continue;
      }
      const role = await this.runtime.roles.findById(assignment.roleId);
      if (!role || role.deletedAt) continue;
      for (const key of role.permissionKeys) {
        keys.add(key);
      }
    }
    return [...keys].sort();
  }

  /**
   * App-composer bootstrap after org create (not Tenancy→RBAC cycle).
   * Grants `organization.administrator` to owner without prior assignment.manage.
   */
  async bootstrapOrganizationAdministrator(input: {
    organizationId: string;
    ownerPrincipalId: string;
  }): Promise<RoleAssignment> {
    await this.ensureSystemRoles(input.organizationId);
    const admin =
      (await this.runtime.roles.findByKey(
        ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
        null,
      )) ??
      (await this.runtime.roles.findByKey(
        ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
        input.organizationId,
      ));
    if (!admin) {
      throw new NotFoundError("organization.administrator role missing");
    }

    const existing = await this.runtime.assignments.findUnique({
      principalId: input.ownerPrincipalId,
      organizationId: input.organizationId,
      roleId: admin.roleId,
      locationId: null,
    });
    if (existing) {
      return existing;
    }

    return this.assignRole({
      principalId: input.ownerPrincipalId,
      organizationId: input.organizationId,
      roleId: admin.roleId,
      locationId: null,
      assignedByPrincipalId: null,
      bootstrap: true,
    });
  }
}
