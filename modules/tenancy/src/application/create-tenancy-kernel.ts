import { createHash, randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { IdentityService } from "@nbcp/identity";
import { TenancyService } from "./tenancy-service.js";
import type { IdentityPrincipalLookup, TenancyRuntime } from "./ports.js";
import {
  InMemoryInvitationRepository,
  InMemoryMembershipRepository,
  InMemoryOrganizationRepository,
} from "../infrastructure/in-memory-store.js";

export interface CreateTenancyKernelOptions {
  identity: IdentityService;
  outboxStore?: InMemoryOutboxStore;
}

export interface TenancyKernel {
  service: TenancyService;
  outboxStore: InMemoryOutboxStore;
  organizations: InMemoryOrganizationRepository;
}

function identityLookup(identity: IdentityService): IdentityPrincipalLookup {
  return {
    async getUserById(principalId: string) {
      const user = await identity.getUserById(principalId);
      if (!user) {
        return null;
      }
      return {
        principalId: user.principalId,
        email: user.email,
        status: user.status,
      };
    },
    async isAuthenticationAllowed(principalId: string) {
      return identity.isAuthenticationAllowed(principalId);
    },
  };
}

export function createTenancyKernel(
  options: CreateTenancyKernelOptions,
): TenancyKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const organizations = new InMemoryOrganizationRepository();

  const runtime: TenancyRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    identity: identityLookup(options.identity),
    organizations,
    memberships: new InMemoryMembershipRepository(),
    invitations: new InMemoryInvitationRepository(),
    ids: {
      id: () => randomBytes(16).toString("hex"),
    },
    tokens: {
      token: () => randomBytes(32).toString("base64url"),
    },
    clock: {
      now: () => new Date().toISOString(),
    },
    hashToken: (raw: string) =>
      createHash("sha256").update(raw, "utf8").digest("hex"),
    invitationTtlHours: 72,
  };

  return {
    service: new TenancyService(runtime),
    outboxStore,
    organizations,
  };
}
