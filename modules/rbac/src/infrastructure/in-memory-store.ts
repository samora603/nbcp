import type { UnitOfWork } from "@nbcp/outbox";
import type { PermissionRecord } from "../domain/permission.js";
import type { Role } from "../domain/role.js";
import type { RoleAssignment } from "../domain/assignment.js";
import type {
  AssignmentRepository,
  PermissionRepository,
  RoleRepository,
} from "../application/ports.js";

export class InMemoryPermissionRepository implements PermissionRepository {
  private readonly byKey = new Map<string, PermissionRecord>();

  async save(_uow: UnitOfWork, permission: PermissionRecord): Promise<void> {
    this.byKey.set(permission.key, structuredClone(permission));
  }

  async findByKey(key: string): Promise<PermissionRecord | null> {
    const p = this.byKey.get(key);
    return p ? structuredClone(p) : null;
  }

  async listAll(): Promise<PermissionRecord[]> {
    return [...this.byKey.values()].map((p) => structuredClone(p));
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  private readonly byId = new Map<string, Role>();

  async save(_uow: UnitOfWork, role: Role): Promise<void> {
    this.byId.set(role.roleId, structuredClone(role));
  }

  async findById(roleId: string): Promise<Role | null> {
    const r = this.byId.get(roleId);
    return r ? structuredClone(r) : null;
  }

  async findByKey(
    key: string,
    organizationId: string | null,
  ): Promise<Role | null> {
    for (const role of this.byId.values()) {
      if (role.deletedAt) continue;
      if (role.key !== key) continue;
      if (role.organizationId === organizationId) {
        return structuredClone(role);
      }
    }
    return null;
  }

  async listForOrganization(organizationId: string): Promise<Role[]> {
    return [...this.byId.values()]
      .filter((r) => !r.deletedAt && r.organizationId === organizationId)
      .map((r) => structuredClone(r));
  }

  async listSystemTemplates(): Promise<Role[]> {
    return [...this.byId.values()]
      .filter((r) => !r.deletedAt && r.kind === "system_template")
      .map((r) => structuredClone(r));
  }
}

function assignmentKey(a: {
  principalId: string;
  organizationId: string;
  roleId: string;
  locationId: string | null;
}): string {
  return `${a.principalId}|${a.organizationId}|${a.roleId}|${a.locationId ?? ""}`;
}

export class InMemoryAssignmentRepository implements AssignmentRepository {
  private readonly byId = new Map<string, RoleAssignment>();
  private readonly unique = new Map<string, string>();

  async save(_uow: UnitOfWork, assignment: RoleAssignment): Promise<void> {
    const existing = this.byId.get(assignment.assignmentId);
    if (existing) {
      this.unique.delete(assignmentKey(existing));
    }
    this.byId.set(assignment.assignmentId, structuredClone(assignment));
    this.unique.set(assignmentKey(assignment), assignment.assignmentId);
  }

  async delete(_uow: UnitOfWork, assignmentId: string): Promise<void> {
    const existing = this.byId.get(assignmentId);
    if (existing) {
      this.unique.delete(assignmentKey(existing));
      this.byId.delete(assignmentId);
    }
  }

  async findById(assignmentId: string): Promise<RoleAssignment | null> {
    const a = this.byId.get(assignmentId);
    return a ? structuredClone(a) : null;
  }

  async findUnique(input: {
    principalId: string;
    organizationId: string;
    roleId: string;
    locationId: string | null;
  }): Promise<RoleAssignment | null> {
    const id = this.unique.get(assignmentKey(input));
    if (!id) return null;
    return this.findById(id);
  }

  async listForPrincipal(
    principalId: string,
    organizationId: string,
  ): Promise<RoleAssignment[]> {
    return [...this.byId.values()]
      .filter(
        (a) =>
          a.principalId === principalId && a.organizationId === organizationId,
      )
      .map((a) => structuredClone(a));
  }

  async listForRole(roleId: string): Promise<RoleAssignment[]> {
    return [...this.byId.values()]
      .filter((a) => a.roleId === roleId)
      .map((a) => structuredClone(a));
  }
}
