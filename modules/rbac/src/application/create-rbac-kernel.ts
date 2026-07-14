import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { IdentityService } from "@nbcp/identity";
import type { TenancyService } from "@nbcp/tenancy";
import { RbacService } from "./rbac-service.js";
import type {
  IdentityPrincipalLookup,
  RbacRuntime,
  TenancyAuthzLookup,
} from "./ports.js";
import {
  InMemoryAssignmentRepository,
  InMemoryPermissionRepository,
  InMemoryRoleRepository,
} from "../infrastructure/in-memory-store.js";

export interface CreateRbacKernelOptions {
  identity: IdentityService;
  tenancy: TenancyService;
  outboxStore?: InMemoryOutboxStore;
  /** When true (default), seed Core catalog + org admin template. */
  seedCatalog?: boolean;
}

export interface RbacKernel {
  service: RbacService;
  outboxStore: InMemoryOutboxStore;
  permissions: InMemoryPermissionRepository;
  roles: InMemoryRoleRepository;
  assignments: InMemoryAssignmentRepository;
  /** Resolves when catalog seed completes (if enabled). */
  ready: Promise<void>;
}

function identityLookup(identity: IdentityService): IdentityPrincipalLookup {
  return {
    async getUserById(principalId: string) {
      const user = await identity.getUserById(principalId);
      if (!user) return null;
      return {
        principalId: user.principalId,
        email: user.email,
        status: user.status,
      };
    },
  };
}

function tenancyLookup(tenancy: TenancyService): TenancyAuthzLookup {
  return {
    async getMembership(organizationId, principalId) {
      const m = await tenancy.getMembership(organizationId, principalId);
      if (!m) return null;
      return {
        organizationId: m.organizationId,
        principalId: m.principalId,
        state: m.state,
        locationId: m.locationId,
      };
    },
    async listLocations(organizationId) {
      const locs = await tenancy.listLocations(organizationId);
      return locs.map((l) => ({
        locationId: l.locationId,
        status: l.status,
      }));
    },
  };
}

export function createRbacKernel(
  options: CreateRbacKernelOptions,
): RbacKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const permissions = new InMemoryPermissionRepository();
  const roles = new InMemoryRoleRepository();
  const assignments = new InMemoryAssignmentRepository();

  const runtime: RbacRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    identity: identityLookup(options.identity),
    tenancy: tenancyLookup(options.tenancy),
    permissions,
    roles,
    assignments,
    ids: {
      id: () => randomBytes(16).toString("hex"),
    },
    clock: {
      now: () => new Date().toISOString(),
    },
  };

  const service = new RbacService(runtime);
  const ready =
    options.seedCatalog === false
      ? Promise.resolve()
      : service.seedCoreCatalog();

  return {
    service,
    outboxStore,
    permissions,
    roles,
    assignments,
    ready,
  };
}
